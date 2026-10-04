# -*- coding: utf-8 -*-
"""
把 core.js + app.js + 数据快照 打包成单文件 aihot-intel.html

用法：
  python pack.py                    # 用现有 data/refreshed.json 打包
  python pack.py --fetch            # 先抓取全部数据源，再打包
  python pack.py --clean            # 只清理中间产物与历史快照，保留当前快照
  python pack.py --style cassette   # 改用卡带未来主义模板（输出 aihot-intel-cassette.html）

样式（STYLES）只影响视觉层：DOM 结构、core.js / app.js、数据快照完全一致，
因此「不改变原有内容」——同一份数据可并行产出多种皮肤。

数据源：
  - AI HOT   api/v1/items  浏览器可直连（构建期抓取用于快照兜底）
  - 国内 RSS  见 rss_sources.py（无 CORS，只能构建期抓取）

目录约定：只保留 data/refreshed.json 一个快照文件；
raw_*.json / merged.json / d2/ 等中间产物会在打包后自动清除。
注意：*cassette.html 是一套并行的卡带未来主义风格方案，
不属于本打包流程，清理规则已显式声明保留。
"""
import json, os, subprocess, sys, time, urllib.parse, glob, datetime, shutil
import rss_sources

HERE = os.path.dirname(os.path.abspath(__file__))
API = 'https://aihot.virxact.com/api/v1/items'
KEYWORDS = ['OpenAI', 'DeepSeek', 'Kimi', 'GLM', 'Qwen', 'Gemini', 'Grok',
            '混元', 'MiniMax', '芯片', 'GPU', '算力', '半导体', '英伟达', '硬件']
KEEP = ('id', 'title', 'summary', 'source', 'aihot', 'original', 'pub', 'disc',
        'cat', 'score', 'sel')
SNAPSHOT = 'data/refreshed.json'

# 皮肤表：(模板文件, 输出文件名)。模板必须与 tpl.html 保持相同的 DOM 骨架，
# 因为 core.js / app.js 依赖那一组固定的 id/class 绑定事件与填充内容。
STYLES = {
    'swiss':   ('tpl.html',            'aihot-intel.html'),
    'cassette': ('tpl-cassette.html',  'aihot-intel-cassette.html'),
}

# 中间产物：抓取过程中的分片缓存，打包后无用途
TRANSIENT = ('data/raw_*.json', 'data/merged.json', 'data/all_*.json',
             'data/pool.json', '*.tmp', '*.bak', 'dist/')
# 历史目录：早期架构遗留，pack.py 已不再引用
DEAD_DIRS = ('d2',)
# 调试工具的输出目录（tools/shot.mjs、check-btn.mjs 截图产物）
SCRATCH_DIRS = ('.shots',)
# 并行设计方案的产物（另一套风格模板），不属于本打包流程，清理时须保留
PRESERVE = ('tpl-cassette.html', 'aihot-intel-cassette.html')


def clean(quiet=False):
    """删除中间产物与废弃目录，保留当前快照。"""
    freed, removed = 0, 0

    for pat in TRANSIENT:
        for f in glob.glob(os.path.join(HERE, pat)):
            if os.path.abspath(f) == os.path.join(HERE, SNAPSHOT):
                continue
            try:
                freed += os.path.getsize(f)
                os.remove(f)
                removed += 1
                if not quiet:
                    print(f'  删除 {os.path.relpath(f, HERE)}')
            except OSError as e:
                print(f'  [跳过] {f}: {e}')

    for d in DEAD_DIRS + SCRATCH_DIRS:
        p = os.path.join(HERE, d)
        if os.path.isdir(p):
            for root, _, files in os.walk(p):
                for fn in files:
                    try:
                        freed += os.path.getsize(os.path.join(root, fn))
                    except OSError:
                        pass
            shutil.rmtree(p, ignore_errors=True)
            removed += 1
            if not quiet:
                print(f'  删除目录 {d}/')

    if not quiet:
        print(f'清理完成：{removed} 项，释放 {freed/1024:.0f} KB')
    return freed


