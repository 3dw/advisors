import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, realpath, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));

async function main() {
  if (process.platform !== 'darwin') throw new Error('語音隔離入口需要 macOS sandbox-exec。');
  const args = process.argv.slice(2);
  const prepare = args.length === 1 && args[0] === '--prepare';
  if (!prepare && (args.length !== 2 || args[0].startsWith('--'))) {
    throw new Error('用法：npm run speech:prepare，或 npm run speech -- projects/demo/narration.json assets/speech/demo.wav');
  }
  const lock = JSON.parse(await readFile(join(root, 'tools.lock.json'), 'utf8'));
  const node = lock.tools.node;
  if (await realpath(process.execPath) !== node.path || process.version !== node.version || createHash('sha256').update(await readFile(node.path)).digest('hex') !== node.sha256) {
    throw new Error('請使用 tools.lock.json 指定且經審閱的 Node。');
  }
  const python = join(root, '.runtime/voice-env/bin/python');
  try { await realpath(python); }
  catch { throw new Error('請先建立 .runtime/voice-env，並依 requirements-voice.txt 安裝語音依賴。'); }
  const runtime = join(root, '.runtime');
  if (await realpath(runtime) !== runtime) throw new Error('.runtime 不可是外部連結。');
  const home = join(runtime, 'voice-home');
  await mkdir(home, { recursive: true });
  if (await realpath(home) !== home) throw new Error('語音 HOME 不可是外部連結。');
  const session = await mkdtemp(join(runtime, 'voice-run-'));
  const env = {
    PATH: '/usr/bin:/bin', HOME: home, TMPDIR: `${session}/`, LANG: 'en_US.UTF-8',
    PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1',
    HF_HOME: join(home, 'huggingface'), HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1',
    TOKENIZERS_PARALLELISM: 'false', OMP_NUM_THREADS: '2',
    MV_SESSION_DIR: session,
  };
  const profile = `(version 1)
(allow default)
(deny file-read* (subpath "/Users") (subpath "/Volumes") (subpath "/System/Volumes/Data/Users")
  (subpath "/private/tmp") (subpath "/private/var/folders") (subpath "/private/var/root") (subpath "/Library/Keychains"))
(allow file-read-metadata)
(allow file-read* (subpath ${JSON.stringify(root)}) (subpath ${JSON.stringify(dirname(node.path))}))
(deny file-write*)
(allow file-write* (subpath ${JSON.stringify(root)}) (literal "/dev/null"))
(deny network*)`;
  let child;
  let cancelled;
  const codes = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };
  const send = signal => {
    if (!child?.pid) return;
    try { process.kill(-child.pid, signal); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  const handlers = Object.fromEntries(Object.keys(codes).map(signal => [signal, () => { cancelled = signal; send(signal); }]));
  for (const [signal, handler] of Object.entries(handlers)) process.on(signal, handler);
  try {
    child = prepare
      ? spawn(python, [join(root, 'lib/speech.py'), ...args], { cwd: root, env, stdio: 'inherit', detached: true })
      : spawn('/usr/bin/sandbox-exec', ['-p', profile, python, join(root, 'lib/speech.py'), ...args], { cwd: root, env, stdio: 'inherit', detached: true });
    process.exitCode = await new Promise((resolveExit, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (cancelled) send('SIGKILL');
        child = undefined;
        resolveExit(cancelled ? codes[cancelled] : (code ?? codes[signal] ?? 1));
      });
    });
  } finally {
    for (const [signal, handler] of Object.entries(handlers)) process.removeListener(signal, handler);
    await rm(session, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
