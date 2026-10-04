/* ================= 应用层：渲染 + 交互 ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BJ = { timeZone: 'Asia/Shanghai' };

const HLS = ['Gemini', 'GPT-6.1', 'GPT-6', 'OpenAI', 'ChatGPT', 'Claude', 'Anthropic',
  'DeepSeek', 'Kimi', 'Qwen', 'GLM', 'Grok', 'MiniMax', '混元', 'NVIDIA', '英伟达',
  'GPU', '昇腾', '芯片', '半导体', '算力'];
const HLRX = new RegExp('(' + HLS.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
const hl = t => esc(t).replace(HLRX, '<mark>$1</mark>');

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: BJ.timeZone, month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(d).replace(/\//g, '.');
}
function ymd(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: BJ.timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}
const DOW = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function dowOf(dateStr) {
  return DOW[new Date(dateStr + 'T12:00:00+08:00').getDay()];
}
/* 事件日期：用 AI HOT timeline 口径（publishedAt 空则回落 discoveredAt） */
function evDate(it) {
  const p = it.pub, d = it.disc;
  if (!p) return ymd(d);
  if (d && (new Date(d) - new Date(p)) / 36e5 > 72) return ymd(p);
  return ymd(d || p);
}
function relTime(it) {
  const t = new Date(it.pub || it.disc);
  const m = (Date.now() - t) / 6e4;
  if (m < 60) return Math.max(1, Math.round(m)) + ' 分钟前';
  if (m < 1440) return Math.round(m / 60) + ' 小时前';
  return Math.round(m / 1440) + ' 天前';
}
const clip = (t, n) => {
  if (!t) return '';
  const s = String(t).replace(/\s+/g, ' ').trim();
  return s.length <= n ? s : s.slice(0, n - 1).replace(/[，。、；,.;\s]+$/, '') + '…';
};

/* ---------- 主题归类（本周汇总用） ----------
   按「特异性」打分：命中该主题的关键词越专属、权重越高，得分越高。
   避免「发布/推出」这类泛化词把所有条目都吸进同一个桶。 */
const THEMES = [
  { k: 'chip', n: '算力与半导体硬件', w: 3.0,
    kws: ['芯片', '半导体', 'GPU', 'NVIDIA', '英伟达', '算力', '昇腾', '集群',
          '数据中心', 'TPU', 'Blackwell', 'HBM', '晶圆', '光刻', '加速卡'] },
  { k: 'gov',  n: '监管、安全与治理', w: 2.2,
    kws: ['监管', '调查', '诉讼', '传票', '禁令', '政策', '法案', '合规', '安全',
          '漏洞', '攻击', '泄露', '治理', '协议', '标准', '审查', '整改', '风险'] },
  { k: 'biz',  n: '资本与商业动态', w: 2.0,
    kws: ['融资', '估值', 'IPO', '上市', '收购', '并购', '回购', '财报', '营收',
          '投资', '股东', '董事会', '商业', '订单', '招聘'] },
  { k: 'research', n: '研究与方法论', w: 1.8,
    kws: ['研究', '论文', '实验', '评测方法', '基准', '分析报告', '方法论', '白皮书',
          '综述', '数据集'] },
  { k: 'agent', n: '产品与智能体落地', w: 1.5,
    kws: ['智能体', 'Agent', 'Claude Code', '插件', '工作流', 'Codex', 'MCP',
          '路由', '沙箱', '开发者', 'SDK', 'API', '工具', '助手', 'CLI'] },
  { k: 'model', n: '模型与能力跃迁', w: 1.0,
    kws: ['发布', '推出', '上线', '开源', '模型', 'GPT', 'Gemini', 'Claude',
          'DeepSeek', 'Qwen', 'GLM', 'Kimi', 'Grok', 'MiniMax', '混元', '基准'] },
];
function themeOf(ev) {
  const b = ((ev.lead.title || '') + ' ' + (ev.lead.summary || '')).toLowerCase();
  let best = THEMES[5], bestScore = -1;
  for (const t of THEMES) {
    let s = 0;
    for (const k of t.kws) {
      let i = 0;
      while ((i = b.indexOf(k.toLowerCase(), i)) !== -1) { s += t.w; i += k.length; }
    }
    if (s > bestScore) { bestScore = s; best = t; }
  }
  return best;
}

/* ================= 渲染 ================= */
let POOL = [];
let MODE = 'live';

