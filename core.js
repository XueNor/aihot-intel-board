/* ============================================================
   AI HOT 科技情报看板 — 自更新单文件
   浏览器直连 aihot.virxact.com（已开放 CORS: *），无需重建文件。
   策展规则与 Python 版 curate.py 一致。
   ============================================================ */

const API = 'https://aihot.virxact.com/api/v1/items';
const KEYWORDS = ['OpenAI', 'DeepSeek', 'Kimi', 'GLM', 'Qwen', 'Gemini', 'Grok',
                  '混元', 'MiniMax', '芯片', 'GPU', '算力', '半导体', '英伟达', '硬件'];
const CATS = [
  ['ai-models', 'ai-models', 'Models'],
  ['ai-products', 'ai-products', 'Products'],
  ['industry', 'industry', 'Industry'],
  ['paper', 'paper', 'Papers'],
  ['tip', 'tip', 'Insights'],
];

/* ---------- 信源分级 ---------- */
const T1 = ['Google DeepMind', 'OpenAI', 'Anthropic', 'Claude：Blog', 'Claude.dev',
  'NVIDIA', 'MIT News', 'Ars Technica', 'The Decoder', 'Reuters', 'Bloomberg',
  'Financial Times', 'Hugging Face', 'vLLM', 'PromptArmor', 'AI Security Institute',
  'AISI', 'Epoch AI', 'Modal', 'Suno', 'ElevenLabs', 'DeepSeek', 'Google', 'Meta',
  'Microsoft', 'Lightmatter', '深度求索'];
const T2 = ['MarkTechPost', 'IT之家', 'Artificial Analysis', 'TechCrunch',
  'VentureBeat', 'Hacker News', 'Tomer Tunguz', 'IEEE',
  // 国内 RSS 补充源：专业媒体，算T2
  '量子位', '雷峰网', 'InfoQ中国', 'OSCHINA'];
// IT之家在 AI HOT 里是 T2，但 RSS 版是消费电子快讯流，单列为 T3
const FEED_T3 = ['IT之家'];
const SOCIAL = /^(X：|Reddit|Hacker News：AI 热帖|公众号)/;

function tierOf(s = '') {
  if (FEED_T3.includes(s)) return 3;
  if (T1.some(t => s.startsWith(t) || s.includes(t))) return 1;
  if (T2.some(t => s.includes(t))) return 2;
  if (SOCIAL.test(s)) return 3;
  return 2;
}

const MARKETING = ['限时免费', '促销', '折扣', '立减', '限时', '首发福利', '报名',
                   '优惠券', '免费试用', '重磅', '荣耀', '喜报', '助力', '促销'];
function isPromo(it) {
  const b = (it.title || '') + ' ' + (it.summary || '');
  if (MARKETING.some(m => b.includes(m))) return true;
  const s = it.source || '';
  return s.includes('官方') && s.includes('Announcements');
}

/* ---------- 事件聚类 ---------- */
const PRODUCTS = ['Gemini 4 Argon', 'GPT-6.1 Sol', 'GPT-6 Astra', 'GPT-6', 'Claude Code',
  'Hugging Face', 'DeepSeek', '昇腾', 'Epoch AI', 'ChatGPT', 'ElevenLabs', 'Suno',
  'Gemini', 'Kimi', 'Qwen', 'GLM', 'Grok', 'MiniMax', '混元', 'vLLM', 'Modal',
  'Manus', 'Perplexity', 'AISI', 'FTC', 'OpenRouter', 'LangChain',
  'Dots', 'Codex', 'Claude', 'Sonnet', 'Opus', 'Athena', 'DeepSeek-V3', '豆包',
  '文心', 'Step', '阶跃', 'K2', 'GLM-5', 'Qwen3', 'Hunyuan', '天问', 'Bailing'];
const ORGS = ['OpenAI', 'Anthropic', 'Google', 'DeepMind', 'NVIDIA', 'Microsoft',
  'Meta', 'Amazon', 'Trump', 'Mollick', 'Marcus', 'Schwartz', 'Jensen Huang',
  'Altman', 'Bezos'];

/* 主体识别：同一位置命中多个词时取最长的（GPT-6.1 Sol 优先于 GPT-6），
   否则短词会抢走长词的事件归属。 */
