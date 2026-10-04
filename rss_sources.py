# -*- coding: utf-8 -*-
"""
国内科技媒体 RSS 抓取器 —— 作为 AI HOT 的补充源。

实测结论（2026-10-03）：
  可用：量子位 / 雷峰网 / InfoQ中国 / OSCHINA / IT之家
  失效：机器之心（官网转 SPA，/rss 302 到 data-service，官方 API 404）
        36氪快讯（/api/newsflash 返回 SPA 空壳，无公开 JSON）
        掘金（content_api 403，需签名头）

特点：这些源全部不返回 CORS 头，浏览器无法直连，
      因此只能由 pack.py 在构建期抓取，写进内嵌快照。

产出条目沿用 AI HOT 的字段结构，额外标记 feed=1，
供 core.js / app.js 区分来源并施加不同的筛选与显示上限。
"""
import datetime
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

BJ = datetime.timezone(datetime.timedelta(hours=8))

# name, url, tier, 评分权重, 单次收录上限（控制快照体积与噪音）
FEEDS = [
    ('量子位',    'https://www.qbitai.com/feed',        2, 1.0, 12),
    ('雷峰网',    'https://www.leiphone.com/feed',      2, 1.0, 14),
    ('InfoQ中国', 'https://www.infoq.cn/feed',         2, 0.9, 10),
    ('OSCHINA',   'https://www.oschina.net/news/rss',  2, 0.7, 12),
    ('IT之家',    'https://www.ithome.com/rss/',       3, 0.5, 8),
]

# 强信号词：命中即视为 AI/算力相关（泛词需共现，见STRONG）
STRONG = re.compile(
    r'OpenAI|DeepSeek|Kimi|GLM|Qwen|Gemini|Grok|MiniMax|Hunyuan|'
    r'混元|英伟达|NVIDIA|昇腾|寒武纪|智谱|字节|豆包|文心|阶跃|'
    r'GPU|大模型|算力|芯片|半导体|智能体|Agent|人工智能|AI', re.I)

# 弱信号词：单独出现不足以判定相关，需与强信号共现
WEAK = re.compile(r'算力|芯片|半导体|AI|模型|开源|架构|数据中心')

# 泛科技消费电子：IT之家这类综合媒体会把大量非情报内容带进来
CONSUMER = re.compile(
    r'(投影仪|吹风机|电饭煲|咖啡机|路由器|键鼠|显示器|笔记本电脑|笔电|'
    r'台式机|显卡|耳机|手表|手环|冰箱|洗衣机|空调|电视|相机|镜头|'
    r'打印机|硬盘|U盘|鼠标|键盘|沙发|床垫|玩具|文具|球鞋|背包|'
    r'HDMI|移动电源|充电头|氮化镓|机械键盘|无人机|扫地机|智能马桶|'
    r'电吹风|直发梳|电池|低压|电器|耳机|腕表| Listings|开箱|值得买)')

# 软文/公关稿特征：企业宣传、行业大会综述、观点栏目
PR_FLavor = re.compile(
    r'(直播回顾|视频回顾|大会丨|大会$\|白皮书下载|报名|招募|评选|'
    r'入选|荣获|斩获|夺得|冠军|榜单|一图|盘点|综述|专栏|系列|'
    r'专题|直播|预告|圆满|帷幕|落幕|举行|举办|召开|亮相|首发阵容)')

# 明确的非情报内容
NOISE = re.compile(
    r'(游戏|Steam|手游|车企|4S店|充电桩|开奖|彩票|电视剧|综艺|电影|'
    r'football|NBA|闲鱼|抢购|618|双11|红包|彩票|天气|路况|高速拥堵|'
    r'景区|门票|菜谱|减肥|养生|车祸|气温|降雨|台风|油价|彩票|'
    r'玩家|主播|开黑|皮肤|抽卡|副本|上分|赛季|战队|俱乐部)', re.I)

# 低实质内容：教程/观点/榜单/招聘等（与 core.js 的 LOW_SUBSTANCE 对齐）
LOW_SUBSTANCE = re.compile(
    r'(教程|入门|怎么做|如何|指南|实践|技巧|工作流|榜单|第\s*\d+\s*名|'
    r'排名|分享|体验|感想|随想|访谈|播客|上手|周报|月报|盘点|汇总|'
    r'合集|书单|课程|招聘|诚聘|晚间|午间|早间|日报)')