function renderStats(pool, windowEv, topRes, wb) {
  const inWin = pool.filter(v => v.date >= wb.start && v.date <= wb.end).length;
  const srcs = new Set(pool.map(v => v.source)).size;
  const feedN = pool.filter(v => v.feed).length;
  const st = [
    ['时间窗', `${wb.start.slice(5).replace('-', '.')}–${wb.end.slice(5).replace('-', '.')}`,
      `滚动最近 ${WINDOW_DAYS} 日`],
    ['窗内条目', String(inWin), `去重事件 ${windowEv.length} 起`],
    ['关键事件', String(topRes.kept.length), `自 ${topRes.total} 起事件筛出`],
    ['信源数', String(srcs), `含国内 RSS ${feedN} 条`],
    ['监控关键词', String(KEYWORDS.length), '覆盖模型·芯片·算力'],
  ];
  $('#stats').innerHTML = st.map(([k, v, x]) =>
    `<div class="stat"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div>
     <div class="x">${esc(x)}</div></div>`).join('');
  $('#mStat').innerHTML = `近${WINDOW_DAYS}日 <b>${windowEv.length}</b> 起事件<br>关键 <b>${topRes.kept.length}</b> 条`;
  $('#fPool').textContent = '数据池 ' + pool.length + ' 条';
}

/* ---------- 每日限流 ----------
   合并国内 RSS 源后，单日事件可达 20+ 起。全量铺开会让时间线
   失去重点，因此按「AI HOT 优先 + RSS 源按配额」截断。 */
function capDayEvents(list) {
  const sorted = list.slice().sort((a, b) => rankScore(b) - rankScore(a));
  const per = Math.max(2, Math.floor(sorted.length * CAPS.feedShare));
  const used = new Map();
  const out = [], overflow = [];
  for (const ev of sorted) {
    if (ev.lead.feed) {
      const n = used.get(ev.lead.source) || 0;
      if (n >= per) { overflow.push(ev); continue; }
      used.set(ev.lead.source, n + 1);
    }
    out.push(ev);
  }
  return { kept: out.slice(0, CAPS.timelinePerDay), overflow };
}

function relDay(dStr) {
  const d = Math.round((new Date(ymd(new Date().toISOString()) + 'T12:00:00+08:00')
    - new Date(dStr + 'T12:00:00+08:00')) / 864e5);
  if (d === 0) return '今日';
  if (d === 1) return '昨日';
  if (d > 0) return d + ' 天前';
  return '';
}
function fmtTime(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: BJ.timeZone, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(iso));
}

function renderTimeline(windowEv) {
  const days = new Map();
  let hiddenTotal = 0;
  for (const ev of windowEv) {
    if (!days.has(ev.date)) days.set(ev.date, []);
    days.get(ev.date).push(ev);
  }
  const today = ymd(new Date().toISOString());
  // 保持时间轴连续：窗口内无数据的日子也列出来，避免误以为漏更
  const span = windowDays(today);
  let shown = 0, h = '';
  for (const d of span) {
    const { kept, overflow } = capDayEvents(days.get(d) || []);
    hiddenTotal += overflow.length;
    shown += kept.length;
    const isToday = d === today;
    // 倒序排列：最新一天在最前，日期列加「最新」标记强化视觉焦点
    h += `<div class="tl-row${isToday ? ' newest' : ''}">
      <div class="tl-day${isToday ? ' today' : ''}">
        <div class="d">${d.slice(5).replace('-', '.')}</div>
        <div class="w">${dowOf(d)}${isToday ? ' · 今日' : ''}</div>
        <div class="rel">${relDay(d)}</div>
      </div>
      <div class="tl-body">
        <div class="tl-count">${kept.length ? kept.length + ' 起事件 · 按影响力排序'
          : '当日无符合收录标准的事件'}${overflow.length
          ? ` · 另 ${overflow.length} 起未展示` : ''}</div>
        <div class="tl-items">${kept.map((ev, i) => `
          <div class="tl-it">
            <span class="tl-rank">${String(i + 1).padStart(2, '0')}</span>
            <div class="tl-t"><a href="${esc(ev.lead.original)}" target="_blank"
              rel="noopener noreferrer">${hl(ev.lead.title)}</a></div>
            <span class="tl-m">${esc(fmtTime(ev.lead.pub || ev.lead.disc))}<br>${
              esc(ev.lead.source.split('：')[0])} · ${ev.maxScore} 分</span>
            <div class="tl-s">${esc(clip(ev.lead.summary, 118))}</div>
            <div class="tl-tags">
              <span class="tg${ev.tier === 1 ? ' t1' : ''}">${ev.tier === 1 ? '一手/权威'
                : ev.tier === 2 ? '专业媒体' : '社媒'}</span>
              ${ev.lead.feed ? '<span class="tg">RSS</span>' : ''}
              ${ev.sourceCount > 1 ? `<span class="tg">${ev.sourceCount} 源印证</span>` : ''}
              <span class="tg">${esc(themeOf(ev).n)}</span>
            </div>
          </div>`).join('')}
        </div>
      </div></div>`;
  }
  $('#timeline').innerHTML = h;
  const wb = windowBounds(today);
  $('#flowMeta').textContent = `${wb.end} → ${wb.start} 倒序 · 共 ${windowEv.length} 起事件` +
    (hiddenTotal ? ` · 展示 ${shown} 起` : '');
  $('#winLabel').textContent = `近 ${WINDOW_DAYS} 日 · 倒序`;
}

