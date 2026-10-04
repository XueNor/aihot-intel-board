// 截取看板截图（浅色 + 深色），用于确认倒叙布局的视觉效果。
// 一次性脚本，自带启动与清理。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const HTML = path.join(ROOT, process.argv[2] || 'aihot-intel.html');
const OUT = path.join(ROOT, '.shots');
const PORT = 9700 + Math.floor(Math.random() * 200);
const PROFILE = path.join(os.tmpdir(), `wb-shot-${process.pid}-${Date.now()}`);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

fs.mkdirSync(OUT, { recursive: true });
const fileUrl = 'file:///' + HTML.split(path.sep).map(
  (s, i) => i === 0 ? s : encodeURIComponent(s)).join('/');

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  '--hide-scrollbars', '--force-device-scale-factor=1',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=1440,1200', fileUrl,
], { stdio: 'ignore' });

function cleanup(code = 0) {
  try { proc.kill(); } catch {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  process.exit(code);
}

for (let i = 0; i < 40; i++) {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch {}
  await new Promise(r => setTimeout(r, 500));
}
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const tgt = list.find(t => t.type === 'page' && (t.url || '').includes('aihot-intel'));
if (!tgt) { console.error('未找到页面'); cleanup(1); }

const ws = new WebSocket(tgt.webSocketDebuggerUrl);
let id = 0; const waiters = new Map();
const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise(r => waiters.set(i, r)); };
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (waiters.has(m.id)) { waiters.get(m.id)(m.result); waiters.delete(m.id); } });
await new Promise(r => ws.addEventListener('open', r, { once: true }));
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',
  { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
await new Promise(r => setTimeout(r, 15000));

for (const theme of ['light', 'dark']) {
  await send('Runtime.evaluate', {
    expression: `document.documentElement.setAttribute('data-theme','${theme}');
                 document.querySelector('#pane-flow').scrollIntoView();
                 window.scrollBy(0,-70);`,
  });
  await new Promise(r => setTimeout(r, 500));
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const f = path.join(OUT, `flow-${process.argv[3] || 'swiss'}-${theme}.png`);
  fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
  console.log('已保存', f, (fs.statSync(f).size / 1024).toFixed(0) + ' KB');
}

ws.close();
await new Promise(r => setTimeout(r, 300));
cleanup(0);