# 明确的硬新闻动词 → 提高合成评分
HARDNEWS = re.compile(
    r'(发布|推出|上线|开源|首发|融资|估值|IPO|上市|收购|并购|财报|营收|'
    r'调查|诉讼|起诉|禁令|监管|处罚|漏洞|泄露|裁员|扩招|禁令|反垄断|'
    r'禁令|授权|合作|签约|投产|量产|交付|突破|登顶|夺冠)')

# 强主体词，用于事件聚类与主体识别
SUBJECT_HINT = re.compile(
    r'(OpenAI|Anthropic|Claude|GPT|DeepSeek|Kimi|Qwen|GLM|Grok|Gemini|'
    r'MiniMax|混元|英伟达|NVIDIA|昇腾|寒武纪|智谱|字节|豆包|百度|文心|'
    r'蚂蚁|华为|阶跃|Moonshot|OpenRouter|Manus|FTC)')

# 分类规则：顺序敏感。
# 注意 ai-models 必须命中真实模型主体词，否则「推出/发布」这类泛词
# 会把投影仪、吹风机、相机全部误分类进来（实测踩过的坑）。
CAT_RULES = [
    ('industry',    re.compile(r'(融资|估值|IPO|上市|收购|并购|财报|营收|'
                              r'监管|调查|诉讼|起诉|禁令|处罚|政策|法案|'
                              r'裁员|扩招|HC|合作|签约|投产|量产|交付|'
                              r'订单|财报|股东|诉讼|反垄断|整改|合规)', re.I)),
    ('research',    re.compile(r'(论文|研究|评测|基准|实验|方法论|综述|'
                              r'数据集|开源数据集|白皮书)', re.I)),
    ('ai-models',   re.compile(r'(OpenAI|Anthropic|Claude|GPT|DeepSeek|Kimi|'
                              r'Qwen|GLM|Grok|Gemini|MiniMax|混元|Hunyuan|'
                              r'Llama|Mistral|DeepSeek-V|R1|开源模型|'
                              r'大模型发布|模型发布|新模型|模型升级)', re.I)),
    ('ai-products', re.compile(r'(智能体|Agent|应用|APP|软件|平台|服务|'
                              r'框架|SDK|助手|工具|产品|系统|芯片|GPU|'
                              r'算力|半导体|数据中心|加速卡)', re.I)),
]
CAT_DEFAULT = 'ai-products'


def strip_tags(s):
    return re.sub(r'<[^>]+>', '', s or '').replace('&nbsp;', ' ').strip()


def parse_rfc822(s):
    """RSS pubDate (RFC822) -> ('%Y-%m-%d %H:%M', iso8601)，失败返回 (None, None)。"""
    from email.utils import parsedate_to_datetime
    try:
        d = parsedate_to_datetime(s)
        if d.tzinfo is None:
            d = d.replace(tzinfo=datetime.timezone.utc)
        bj = d.astimezone(BJ)
        return bj.strftime('%Y-%m-%d %H:%M'), bj.isoformat()
    except Exception:
        return None, None


def fetch_xml(url, retries=3):
    for i in range(retries):
        try:
            out = subprocess.run(
                ['curl', '-sS', '--max-time', '35', '-H',
                 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) aihot-rss/1.0',
                 '-H', 'Accept: application/rss+xml, application/xml, text/xml, */*',
                 url],
                capture_output=True, timeout=50)
            raw = out.stdout
            if raw and b'<rss' in raw[:400] or raw[:200].strip().startswith(b'<?xml'):
                return raw
        except Exception as e:
            if i == retries - 1:
                print('    [FAIL] %s: %s' % (url, e), file=sys.stderr)
        import time
        time.sleep(1.6 * (i + 1))
    return b''


def parse_items(raw):
    if not raw:
        return []
    try:
        root = ET.fromstring(raw)
    except Exception:
        return []
    out = []
    for node in root.iter('item'):
        g = lambda tag: (node.findtext(tag) or '')
        title = strip_tags(g('title'))
        link = (g('link') or '').strip()
        desc = strip_tags(g('description'))
        if not title or not link:
            continue
        out.append((title, link, desc, g('pubDate').strip()))
    return out


