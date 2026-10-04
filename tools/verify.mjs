// 看板渲染验证 —— 一次性脚本，无需任何前置常驻服务。
//
// 用法（在项目根目录执行）：
//   node tools/verify.mjs                    # 校验默认 aihot-intel.html
//   node tools/verify.mjs aihot-intel-cassette.html   # 校验指定皮肤
//
// 脚本自己完成：启动 Edge 无头 → 加载 file:// 页面 → 采集指标 →
// 关进程 → 删除 profile 临时目录。不留后台、不占端口、不残留文件。
//
// 为什么不用 http.server：看板是纯单文件，无外部资源，file:// 直接打开
// 渲染结果与 http 完全一致。早期版本要求手动起服务，是误把调试手段
// 当成了运行依赖。
//
// 依赖：仅 Node 18+ 自带的全局 WebSocket / fetch，无需 npm install。

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
// 可传入任意皮肤文件名；多套皮肤共用同一套 DOM 骨架与断言
const HTML = path.join(ROOT, process.argv[2] || 'aihot-intel.html');

const PORT = 9400 + Math.floor(Math.random() * 400);   // 避开常用端口，避免冲突
const PROFILE = path.join(os.tmpdir(), `wb-verify-${process.pid}-${Date.now()}`);

const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];
const edge = EDGE_CANDIDATES.find(p => fs.existsSync(p));
if (!edge) {
  console.error('未找到 Edge 或 Chrome，请手动指定可执行文件路径');
  process.exit(1);
}
if (!fs.existsSync(HTML)) {
  console.error(`未找到 ${HTML}，请先运行：python pack.py`);
  process.exit(1);
}

const fileUrl = 'file:///' + HTML.split(path.sep).map(
  (s, i) => i === 0 ? s : encodeURIComponent(s)).join('/');

let proc = null;
function shutdown(code = 0) {
  try { proc && proc.kill(); } catch {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  process.exit(code);
}

console.log('浏览器 :', path.basename(edge));
console.log('页面   :', fileUrl);
console.log('端口   :', PORT);
console.log('');

proc = spawn(edge, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  '--no-default-browser-check', '--disable-extensions',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  fileUrl,
], { stdio: 'ignore' });

// 等待调试端口就绪
let ready = false;
for (let i = 0; i < 40; i++) {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) { ready = true; break; } } catch {}
  await new Promise(r => setTimeout(r, 500));
}
if (!ready) { console.error('浏览器未就绪'); shutdown(1); }

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find(t => t.type === 'page' && (t.url || '').includes('aihot-intel'));
if (!target) {
  console.error('未找到页面 target，现有：', list.map(t => t.url));
  shutdown(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const waiters = new Map();
const errs = [];

const send = (method, params = {}) => {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method, params }));
  return new Promise((res, rej) => {
    waiters.set(mid, { res, rej });
    setTimeout(() => {
      if (waiters.has(mid)) { waiters.delete(mid); rej(new Error(method + ' 超时')); }
    }, 60000);
  });
};

ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && waiters.has(m.id)) {
    const w = waiters.get(m.id);
    waiters.delete(m.id);
    m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result);
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    errs.push('JS 异常: ' + (d.exception?.description || d.text || '').slice(0, 200));
  }
});

await new Promise(r => ws.addEventListener('open', r, { once: true }));
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.reload', { ignoreCache: true });

// 等 15 个关键词跑完（每次串行 fetch，最坏约 15 秒）
await new Promise(r => setTimeout(r, 15000));

const EXPR = `(() => {
  const q = s => document.querySelector(s);
  const errEl = q('#err');
  const today = ymd(new Date().toISOString());
  const wb = windowBounds(today);
  const win = POOL.filter(v => v.date >= wb.start && v.date <= wb.end);
  const ev = buildEvents(win).map(e => { e.firstPartyDate = firstPartyDate(e, win); return e; })
                .filter(e => e.tier <= 2).sort((a, b) => rankScore(b) - rankScore(a));
  const days = {};
  const dayOrder = [];
  document.querySelectorAll('.tl-row').forEach(r => {
    const d = r.querySelector('.tl-day .d').textContent.trim();
    days[d] = r.querySelectorAll('.tl-it').length;
    dayOrder.push(d);
  });
  const newestMarked = !!document.querySelector('.tl-row.newest');
  const relLabels = Array.from(document.querySelectorAll('.tl-day .rel'))
                          .map(e => e.textContent.trim());
  return {
    protocol: location.protocol,
    errShown: errEl ? !errEl.hidden : false,
    errText: errEl ? errEl.innerText.slice(0, 80) : '',
    pool: POOL.length,
    feed: POOL.filter(v => v.feed).length,
    mode: MODE,
    windowDays: WINDOW_DAYS,
    winStart: wb.start, winEnd: wb.end,
    inWindow: win.length,
    winEvents: ev.length,
    maxCluster: Math.max(0, ...ev.map(e => e.items.length)),
    crossMerged: ev.filter(e => e.items.length > 1 &&
      new Set(e.items.map(i => i.feed ? 1 : 0)).size > 1).length,
    perDay: days,
    dayOrder,
    newestMarked,
    relLabels,
    tlRows: document.querySelectorAll('.tl-row').length,
    tlMax: Math.max(0, ...Object.values(days)),
    cards: document.querySelectorAll('.th').length,
    topKept: pickTop(win, win, CAPS.topPick).kept.length,
    topRendered: document.querySelectorAll('.sel-row').length,
    tlTags: document.querySelectorAll('.tl-tags .tg').length,
    tabs: document.querySelectorAll('.tab').length,
    blankHref: Array.from(document.querySelectorAll('a'))
      .filter(a => !a.getAttribute('href') || a.getAttribute('href') === '#').length,
    links: document.querySelectorAll('a[target="_blank"]').length,
    noopener: document.querySelectorAll('a[target="_blank"][rel*="noopener"]').length,
    marks: document.querySelectorAll('mark').length,
    stats: Array.from(document.querySelectorAll('.stat'))
      .map(s => s.querySelector('.k').textContent + '=' + s.querySelector('.v').textContent),
    footer: (q('#fMode') || {}).textContent,
    flowMeta: (q('#flowMeta') || {}).textContent,
    topTitle: (q('#topTitle') || {}).textContent
  };
})()`;