function pickSubject(text) {
  const lower = text.toLowerCase();
  for (const pool of [PRODUCTS, ORGS]) {
    let best = null;
    for (const pat of pool) {
      const i = lower.indexOf(pat.toLowerCase());
      if (i < 0) continue;
      const cand = [i, -pat.length, pat];
      if (!best || (cand[0] < best[0] ||
          (cand[0] === best[0] && cand[1] < best[1]))) best = cand;
    }
    if (best) return best[2];
  }
  return null;
}

const ASPECTS = [
  ['benchmark', /榜单|排名|第\s*\d+\s*名|登\s|位次|得分|净提升|跑分|Score per|Arena|Elo/],
  ['regulatory', /调查|诉讼|传票|禁令|监管|裁定|处罚|合规|probe|lawsuit|ban|court|regulat|subpoena|antitrust/i],
  ['security', /漏洞|攻击|窃取|泄露|安全事件|劫持|绕过|沙箱逃逸|失准|breach|exploit|vulnerab|hack|attack|leak|蒸馏攻击|入侵/],
  ['finance', /融资|估值|IPO|上市|收购|并购|回购|财报|营收|funding|valuation|acqui|revenue|earnings/i],
];
function aspectOf(t) {
  for (const [n, rx] of ASPECTS) if (rx.test(t)) return n;
  return 'news';
}

/* ---------- 子事件细分 ----------
   仅靠「主体 + 侧面」会把同一主体的不同事件并成一簇。
   实测：OpenAI 的 14 篇报道里混了失准报告×3、DevDay 发布×4、
   蒸馏攻击×2、融资×1 —— 全部落到 OpenAI/news 一个指纹。
   这里从标题里再抽一个「事件动词」做二次区分。 */
const EVENT_VERBS = [
  ['devday',  /DevDay/i],
  ['融资',     /融资|估值|IPO|募资/],
  ['收购',     /收购|并购|买下/],
  ['发布',     /发布|推出|上线|开源|首发|introduc|launch|releas|unveil/i],
  ['用户数',   /用户|活跃|月活|日活|周活|订阅量/],
  ['安全事件', /失准|漏洞|攻击|入侵|泄露|绕过|窃取|红队/],
  ['监管',     /调查|诉讼|传票|禁令|监管|裁定|处罚|FTC/],
  ['人事',     /离职|辞职|入职|裁员|开除|负责人/],
  ['合作',     /合作|签约|联手|联盟|partner/],
];
function eventVerb(t) {
  for (const [n, rx] of EVENT_VERBS) if (rx.test(t)) return n;
  return '';
}

/* 无主体条目的兜底指纹：从标题里取实词集合，
   这样同一事件的不同媒体报道仍能落到同一簇（共享实词即视为同一事件）。 */