def fetch(force=False):
    """向 AI HOT 拉取全部关键词，合并去重后写入 data/refreshed.json"""
    cachef = os.path.join(HERE, 'data', 'refreshed.json')
    if not force and os.path.exists(cachef) and \
            time.time() - os.path.getmtime(cachef) < 1800:
        print('30 分钟内已抓取，跳过。使用 data/refreshed.json')
        return json.load(open(cachef, encoding='utf-8'))

    pool, live = {}, 0
    for i, kw in enumerate(KEYWORDS, 1):
        got = []
        for mode in ('selected', 'all'):
            url = (f'{API}?mode={mode}&q={urllib.parse.quote(kw)}'
                   f'&window=7d&limit=100')
            try:
                out = subprocess.run(
                    ['curl', '-sS', '--max-time', '40', '-H',
                     'User-Agent: aihot-skill/1.2.1', url],
                    capture_output=True, timeout=60)
                d = json.loads(out.stdout.decode('utf-8'))
                got = d.get('items') or []
            except Exception as e:
                print(f'  {kw} [{mode}] 失败: {e}')
                got = []
            if got:
                break
        live += len(got)
        for it in got:
            iid = it['id']
            if iid in pool:
                continue
            pool[iid] = {
                'id': iid, 'title': it['title'], 'summary': it.get('summary'),
                'source': it['source']['name'], 'aihot': it['links']['aihot'],
                'original': it['links']['original'],
                'pub': it.get('publishedAt'), 'disc': it['discoveredAt'],
                'cat': it.get('category'), 'score': it.get('score'),
                'sel': it.get('selected'),
            }
        print(f'  [{i}/{len(KEYWORDS)}] {kw} → {len(got)} 条（累计 {live}）')
        time.sleep(0.6)

    snap = list(pool.values())

    # ---- 并入国内RSS 源（AI HOT 抓不到的国产算力 / 独家报道）----
    rss_items, rss_stats = rss_sources.collect(days=7)
    rss_merged, rss_dup = rss_sources.merge_with_aihot(rss_items, snap)
    for it in rss_merged:
        it.setdefault('aihot', '')
        snap.append(it)
    print('\n国内 RSS 源：')
    for name, raw, kept, dropped in rss_stats:
        print(f'  {name:<12} 原始 {raw:>3} → 收录 {kept:>3} · 剔除 {dropped}')
    print(f'  合计新增 {len(rss_merged)} 条（与 AI HOT 标题重复 {rss_dup} 条已跳过）')

    os.makedirs(os.path.join(HERE, 'data'), exist_ok=True)
    json.dump(snap, open(cachef, 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    print(f'写入 {cachef}：{len(snap)} 条去重条目')
    return snap


def main():
    if '--clean' in sys.argv:
        print('清理中间产物：')
        clean()
        return 0

    if '--fetch' in sys.argv:
        snap = fetch(force=True)
    else:
        # 只认唯一的快照文件。早期版本曾回退到 d2/snapshot.json，
        # 该目录已废弃并清理，避免残留数据被误当作最新快照。
        p = os.path.join(HERE, 'data', 'refreshed.json')
        if os.path.exists(p):
            snap = json.load(open(p, encoding='utf-8'))
            print(f'使用 data/refreshed.json：{len(snap)} 条')
        else:
            print('未找到快照，先运行 python pack.py --fetch')
            return 1

    style = 'swiss'
    if '--style' in sys.argv:
        i = sys.argv.index('--style')
        if i + 1 >= len(sys.argv):
            print('--style 需要一个参数，可选：' + ' / '.join(STYLES))
            return 1
        style = sys.argv[i + 1]
    if style not in STYLES:
        print(f'未知样式 {style}，可选：' + ' / '.join(STYLES))
        return 1
    tpl_name, out_name = STYLES[style]

    tpl = open(os.path.join(HERE, tpl_name), encoding='utf-8').read()
    core = open(os.path.join(HERE, 'core.js'), encoding='utf-8').read()
    app = open(os.path.join(HERE, 'app.js'), encoding='utf-8').read()

    js = ('/* 内嵌快照 %s */\nconst SNAPSHOT=%s;\n'
          % (datetime.date.today().isoformat(),
             json.dumps(snap, ensure_ascii=False, separators=(',', ':'))))
    out = tpl.replace('/*__CORE__*/', js + core).replace('/*__APP__*/', app)
    assert '__CORE__' not in out and '__APP__' not in out

    dst = os.path.join(HERE, out_name)
    open(dst, 'w', encoding='utf-8').write(out)
    print(f'生成 {dst}（{len(out):,} 字符，内嵌 {len(snap)} 条快照，样式 {style}）')

    print('\n清理中间产物：')
    clean()
    return 0


if __name__ == '__main__':
    sys.exit(main())
