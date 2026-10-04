# 项目文件与配置清单

> 记录 AI HOT 情报看板的**每个文件是干什么的**、**哪些必须提交**、**哪些可以删**。
> 用于重新部署时快速了解项目结构，或评估改动的影响范围。

---

## 一、仓库文件（12 个 · 229 KB）

### 核心源代码

| 文件 | 体积 | 作用 | 必需 |
|---|---|---|---|
| `pack.py` | 12 KB | 抓取 + 打包主脚本。全用 Python 标准库，零第三方依赖 | ✅ |
| `rss_sources.py` | 11 KB | 5 个国内 RSS 源配置（量子位/雷峰网/InfoQ/OSCHINA/IT之家） | ✅ |
| `core.js` | 15 KB | 数据逻辑：去重合并、事件聚合、评分排序、时间窗计算 | ✅ |
| `app.js` | 17 KB | 渲染与交互：时间线、主题卡、关键事件、回到最新按钮 | ✅ |
| `tpl.html` | 17 KB | 瑞士风皮肤模板（DOM 骨架） | ✅ |
| `tpl-cassette.html` | 25 KB | 卡带未来主义皮肤模板 | ✅ |
| `data/refreshed.json` | 116 KB | 唯一快照文件，云端抓取失败时的兜底数据源 | ✅ |

### 部署

| 文件 | 体积 | 作用 | 必需 |
|---|---|---|---|
| `.github/workflows/daily-deploy.yml` | 12 KB | 自动部署工作流。**删掉则每日更新完全停止** | ✅ |
| `tools/parse_deploy.py` | 8 KB | 解析 EdgeOne CLI 输出判断成败。三条解析路径 | ✅ |
| `.gitignore` | 678 B | 排除构建产物、本地工具、`.workbuddy/` | ✅ |
| `DEPLOY-international.md` | 8 KB | 国际版部署手册 | 建议 |

---

## 二、本地文件（不提交 Git）

| 文件 | 体积 | 说明 |
|---|---|---|
| `aihot-intel.html` | 168 KB | **构建产物**，`pack.py` 每次重新生成 |
| `aihot-intel-cassette.html` | 172 KB | 卡带皮肤构建产物 |
| `dist/index.html` | 168 KB | EdgeOne 上传用，命名规范要求 `index.html` |
| `.edgeone/project.json` | 62 B | CLI 自动生成的项目关联配置 |
| `.workbuddy/` | — | 助手工作记忆，**个人笔记不进仓库** |

### 本地调试工具（已被 `.gitignore` 排除）

| 文件 | 作用 |
|---|---|
| `tools/verify.mjs` | 渲染校验（标签页数、时间线行数、字段完整性） |
| `tools/shot.mjs` | 明暗双主题截图，用于视觉回归 |
| `tools/check-btn.mjs` | 「回到最新」按钮专项检查（滚动、hover、透明度） |

> 这三个依赖 Chrome DevTools 调试端口 `127.0.0.1:9222`，仅本机可用。

---

## 三、依赖情况

### GitHub Actions 环境

```
Python 3.12     仅标准库（json/re/subprocess/xml.etree/urllib），零 pip 安装
curl            Ubuntu runner 自带
Node.js         runner自带 24.x，edgeone CLI 要求 >=12
edgeone CLI     npx --yes edgeone@latest（自动下载，缓存 ~/.npm/_npx）
```

**不需要任何 API Key 来抓取数据**——AI HOT 接口返回
`access-control-allow-origin: *`，公网直连可跨域。国内 RSS 无 CORS，
只能在构建期由 `pack.py` 抓取。

### 唯一必需的凭证

**EdgeOne API Token**，存于 GitHub Secret，名为 `BOARD`。

| 属性 | 值 |
|---|---|
| 权限范围 | **账号级**（能以你的身份部署） |
| 保存位置 | GitHub Secrets，**绝不进代码** |
| 有效期 | 最长 1 年，建议设置 |
| 获取位置 | EdgeOne 控制台账号级设置页（非项目内部） |

---

## 四、环境变量与配置

### 工作流 job 级

```yaml
SITE_NAME: aihot-intel-board   # 写死，不从 Secret 读
EDGEONE_AREA: global           # 国际版（邮箱注册，免备案）
```

### 权限

```yaml
permissions:
  contents: read   # 最小权限；不写回仓库
```

### 触发条件

```yaml
on:
  push:
    branches: [main]
  schedule:
    - cron: '0 1 * * *'    # UTC 1:00 = 北京时间 09:00
  workflow_dispatch:         # 支持手动触发
```