function fallbackSubject(t, s) {
  const words = (t + ' ' + (s || ''))
    .replace(/[^一-鿿A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 2);
  if (!words.length) return t.slice(0, 10) || 'untitled';
  // 取最长的 3 个实词，顺序无关（比较时用 sort）
  return words.sort((a, b) => b.length - a.length).slice(0, 3)
              .sort().join('_');
}

function key(it) {
  const t = it.title || '', s = it.summary || '';
  const named = pickSubject(t) || pickSubject(s);
  const aspect = aspectOf(t + ' ' + s);
  // aspect 已细化时（regulatory/security/finance）信息量足够，只按主体聚类
  if (aspect !== 'news') {
    return (named || fallbackSubject(t, s)) + '||' + aspect;
  }
  // news 侧面太宽泛，必须再用事件动词细分
  if (named) return named + '||' + aspect + '||' + eventVerb(t);
  // 无主体：动词 + 实词指纹双保险
  return fallbackSubject(t, s) + '||' + aspect + '||' + eventVerb(t);
}

function buildEvents(items) {
  const b = new Map();
  for (const it of items) {
    const k = key(it);
    if (!b.has(k)) b.set(k, []);
    b.get(k).push(it);
  }
  const out = [];
  for (const [k, rows] of b) {
    const sources = [...new Set(rows.map(r => r.source))];
    const lead = rows.slice().sort((a, c) =>
      (tierOf(c.source) === 1) - (tierOf(a.source) === 1) ||
      (c.score || 0) - (a.score || 0))[0];
    out.push({
      key: k, subject: k.split('||')[0], aspect: k.split('||')[1],
      items: rows.sort((a, c) => (c.score || 0) - (a.score || 0)),
      lead, sources, sourceCount: sources.length,
      tier: Math.min(...sources.map(tierOf)),
      date: lead.date,
      maxScore: Math.max(...rows.map(r => r.score || 0)),
    });
  }
  return out;
}

/* ---------- 筛选与排序 ---------- */
const LOW_SUBSTANCE = /教程|入门|怎么做|如何|指南|实践|技巧|工作流|榜单|第\s*\d+\s*名|登\s|排名|分享|体验|感想|随想|访谈|对话|播客|招聘|上手|周报|月报|盘点|汇总|合集|书单|课程/;

/* ---------- 时间窗：滚动最近 5 天，倒序（最新在前） ---------- */
const WINDOW_DAYS = 5;
function windowBounds(anyYmd) {
  // 含当天在内的最近 N 天，闭区间 [end-(N-1), end]
  const d = new Date(anyYmd + 'T12:00:00+08:00');
  const f = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const start = new Date(d); start.setDate(d.getDate() - (WINDOW_DAYS - 1));
  return { start: f(start), end: f(d) };
}
/* 返回倒序日期数组：今天在最前，最旧在最后。
   时间流按此顺序渲染，因此最新内容始终置顶。 */
function windowDays(anyYmd) {
  const { start, end } = windowBounds(anyYmd);
  const out = [];
  const d = new Date(end + 'T12:00:00+08:00');
  const s = new Date(start + 'T12:00:00+08:00');
  const f = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  while (d >= s) { out.push(f(d)); d.setDate(d.getDate() - 1); }
  return out;
}

function firstPartyDate(ev, pool) {
  const ids = new Set(ev.items.map(x => x.id));
  const ds = pool.filter(r => !ids.has(r.id) && key(r) === ev.key && tierOf(r.source) === 1)
                  .map(r => r.date).sort();
  return ds[0] || null;
}
function rankScore(ev) {
  const cred = { 1: 1.0, 2: 0.82, 3: 0.55 }[ev.tier];
  const corrob = 1 + 0.16 * (ev.sourceCount - 1);
  const fresh = ev.firstPartyDate ? 0.88 : 1.0;
  return (ev.maxScore || 0) * cred * corrob * fresh;
}
function judge(ev) {
  const tags = [], notes = [];
  tags.push(ev.tier === 1 ? '机构官方/权威媒体' :
            ev.tier === 2 ? '专业媒体/分析机构' : '个人观点/社媒');
  tags.push(ev.sourceCount >= 2 ? ev.sourceCount + ' 源交叉印证' : '单一信源');
  if (ev.tier === 1 && ev.sources.some(s => /官方|Blog|Newsroom/.test(s)))
    notes.push('有一手发布渠道');
  notes.push(ev.maxScore >= 80 ? '编辑部评分高' :
             ev.maxScore >= 70 ? '编辑部评分中高' : '编辑部评分中等');
  const b = (ev.lead.title || '') + ' ' + (ev.lead.summary || '');
  if (/发布|推出|上线|开源|introduc|launch|releas/i.test(b)) notes.push('含可验证的产品/技术动作');
  if (/调查|诉讼|传票|禁令|监管|probe|ban|lawsuit|subpoena/i.test(b)) notes.push('涉及监管/法律程序，事实性较强');
  // 只认明确的攻击/泄露动作，不认泛指的「安全」（合规声明里也常出现）
  if (/漏洞|攻击|泄露|入侵|勒索|数据窃取|breach|exploit|vulnerab|hack|attack|leak/i.test(b))
    notes.push('涉及安全事件，有技术证据');
  if (ev.firstPartyDate) {
    // 一手信源晚于事件日 = 官方事后确认；早于/等于 = 媒体跟进报道
    const d = ev.firstPartyDate.slice(5).replace(/-/g, '/');
    notes.push(ev.firstPartyDate > (ev.date || '')
      ? '官方事后确认（一手信源 ' + d + '）'
      : '跟进报道（一手信源最早见于 ' + d + '）');
  }
  return [tags.join(' · '), notes.join('；')];
}
/* 关键事件：从整个时间窗内挑选，不再只看昨日。
   窗口内事件可能很多，仍沿用「重要性 × 可信度」排序 + 来源配额。 */
function pickTop(pool, windowPool, limit) {
  const events = buildEvents(windowPool)
    .map(e => { e.firstPartyDate = firstPartyDate(e, windowPool); return e; });
  const kept = [], dropped = [];
  for (const ev of events) {
    const t = ev.lead.title || '';
    if (ev.lead.cat === 'tip' || LOW_SUBSTANCE.test(t)) {
      dropped.push([ev, 'low_substance', '教程/观点/榜单类，非事实性情报']); continue;
    }
    if (isPromo(ev.lead) && ev.tier >= 2) {
      dropped.push([ev, 'vendor_promo', '疑似厂商营销/公关稿']); continue;
    }
    if (ev.tier === 3 && ev.sourceCount === 1) {
      dropped.push([ev, 'unverified', '仅单一社媒来源，缺乏可靠信源']); continue;
    }
    kept.push(ev);
  }
  kept.sort((a, b) => rankScore(b) - rankScore(a));

  // 补充源席位不超过 feedShare，避免主源被边缘化
  const feedCap = Math.max(1, Math.floor(limit * (1 - CAPS.feedShare)));
  const out = [];
  let feedUsed = 0;
  for (const ev of kept) {
    if (out.length >= limit) break;
    if (ev.lead.feed) {
      if (feedUsed >= feedCap) continue;
      feedUsed++;
    }
    out.push(ev);
  }
  // 补充源挤占名额导致不足额时，用主源补齐（宁缺毋滥仍由上面规则保证）
  if (out.length < limit) {
    for (const ev of kept) {
      if (out.length >= limit) break;
      if (!out.includes(ev)) out.push(ev);
    }
  }
  out.sort((a, b) => rankScore(b) - rankScore(a));
  return { kept: out, dropped, total: events.length, feedUsed };
}

/* ---------- 取数 ---------- */
const cache = new Map();
async function fetchKw(kw, force) {
  const url = `${API}?mode=selected&q=${encodeURIComponent(kw)}&window=7d&limit=100`;
  if (!force && cache.has(url)) return cache.get(url);
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} @ ${kw}`);
  const j = await r.json();
  const v = j.items || [];
  cache.set(url, v);
  return v;
}
async function fetchKwAll(kw) {
  const url = `${API}?mode=all&q=${encodeURIComponent(kw)}&window=7d&limit=100`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) return [];
  return (await r.json()).items || [];
}

/* ---------- 显示数量上限 ----------
   单流视图下所有内容都在一个页面里，限流更关键：
   5 天窗口若不限流，合并国内源后会膨胀到 200+ 行。
   规则：AI HOT 条目优先占位，国内 RSS 源按 feedShare 分配剩余配额。 */
const CAPS = {
  timelinePerDay: 8,     // 时间线每天最多展示的事件数
  themePerCard: 6,       // 每张主题卡片最多条目
  topPick: 5,            // 关键事件最终条数
  feedShare: 0.34,       // 单一 RSS 源在时间线里最多占的席位数
};

async function loadAll(onProgress) {
  const map = new Map();
  let done = 0;
  let live = 0;
  for (const kw of KEYWORDS) {
    let rows = [];
    try { rows = await fetchKw(kw); live += rows.length; } catch (e) { onProgress?.(`${kw} 取数失败`, done); }
    if (!rows.length) { try { rows = await fetchKwAll(kw); live += rows.length; } catch (e) {} }
    for (const it of rows) {
      const i = it.id;
      if (map.has(i)) { map.get(i).kws.add(kw); continue; }
      map.set(i, {
        id: i, kws: new Set([kw]), title: it.title, summary: it.summary,
        source: it.source.name, aihot: it.links.aihot, original: it.links.original,
        pub: it.publishedAt, disc: it.discoveredAt, cat: it.category,
        score: it.score, sel: it.selected,
      });
    }
    done++;
    onProgress?.(`${kw} → ${rows.length} 条`, done);
  }

  // 国内 RSS 源无 CORS 头，浏览器无法直连，只能从内嵌快照取。
  // 这里与实时结果「合并」而非二选一 —— 否则实时成功时RSS 条目会被整体丢弃。
  const liveTitles = new Set([...map.values()].map(x => normTitle(x.title)));
  let feedAdded = 0;
  if (typeof SNAPSHOT !== 'undefined' && SNAPSHOT.length) {
    for (const s of SNAPSHOT) {
      if (!s.feed) continue;
      const k = normTitle(s.title);
      if (!k || liveTitles.has(k)) continue;
      liveTitles.add(k);
      map.set(s.id, Object.assign({ kws: new Set(['rss']) }, s));
      feedAdded++;
    }
  }
  return { pool: [...map.values()], live, feedAdded };
}

function normTitle(s) {
  return String(s || '').toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, '').slice(0, 18);
}