function renderThemes(weekEv) {
  const buckets = new Map(THEMES.map(t => [t.k, []]));
  for (const ev of weekEv) {
    const t = themeOf(ev);
    buckets.get(t.k).push(ev);
  }
  $('#themes').innerHTML = THEMES.map((t, i) => {
    const rows = buckets.get(t.k).sort((a, b) => rankScore(b) - rankScore(a)).slice(0, CAPS.themePerCard);
    if (!rows.length) return '';
    return `<div class="th">
      <h3><span class="dot"></span>${esc(t.n)}<span class="c">${buckets.get(t.k).length}</span></h3>
      
      <ol>${rows.map(ev => `<li>
        <div class="h"><a href="${esc(ev.lead.original)}" target="_blank"
          rel="noopener noreferrer">${hl(ev.lead.title)}</a></div>
        <div class="m">${esc(ev.lead.source)} · <b>${ev.maxScore}</b></div>
      </li>`).join('')}</ol></div>`;
  }).join('');
}

function renderTop(topRes, wb) {
  $('#topTitle').textContent = `关键事件 · 近 ${WINDOW_DAYS} 日`;
  $('#topFilter').innerHTML =
    `候选事件 <b>${topRes.total}</b><br>收录 <b>${topRes.kept.length}</b> · 剔除 <b>${topRes.dropped.length}</b>`;

  if (!topRes.kept.length) {
    $('#topList').innerHTML = `<div class="err">${wb.start} – ${wb.end} 无符合收录标准的事件。<br>
      按「宁缺毋滥」原则不以低质量内容补足，如实留空。</div>`;
  } else {
    $('#topList').innerHTML = topRes.kept.map((ev, i) => {
      const [basis, why] = judge(ev);
      const it = ev.lead;
      const t1 = ev.tier === 1;
      return `<article class="sel-row">
        <div class="sel-n">
          <div class="big">${String(i + 1).padStart(2, '0')}</div>
          <div class="rk">${esc(it.source.split('：')[0])}<br>${ev.maxScore} 分</div>
        </div>
        <div class="sel-b">
          <h3 class="sel-t"><a href="${esc(it.original)}" target="_blank"
            rel="noopener noreferrer">${hl(it.title)}</a></h3>
          <div class="sel-m">
            <span class="src">${esc(it.source)}</span>
            <span>${fmtDate(it.pub || it.disc)}${it.pub ? '' : ' 收录时间'}</span>
            <span>${esc(relTime(it))}</span>
            <span class="badge ${t1 ? 't1' : ''}">${t1 ? '一手/权威' : '专业媒体'}</span>
            ${it.feed ? '<span class="badge">RSS 补充源</span>' : ''}
            ${ev.sourceCount > 1 ? `<span class="badge">${ev.sourceCount} 源印证</span>` : ''}
          </div>
          <p class="sel-s">${esc(clip(it.summary, 190))}</p>
          <div class="sel-why">
            <span class="lb">收录依据</span>${esc(basis)}
            <span class="b2">${esc(why)}</span>
          </div>
          <div class="sel-l">
            <a href="${esc(it.original)}" target="_blank" rel="noopener noreferrer">原文 ↗</a>
            ${it.aihot ? `<a href="${esc(it.aihot)}" target="_blank" rel="noopener noreferrer">AI HOT ↗</a>` : ''}
            ${ev.items.length > 1 ? `<span style="font-family:var(--m);font-size:10.5px;color:var(--grey)">
              已合并 ${ev.items.length} 篇同题报道</span>` : ''}
          </div>
        </div></article>`;
    }).join('');
  }

  const dn = $('#dropN'); if (dn) dn.textContent = `(${topRes.dropped.length})`;
  $('#dropBody').innerHTML = topRes.dropped.map(([ev, r, w]) =>
    `<tr><td>${esc(clip(ev.lead.title, 58))}</td><td class="r">${esc(r)}</td>
     <td class="w">${esc(w)}</td></tr>`).join('');
}