def synth_score(title, desc, tier, weight):
    """为无 score 字段的 RSS 条目合成一个与 AI HOT（28–88）可比的评分。"""
    s = 60.0
    if SUBJECT_HINT.search(title):
        s += 7
    if HARDNEWS.search(title):
        s += 8
    elif HARDNEWS.search(desc):
        s += 3
    # 明确的对比/评测类信息量高
    if re.search(r'(对比|评测|实测|vs| Versus|横评)', title, re.I):
        s += 4
    # 一手机构视角
    if tier == 2:
        s += 3
    else:
        s -= 4
    s *= weight
    return int(max(28, min(88, round(s))))


def classify(text):
    for cat, rx in CAT_RULES:
        if rx.search(text):
            return cat
    return CAT_DEFAULT


def norm_title(s):
    return re.sub(r'[^a-z0-9\u4e00-\u9fff]', '', (s or '').lower())


def collect(days=7, since=None):
    """抓取全部 RSS 源，返回归一化条目列表（未去重）。"""
    if since is None:
        since = datetime.datetime.now(BJ) - datetime.timedelta(days=days)
    since_iso = since.isoformat()
    now = datetime.datetime.now(BJ)

    pool, stats = [], []
    for name, url, tier, weight, cap in FEEDS:
        raw_items = parse_items(fetch_xml(url))
        kept, dropped = 0, 0
        for title, link, desc, rdate in raw_items:
            bj_str, bj_iso = parse_rfc822(rdate)
            if not bj_iso:
                dropped += 1
                continue
            if bj_iso < since_iso or bj_iso > now.isoformat():
                dropped += 1
                continue
            body = title + ' ' + desc
            # 相关性：强信号命中，或弱信号与强信号共现
            strong_hit = bool(STRONG.search(body))
            weak_hit = bool(WEAK.search(title))
            if not (strong_hit or (weak_hit and SUBJECT_HINT.search(title))):
                dropped += 1
                continue
            if NOISE.search(title):
                dropped += 1
                continue
            if CONSUMER.search(title):
                dropped += 1
                continue
            if PR_FLavor.search(title):
                dropped += 1
                continue
            if LOW_SUBSTANCE.search(title):
                dropped += 1
                continue
            pool.append({
                'id': 'rss_%s_%s' % (name, norm_title(title)[:24]),
                'title': title,
                'summary': clip(desc, 300) or title,
                'source': name,
                'aihot': '',                       # RSS 无 AI HOT 页
                'original': link,
                'pub': bj_iso,
                'disc': bj_iso,
                'cat': classify(body),
                'score': synth_score(title, desc, tier, weight),
                'sel': 0,
                'feed': 1,
                'feedWeight': weight,
            })
            kept += 1
        over = max(0, kept - cap)
        if over:
            #按合成评分排序，砍掉超出上限的低分条目
            pool = pool[:len(pool) - kept] + sorted(
                pool[len(pool) - kept:], key=lambda x: -x['score'])[:cap]
            kept = cap
            dropped += over
        stats.append((name, len(raw_items), kept, dropped))
        import time
        time.sleep(0.5)

    return pool, stats


def clip(s, n):
    s = re.sub(r'\s+', ' ', s or '').strip()
    return s if len(s) <= n else s[:n - 1].rstrip('，。、；,.; ') + '…'


def merge_with_aihot(rss_items, aihot_items):
    """把RSS 条目并入 AI HOT 池，按标题指纹去重（保留 AI HOT 的 score）。"""
    seen = {norm_title(x.get('title'))[:18] for x in aihot_items}
    out, dup = [], 0
    for it in rss_items:
        k = norm_title(it['title'])[:18]
        if k in seen:
            dup += 1
            continue
        seen.add(k)
        out.append(it)
    return out, dup


if __name__ == '__main__':
    items, st = collect()
    print('%-12s %6s %6s %6s' % ('源', '原始', '收录', '剔除'))
    print('-' * 34)
    for n, a, b, c in st:
        print('%-12s %6d %6d %6d' % (n, a, b, c))
    print('\n合计收录 %d 条' % len(items))
    print(json.dumps(items[:2], ensure_ascii=False, indent=1))