const r = await send('Runtime.evaluate', { expression: EXPR, returnByValue: true, awaitPromise: true });
const v = r.result.value;

const L = '─'.repeat(62);
console.log(L);
if (!v) {
  console.log('求值为 null（页面脚本未完成执行）');
} else {
  console.log('协议            :', v.protocol, '| 错误区:', v.errShown, v.errText);
  console.log('模式            :', v.mode, '| 标签页数:', v.tabs);
  console.log('时间窗          :', v.winStart, '–', v.winEnd, `(近 ${v.windowDays} 日)`);
  console.log('数据池          :', v.pool, '条（国内 RSS', v.feed, '）· 窗内', v.inWindow, '条');
  console.log('窗内事件        :', v.winEvents, '起 · 最大聚类', v.maxCluster,
              '篇 · 跨源合并', v.crossMerged, '起');
  console.log('时间线          :', v.tlRows, '行 · 单日最多', v.tlMax, '条（上限 8）');
  console.log('日期顺序(倒序)  :', v.dayOrder.join(' > '));
  console.log('相对日标签      :', v.relLabels.join(' / '));
  console.log('每日展示        :', JSON.stringify(v.perDay));
  console.log('条目标签        :', v.tlTags, '个');
  console.log('主题卡片        :', v.cards, '张（每张上限 6）');
  console.log('关键事件        :', v.topKept, '条 · 实际渲染', v.topRendered, '条 —', v.topTitle);
  console.log('空 href / 外链 / noopener / 高亮:', v.blankHref, '/', v.links, '/', v.noopener, '/', v.marks);
  console.log('统计卡          :', (v.stats || []).join('  '));
  console.log('页脚            :', v.footer);
  console.log('流概况          :', v.flowMeta);

  const problems = [];
  if (v.errShown) problems.push('错误区可见');
  if (v.blankHref > 0) problems.push(v.blankHref + ' 个空 href');
  if (v.links !== v.noopener) problems.push('外链未全覆盖 noopener');
  if (v.pool < 50) problems.push('数据池异常偏少');
  if (v.tabs > 0) problems.push('仍存在标签页');
  if (v.tlRows !== v.windowDays) problems.push(`时间线 ${v.tlRows} 行 ≠ 窗口 ${v.windowDays} 天`);
  if (v.tlMax > 8) problems.push('时间线超出每日上限');
  if (v.topKept > 5) problems.push('关键事件超出上限');
  if (v.topKept !== v.topRendered) problems.push('关键事件数与渲染数不符');
  if (!v.tlTags) problems.push('时间线缺少条目标签');
  // 倒序断言：日期必须严格递减，且首行是窗口最后一天（即今天）
  // 注意 DOM 里显示的是省略年份的 MM.DD（见 renderTimeline 的 d.slice(5)），
  // 不能直接与 YYYY-MM-DD 比，需先补齐年份再比较。
  const ord = v.dayOrder;
  const full = x => v.winEnd.slice(0, 4) + '-' + x.replace('.', '-');
  const ordFull = ord.map(full);
  const desc = ordFull.every((d, i) => i === 0 || ordFull[i - 1] > d);
  if (!desc) problems.push('日期未倒序: ' + ordFull.join('>'));
  if (ordFull[0] !== v.winEnd) problems.push(`首行不是最新日期 ${v.winEnd}，实际 ${ordFull[0]}`);
  if (!v.newestMarked) problems.push('首行缺少「最新」标记');
  if (v.relLabels[0] !== '今日') problems.push('首行相对日不是「今日」: ' + v.relLabels[0]);
  console.log('');
  console.log(problems.length ? '⚠ 发现问题: ' + problems.join('；') : '✓ 全部检查通过');
}
console.log(L);
console.log('JS 异常:', errs.length ? errs.slice(0, 3) : '无');
console.log('（AI HOT 的 CORS 报错属预期，快照回落已生效）');

ws.close();
await new Promise(r => setTimeout(r, 300));
shutdown(0);