### 并发控制

```yaml
concurrency:
  group: intel-board-deploy
  cancel-in-progress: false   # 上一轮没跑完不打断，避免部署半成品
```

---

## 五、数据流

```
AI HOT API（浏览器可直连）
      ↓
国内 5 个 RSS 源（无 CORS，仅构建期抓取）
      ↓
pack.py --fetch
      ├─ data/refreshed.json   唯一快照（115~160 条）
      └─ aihot-intel.html      内嵌快照的单文件页面
      ↓
Actions: cp aihot-intel.html dist/index.html
      ↓
edgeone makers deploy ./dist
```

### 快照字段

```json
{
  "id": "eu8pag1qg6pf93gn9k1ql0m0z",
  "title": "标题",
  "summary": "摘要全文",
  "source": "来源名称",
  "aihot": "https://aihot.news/items/...",
  "original": "原文链接",
  "pub": null,
  "disc": "2026-10-03T15:50:46.034Z",
  "cat": "ai-models",
  "score": 79,
  "sel": true,
  "feed": "rss-源标识"    // 仅 RSS 条目有
}
```

### 内嵌快照的体积

| 部分 | 原始 | gzip 后 |
|---|---|---|
| 快照 JSON | 80 KB | 44 KB |
| 整页 HTML | 163 KB | ~41 KB |

**为什么不能删快照**（实测数据）：

1. **速度几乎不变** —— 删掉只省约 19KB 传输量，但会多一个网络往返（100~300ms），
   体感可能更慢
2. **实时拉取失败就白屏** —— `app.js:284-286` 的回落逻辑依赖快照：
   ```js
   const useSnap = (!pool.length || live === 0) && hasSnap;
   if (!pool.length && !useSnap) throw new Error('接口未返回任何条目');
   ```
3. **44 条 RSS 彻底丢失** —— 无 CORS，浏览器永远拉不到，只能靠构建期抓取写进快照

---

## 六、删文件的影响对照

### 可以安全删（不影响云端部署）

| 文件 | 原因 |
|---|---|
| `aihot-intel*.html` | 构建产物，Actions 每次重新生成 |
| `dist/`、`.edgeone/` | 本地产物，`.gitignore` 已排除 |
| `tools/{verify,shot,check-btn}.mjs` | 纯本机调试工具 |
| `DEPLOY.md` | 国内版手册，与国际版无关 |

### ⚠️ 不能删

| 文件 | 删掉的后果 |
|---|---|
| `.github/workflows/daily-deploy.yml` | **每日自动部署完全停止**，线上永久冻结 |
| `data/refreshed.json` | 云端抓取失败时无兜底，页面空白 |
| `pack.py` / `core.js` / `app.js` / `tpl*.html` | 无法构建、无法改界面 |
| `rss_sources.py` | 国内 RSS 全部消失（浏览器无法抓取） |
| `tools/parse_deploy.py` | 部署结果判断失败，任务误报为失败 |

### 特别注意：`tpl-cassette.html`

它被 `pack.py` 的 `STYLES` 表引用，**不能单独删除**：

```python
STYLES = {
    'swiss':   ('tpl.html',            'aihot-intel.html'),
    'cassette': ('tpl-cassette.html',  'aihot-intel-cassette.html'),
}
```

删掉后 `--style cassette` 会报错。

---

## 七、本机配置（非仓库内容）

### `~/.gitconfig`

```ini
[user]
    name = XueNor
    email = 78398293+XueNor@users.noreply.github.com
[credential]
    helper = manager
[core]
    autocrlf = true
    safecrlf = false
```

### `~/.ssh/config`

```
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_github
    IdentitiesOnly yes
    AddKeysToAgent yes
```

> 密钥用独立文件名 `id_ed25519_github`（非默认 `id_ed25519`），
> 便于将来配置第二个 GitHub 账号时两把钥匙并存。

---

## 八、快速操作速查

```bash
# 抓取 + 打包（本地立刻看最新数据）
python pack.py --fetch

# 验证渲染
node tools/verify.mjs

# 截图（明暗双主题）
node tools/shot.mjs aihot-intel.html 皮肤名

# 本机部署
export PAGES_SOURCE=skills
npx --yes edgeone@latest makers deploy ./dist -n aihot-intel-board -t '<Token>' -a global

# 更新 GitHub（push 后自动部署）
git add -A && git commit -m "描述" && git push
```

---

*清单生成时间：2026-10-04*
