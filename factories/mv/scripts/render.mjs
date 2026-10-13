import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { readFile, realpath, stat, mkdtemp, rm, access, link } from 'node:fs/promises';
import { join, resolve, relative, extname, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const exec = promisify(execFile);
const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const inside = (base, path) => path === base || (!relative(base, path).startsWith('..') && !isAbsolute(relative(base, path)));
const ffmpeg = process.env.MV_FFMPEG_PATH;
const ffprobe = process.env.MV_FFPROBE_PATH;

async function inputPath(value, folder) {
  if (!value || isAbsolute(value) || value.split(/[\\/]/).includes('..')) throw new Error('輸入只接受 mv 內的相對路徑。');
  const base = join(root, folder);
  const path = await realpath(resolve(root, value));
  if (!inside(base, path)) throw new Error(`輸入必須位於 ${folder}/ 內，且不可透過連結外跳。`);
  return path;
}

async function render() {
  if (process.env.MV_SANDBOXED !== '1') throw new Error('請從 npm run render 的隔離入口執行。');
  const [projectArg, audioArg, outputArg, ...options] = process.argv.slice(2);
  const config = { fps: 30, width: 1280, height: 720 };
  for (let i = 0; i < options.length; i += 2) {
    const key = options[i]?.slice(2);
    const value = Number(options[i + 1]);
    if (!options[i].startsWith('--') || !Object.hasOwn(config, key) || !Number.isInteger(value) || value <= 0) throw new Error('選項只接受 --fps、--width、--height 的正整數。');
    config[key] = value;
  }
  if (config.fps > 120 || config.width > 3840 || config.height > 2160 || config.width % 2 || config.height % 2) throw new Error('fps 上限 120；尺寸需為偶數，最大 3840×2160。');
  const project = await inputPath(projectArg, 'projects');
  const audio = await inputPath(audioArg, 'assets');
  if (!(await stat(project)).isDirectory() || !(await stat(audio)).isFile()) throw new Error('請指定專案目錄與音訊檔案。');
  await access(join(project, 'index.html'));
  if (!outputArg || isAbsolute(outputArg) || outputArg.split(/[\\/]/).includes('..') || extname(outputArg) !== '.mp4') throw new Error('輸出需為 output/ 內新的 .mp4 相對路徑。');
  const output = resolve(root, outputArg);
  const outputDir = await realpath(dirname(output));
  if (!inside(join(root, 'output'), outputDir) || outputDir !== dirname(output)) throw new Error('輸出目錄必須位於 output/ 內且不可是連結。');
  try { await access(output); throw new Error('輸出檔已存在，不會覆寫。'); } catch (error) { if (error.code !== 'ENOENT') throw error; }

  const probe = await exec(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', audio]);
  const metadata = JSON.parse(probe.stdout);
  const duration = Number(metadata.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 600 || !metadata.streams?.some(stream => stream.codec_type === 'audio')) throw new Error('音檔需有有效音軌與時長，單次最長 600 秒。');
  const frames = Math.ceil(duration * config.fps);
  const decoded = await exec(ffmpeg, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', audio, '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', 'pipe:1'], { encoding: 'buffer', maxBuffer: 24 * 1024 * 1024 });
  const pcm = decoded.stdout;
  const levels = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame++) {
    const first = Math.floor(frame * 8000 / config.fps);
    const last = Math.min(Math.floor((frame + 1) * 8000 / config.fps), pcm.length / 4);
    let energy = 0;
    for (let sample = first; sample < last; sample++) energy += pcm.readFloatLE(sample * 4) ** 2;
    levels[frame] = last > first ? Math.min(1, Math.sqrt(energy / (last - first))) : 0;
  }

  const scratch = await mkdtemp(join(process.env.MV_SESSION_DIR, 'render-'));
  const vendor = join(root, 'node_modules/p5/lib/p5.min.js');
  const libraries = new Map([
    ['/lib/emotion.js', join(root, 'lib/emotion.js')],
    ['/lib/motion.js', join(root, 'lib/motion.js')],
    ['/lib/character.js', join(root, 'lib/character.js')],
  ]);
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
  const server = createServer(async (request, response) => {
    console.log('HTTP', request.method, request.url);
    try {
      if (request.method !== 'GET') { response.writeHead(405).end(); return; }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const library = libraries.get(pathname);
      const path = pathname === '/vendor/p5.min.js' ? vendor : await realpath(library ?? resolve(project, `.${pathname === '/' ? '/index.html' : pathname}`));
      const base = library ? join(root, 'lib') : project;
      if (path !== vendor && !inside(base, path)) { response.writeHead(403).end(); return; }
      if (!(await stat(path)).isFile()) { response.writeHead(404).end(); return; }
      response.writeHead(200, {
        'Content-Type': mime[extname(path)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox allow-scripts allow-same-origin; default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      });
      response.end(await readFile(path));
    } catch { response.writeHead(404).end(); }
  });
  let browser;
  try {
    await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await puppeteer.connect({ browserWSEndpoint: process.env.MV_BROWSER_WS });
    const context = await browser.createBrowserContext();
    await context.overridePermissions(origin, []);
    const page = await context.newPage();
    await page.setViewport({ width: config.width, height: config.height, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    const violations = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => console.log('FAILED', request.url(), request.failure()));
    page.on('request', request => {
      const url = request.url();
      console.log('REQUEST', url);
      if (url.startsWith(`${origin}/`) || url.startsWith('data:image/')) void request.continue();
      else { violations.push(url); void request.abort('blockedbyclient'); }
    });
    await page.goto(origin, { waitUntil: 'load', timeout: 15000 });
    await page.waitForFunction('window.mvReady === true && typeof window.renderFrame === "function"', { timeout: 15000 });
    for (let frame = 0; frame < frames; frame++) {
      await page.evaluate(async data => { await window.renderFrame(data); }, { ...config, frame, time: frame / config.fps, level: levels[frame] });
      if (errors.length || violations.length) throw new Error(`頁面執行失敗或嘗試外部請求：${errors[0] ?? violations[0]}`);
      const size = await page.evaluate(() => { const canvas = document.querySelector('canvas'); return { width: canvas?.width, height: canvas?.height }; });
      if (size.width !== config.width || size.height !== config.height) throw new Error('畫布尺寸與指定輸出不符。');
      const canvas = await page.$('canvas');
      await canvas.screenshot({ path: join(scratch, `frame-${String(frame).padStart(6, '0')}.png`), type: 'png' });
      await canvas.dispose();
    }
    await context.close();
    browser.disconnect();
    browser = null;
    const encoded = join(scratch, 'movie.mp4');
    await exec(ffmpeg, ['-v', 'error', '-n', '-protocol_whitelist', 'file,pipe', '-framerate', String(config.fps), '-i', join(scratch, 'frame-%06d.png'), '-protocol_whitelist', 'file,pipe', '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-t', String(duration), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', encoded], { maxBuffer: 4 * 1024 * 1024 });
    // 完成後才發布輸出；link 原子拒絕覆寫，也不留下取消中的半成品。
    await link(encoded, output);
    console.log(JSON.stringify({ output: relative(root, output), frames, fps: config.fps, width: config.width, height: config.height, audioDuration: duration, audioLevelRange: [Math.min(...levels), Math.max(...levels)] }, null, 2));
  } finally {
    if (browser) browser.disconnect();
    await new Promise(resolveClose => server.close(resolveClose));
    await rm(scratch, { recursive: true, force: true });
  }
}

render().catch(error => { console.error(error.message); process.exitCode = 1; });
