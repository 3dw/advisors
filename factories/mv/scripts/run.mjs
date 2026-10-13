import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, realpath, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));

async function main() {
  if (process.platform !== 'darwin') {
    throw new Error('此執行入口只支援 macOS sandbox-exec；不會降級為未隔離執行。');
  }
  if (process.env.PUPPETEER_DANGEROUS_NO_SANDBOX === 'true') {
    throw new Error('不可透過 PUPPETEER_DANGEROUS_NO_SANDBOX 停用 Chrome sandbox。');
  }
  if (process.argv.length < 5) {
    throw new Error('用法：npm run render -- projects/demo assets/music.wav output/movie.mp4 [--fps 30] [--width 1280] [--height 720]');
  }
  const lock = JSON.parse(await readFile(join(root, 'tools.lock.json'), 'utf8'));
  for (const [name, tool] of Object.entries(lock.tools)) {
    const path = await realpath(tool.path);
    const digest = createHash('sha256').update(await readFile(path)).digest('hex');
    if (digest !== tool.sha256) throw new Error(`${name} 執行檔與審閱時的固定版本不同，請先重新審閱並更新 tools.lock.json。`);
  }
  if (await realpath(process.execPath) !== lock.tools.node.path || process.version !== lock.tools.node.version) {
    throw new Error('請使用 tools.lock.json 指定的 Node 版本與執行檔。');
  }
  const runtime = join(root, '.runtime');
  await mkdir(runtime, { recursive: true });
  if (await realpath(runtime) !== runtime) throw new Error('.runtime 不可是外部連結。');
  const home = join(runtime, 'home');
  const temp = join(runtime, 'tmp');
  await mkdir(home, { recursive: true });
  await mkdir(temp, { recursive: true });
  if (await realpath(home) !== home || await realpath(temp) !== temp) throw new Error('隔離 HOME/TMPDIR 不可是外部連結。');

  // 拒絕其他家目錄、外接磁碟、系統暫存與 keychain；mv 與 Node 本體例外。
  // 不提供既有 HOME、cookies、憑證環境變數；只允許 loopback 網路。
  const quote = value => JSON.stringify(value);
  const nodeDir = dirname(lock.tools.node.path);
  const profile = `(version 1)
(allow default)
(deny file-read* (subpath "/Users") (subpath "/Volumes") (subpath "/System/Volumes/Data/Users")
  (subpath "/private/tmp") (subpath "/private/var/folders") (subpath "/private/var/root")
  (subpath "/Library/Keychains"))
(allow file-read-metadata)
(allow file-read* (subpath ${quote(root)}) (subpath ${quote(nodeDir)}))
(deny file-write*)
(allow file-write* (subpath ${quote(root)}) (literal "/dev/null"))
(deny network*)
(allow network-inbound (local ip "localhost:*"))
(allow network-bind (local ip "localhost:*"))
(allow network-outbound (remote ip "localhost:*"))
(allow network-bind network-inbound (local unix-socket (subpath ${quote(root)})))
(allow network-outbound (remote unix-socket (subpath ${quote(root)})))
`;
  await writeFile(join(runtime, 'sandbox.sb'), profile, { mode: 0o600 });
  const env = {
    PATH: `${dirname(lock.tools.ffmpeg.path)}:/usr/bin:/bin`,
    HOME: home,
    TMPDIR: `${temp}/`,
    MAC_CHROMIUM_TMPDIR: temp,
    LANG: 'en_US.UTF-8',
    NODE_DISABLE_COMPILE_CACHE: '1',
    MV_SANDBOXED: '1',
    MV_FFMPEG_PATH: lock.tools.ffmpeg.path,
    MV_FFPROBE_PATH: lock.tools.ffprobe.path,
  };
  // macOS 不允許嵌套初始化 sandbox；獨立 headless-shell 保留原生 sandbox，
  // 控制器／FFmpeg 另受 sandbox-exec 限制。瀏覽器不是 OS 全目錄隔離。
  const session = await mkdtemp(join(runtime, 'browser-'));
  const signalCodes = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };
  let browser;
  let child;
  let requestedSignal;
  const signalGroup = signal => {
    if (child?.pid) {
      // 控制器及 FFmpeg 共用獨立 process group，取消時一起終止。
      try { process.kill(-child.pid, signal); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  };
  const forward = signal => {
    requestedSignal = signal;
    process.exitCode = signalCodes[signal];
    signalGroup(signal);
  };
  const interrupt = () => forward('SIGINT');
  const terminate = () => forward('SIGTERM');
  const hangup = () => forward('SIGHUP');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  process.on('SIGHUP', hangup);
  try {
    browser = await puppeteer.launch({
      executablePath: lock.tools.chrome.path,
      headless: 'shell',
      userDataDir: join(session, 'profile'),
      dumpio: true,
      env,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      args: ['--disable-background-networking', '--no-first-run', '--disable-sync'],
    });
    if (requestedSignal) return;
    const endpoint = browser.wsEndpoint();
    if (new URL(endpoint).hostname !== '127.0.0.1') throw new Error('瀏覽器控制通道必須只在 loopback。');
    child = spawn('/usr/bin/sandbox-exec', [
      '-p', profile, lock.tools.node.path, join(root, 'scripts/render.mjs'),
      ...process.argv.slice(2),
    ], {
      cwd: root, shell: false, stdio: 'inherit', detached: true,
      env: { ...env, MV_BROWSER_WS: endpoint, MV_SESSION_DIR: session },
    });
    process.exitCode = await new Promise((resolveExit, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        // 控制器可能先退出；不可讓尚未處理取消的 FFmpeg 留在背景。
        if (requestedSignal) signalGroup('SIGKILL');
        child = undefined;
        if (signal) console.error(`隔離控制器由 ${signal} 結束。`);
        resolveExit(requestedSignal ? signalCodes[requestedSignal] : (code ?? signalCodes[signal] ?? 1));
      });
    });
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      try {
        await rm(session, { recursive: true, force: true });
      } finally {
        process.removeListener('SIGINT', interrupt);
        process.removeListener('SIGTERM', terminate);
        process.removeListener('SIGHUP', hangup);
      }
    }
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