/* ================= 调度 ================= */
async function run() {
  const st = $('#status'), stx = $('#statusTx'), err = $('#err');
  st.hidden = false; err.hidden = true; err.innerHTML = '';
  $('#btnReload').disabled = true;
  try {
    stx.textContent = '正在向 AI HOT 拉取 ' + KEYWORDS.length + ' 个关键词…';
    let pool = [], live = 0, feedAdded = 0;
    try {
      const r = await loadAll((msg, done) => {
        stx.textContent = '拉取中 ' + done + '/' + KEYWORDS.length + ' · ' + msg;
      });
      pool = r.pool; live = r.live; feedAdded = r.feedAdded;
    } catch (e) { /* 忽略，落到快照 */ }
    // 浏览器直连被 CORS / 网络拦截时，完全回落到页面内嵌快照。
    // 注意 loadAll 内部已把快照里的 RSS 条目合并进 pool，
    // 因此这里只在实时完全失败时才整体退回快照。
    const hasSnap = typeof SNAPSHOT !== 'undefined' && SNAPSHOT.length > 0;
    const useSnap = (!pool.length || live === 0) && hasSnap;
    if (!pool.length && !useSnap) throw new Error('接口未返回任何条目');
    const data = useSnap ? SNAPSHOT.map(x => Object.assign({}, x)) : pool;
    MODE = useSnap ? 'snapshot' : 'live';

    for (const v of data) v.date = evDate(v);
    POOL = data;

    const today = ymd(new Date().toISOString());
    const wb = windowBounds(today);
    const winPool = data.filter(v => v.date >= wb.start && v.date <= wb.end);
    const winEv = buildEvents(winPool)
      .map(e => { e.firstPartyDate = firstPartyDate(e, winPool); return e; })
      .filter(e => e.tier <= 2)
      .sort((a, b) => rankScore(b) - rankScore(a));

    const topRes = pickTop(winPool, winPool, CAPS.topPick);

    renderStats(data, winEv, topRes, wb);
    renderTimeline(winEv);
    renderThemes(winEv);
    renderTop(topRes, wb);
    // 时间线重绘后锚点位置变化，重新同步回到最新按钮的显隐
    try { syncTopBtn(); } catch (e) {}

    $('#mUpd').textContent = (useSnap ? '快照 ' : '') +
      new Intl.DateTimeFormat('zh-CN', {
        timeZone: BJ.timeZone, hour: '2-digit', minute: '2-digit', hour12: false
      }).format(new Date()) + ' 已更新';
    $('#fTime').textContent = '数据快照 ' + new Intl.DateTimeFormat('zh-CN', {
      timeZone: BJ.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date());
    const srcTxt = feedAdded ? ` +${feedAdded} 条国内 RSS 源` : '';
    $('#fMode').textContent = useSnap
      ? '离线快照模式（浏览器跨域受限，点 ↻ 刷新重试）' + srcTxt
      : '实时模式（已直连 AI HOT）' + srcTxt;
    st.hidden = true;
  } catch (e) {
    st.hidden = true;
    err.hidden = false;
    err.innerHTML = '<div class="err">拉取失败：' + esc(e.message) +
      '<br>浏览器跨域受限时页面会自动回落到内嵌快照；若快照也为空，' +
      '请在项目目录执行 <code>python pack.py --fetch</code> 重新生成后再打开。</div>';
  } finally {
    $('#btnReload').disabled = false;
  }
}

/* ================= 事件绑定 ================= */
$('#btnReload').addEventListener('click', run);

// 回到最新：倒叙页面很长，提供快捷入口。
// 已滚过最新一条时隐藏按钮；元素尚未渲染（数据加载中）时保持显示，
// 否则加载阶段会误判为"已在顶部"而让按钮凭空消失。
const btnTop = $('#btnTop');
btnTop.addEventListener('click', () => {
  const el = document.querySelector('.tl-row.newest') || $('#timeline');
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
function syncTopBtn() {
  const anchor = document.querySelector('.tl-row.newest');
  btnTop.hidden = !!anchor && anchor.getBoundingClientRect().top >= 8;
}
window.addEventListener('scroll', syncTopBtn, { passive: true });
window.addEventListener('resize', syncTopBtn);
syncTopBtn();
$('#btnTheme').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const nx = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', nx);
  try { localStorage.setItem('ib-theme', nx); } catch (e) {}
});
try {
  const sv = localStorage.getItem('ib-theme');
  if (sv) document.documentElement.setAttribute('data-theme', sv);
  else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.setAttribute('data-theme', 'dark');
} catch (e) {}

run();
/* 页面长时间开着时，每 30 分钟自动刷新一次 */
setInterval(() => { if (!document.hidden) run(); }, 1800000);
