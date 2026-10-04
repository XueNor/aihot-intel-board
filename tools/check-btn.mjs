// 检查右下角「回到最新」悬浮按钮的样式与交互。
// 一次性脚本，自带启动与清理。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const HTML = path.join(ROOT, 'aihot-intel.html');
const OUT = path.join(ROOT, '.shots');
const PORT = 9800 + Math.floor(Math.random() * 150);
const PROFILE = path.join(os.tmpdir(), `wb-btn-${process.pid}-${Date.now()}`);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

fs.mkdirSync(OUT, { recursive: true });
const fileUrl = 'file:///' + HTML.split(path.sep).map(
  (s, i) => i === 0 ? s : encodeURIComponent(s)).join('/');

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=1440,1000', fileUrl,
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
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (waiters.has(m.id)) { waiters.get(m.id)(m.result); waiters.delete(m.id); }
});
await new Promise(r => ws.addEventListener('open', r, { once: true }));
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',
  { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await new Promise(r => setTimeout(r, 15000));

const EXPR = `(() => {
  const b = document.querySelector('#btnTop');
  if (!b) return { found: false };
  const cs = getComputedStyle(b);
  const r = b.getBoundingClientRect();
  const svg = b.querySelector('svg');
  return {
    found: true,
    position: cs.position,
    right: cs.right, bottom: cs.bottom,
    radius: cs.borderRadius,
    width: Math.round(r.width), height: Math.round(r.height),
    // 正方形 + 50% 圆角 = 圆形
    isCircle: Math.abs(r.width - r.height) < 1 && cs.borderRadius.includes('50%'),
    opacityIdle: cs.opacity,
    background: cs.backgroundColor,
    zIndex: cs.zIndex,
    // 相对视口右下角的位置
    distFromRight: Math.round(innerWidth - r.right),
    distFromBottom: Math.round(innerHeight - r.bottom),
    anchoredBottomRight: r.right > innerWidth * 0.8 && r.bottom > innerHeight * 0.7,
    hasSvg: !!svg,
    svgTag: svg ? svg.tagName.toLowerCase() : null,
    paths: svg ? svg.querySelectorAll('path').length : 0,
    strokeW: svg ? getComputedStyle(svg).strokeWidth : null,
    title: b.title || '',
    ariaLabel: b.getAttribute('aria-label'),
    type: b.getAttribute('type'),
    visibleNow: !b.hidden,
    docHeight: document.documentElement.scrollHeight,
    viewH: innerHeight
  };
})()`;
// 首屏应隐藏（已在最新一条），滚到中部后应显示 —— 这才是要测的可见态
const r = await send('Runtime.evaluate', { expression: EXPR, returnByValue: true });
const v = r.result.value;

// 滚到页面中部，让按钮进入可见态后重新测量
const r2 = await send('Runtime.evaluate', {
  expression: `window.scrollTo(0, 2200); new Promise(r=>setTimeout(()=>{
     const b=document.querySelector('#btnTop'); const cs=getComputedStyle(b);
     const bb=b.getBoundingClientRect();
     r({ hidden:b.hidden, w:Math.round(bb.width), h:Math.round(bb.height),
         fromRight:Math.round(innerWidth-bb.right), fromBottom:Math.round(innerHeight-bb.bottom),
         isCircle: Math.abs(bb.width-bb.height)<1 && cs.borderRadius.includes('50%'),
         radius:cs.borderRadius, opacity:cs.opacity, pos:cs.position,
         // stroke 是通过 CSS 设在 <svg> 上继承给 path 的，path 自身无 stroke 属性，
         // 所以要用 getComputedStyle 读 svg 的实际描边值，不能查path[stroke]
         iconStroked: getComputedStyle(b.querySelector('svg')).stroke,
         iconW: getComputedStyle(b.querySelector('svg')).strokeWidth,
         iconPaths: b.querySelectorAll('svg path').length });
  }, 500))`,
  returnByValue: true, awaitPromise: true });
const s = r2.result.value;

// 交互态：用真实鼠标移动到按钮上（比 forcePseudoState 可靠，
// 后者需要额外的样式重算等待），等transition 结束（0.18s）后读取
const mv = await send('Runtime.evaluate', {
  expression: `(() => { const b=document.querySelector('#btnTop');
     const r=b.getBoundingClientRect();
     return { x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2) }; })()`,
  returnByValue: true });
const pt = mv.result.value;
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
await new Promise(r => setTimeout(r, 500));   // 等待 opacity transition 完成
const hov = await send('Runtime.evaluate', {
  expression: `(() => { const cs=getComputedStyle(document.querySelector('#btnTop'));
     return { opacity:cs.opacity, color:cs.color, border:cs.borderTopColor }; })()`,
  returnByValue: true });
const hoverState = hov.result.value;

const L = '─'.repeat(58);
console.log(L);
if (!v.found) { console.log('✗ 未找到 #btnTop'); cleanup(1); }
else {
  console.log('— 首屏（最新一条处）—');
  console.log('  显隐          :', v.visibleNow ? '显示' : '隐藏（不干扰首屏）',
              v.visibleNow ? '✗' : '✓');
  console.log();
  console.log('— 滚动到页面中部（按钮应可见）—');
  console.log('  显隐          :', s.hidden ? '隐藏 ✗' : '显示 ✓');
  console.log('  定位          :', s.pos, `· 距右 ${s.fromRight}px / 距下 ${s.fromBottom}px`,
              (s.fromRight < 100 && s.fromBottom < 100) ? '· 右下角 ✓' : '✗');
  console.log('  尺寸 / 形状   :', `${s.w}×${s.h}px`, s.isCircle ? '· 圆形 ✓' : '✗');
  console.log('  圆角 / 透明度 :', s.radius, '/', s.opacity,
              s.opacity === '0.42' ? '（半透明 ✓）' : '✗');
  console.log('  图标          :', s.iconPaths, '条path ·描边',
              s.iconStroked, `w=${s.iconW}`,
              (s.iconPaths === 2 && s.iconStroked !== 'none') ? '✓' : '✗');
  console.log('  hover 状态    :', `opacity ${hoverState.opacity} · 描边 ${hoverState.border}`,
              (hoverState.opacity === '1' && hoverState.border === 'rgb(227, 6, 19)')
                ? '· 悬停时完全显现并变红 ✓' : '✗');
  console.log('  无障碍        :', `type=${v.type} aria-label="${v.ariaLabel}"`);
  console.log();
  const bad = [];
  if (s.hidden) bad.push('中部未显示');
  if (!(s.fromRight < 100 && s.fromBottom < 100)) bad.push('未固定在右下角');
  if (!s.isCircle) bad.push('非圆形');
  if (s.opacity !== '0.42') bad.push('常态非半透明');
  if (hoverState.opacity !== '1') bad.push('悬停未显现');
  if (hoverState.border !== 'rgb(227, 6, 19)') bad.push('悬停未变红');
  if (!(s.iconPaths === 2 && s.iconStroked !== 'none')) bad.push('图标缺失');
  console.log(bad.length ? '⚠ ' + bad.join('；') : '✓ 全部检查通过');
}
console.log(L);

// 截图：中部常态（半透明）、悬停显现、深色主题
for (const [name, setup] of [
  ['scrolled', `document.documentElement.setAttribute('data-theme','light'); window.scrollTo(0, 2200);`],
  ['hover', `window.scrollTo(0, 2200);`],
  ['dark', `document.documentElement.setAttribute('data-theme','dark'); window.scrollTo(0, 2200);`],
]) {
  await send('Runtime.evaluate', { expression: setup });
  // 悬停截图时把鼠标重新移到按钮上
  if (name === 'hover' || name === 'dark') {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
  } else {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
  }
  await new Promise(r => setTimeout(r, 500));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `btn-${name}.png`), Buffer.from(shot.data, 'base64'));
}
console.log('截图已保存到 .shots/btn-{scrolled,hover,dark}.png');
ws.close();
await new Promise(r => setTimeout(r, 300));
cleanup(0);
