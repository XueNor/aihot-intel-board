# AI HOT 科技情报看板

一个每天自动更新的 AI 情报聚合看板：抓取 AI HOT 网站与 5 个国内 RSS 源，
去重合并后渲染成单文件 HTML，部署到 EdgeOne CDN。

**月成本 ¥0** —— GitHub Actions + EdgeOne Pages 免费额度。

---

## 快速开始

```bash
# 1. 抓取数据并打包（约 90 秒）
python pack.py --fetch

# 2. 组装部署目录（必须叫 index.html，否则访问根路径会404）
mkdir -p dist && cp aihot-intel.html dist/index.html

# 3. 部署到 EdgeOne
npx --yes edgeone@latest makers deploy ./dist \
  -n aihot-intel-board \
  -t '<你的Token>' \
  -a global
```

生成的 `aihot-intel.html` 是**单文件**（内嵌全部数据与样式），
双击即可在浏览器打开，无需服务器。

---

## 文件说明

### 核心源代码

| 文件 | 作用 |
|---|---|
| `pack.py` | 抓取 + 打包主脚本。**全用 Python 标准库，零第三方依赖** |
| `rss_sources.py` | 5 个国内 RSS 源配置（量子位 / 雷峰网 / InfoQ / OSCHINA / IT之家） |
| `core.js` | 数据逻辑：去重合并、事件聚合、评分排序、时间窗计算 |
| `app.js` | 渲染与交互：时间线、主题卡、关键事件、回到最新按钮 |
| `tpl.html` | 瑞士风皮肤模板（DOM 骨架） |
| `tpl-cassette.html` | 卡带未来主义皮肤模板 |
| `data/refreshed.json` | 唯一快照文件，云端抓取失败时的兜底数据源 |

### 部署

| 文件 | 作用 |
|---|---|
| `.github/workflows/daily-deploy.yml` | 自动部署工作流。**删掉则每日更新完全停止** |
| `tools/parse_deploy.py` | 解析 EdgeOne CLI 输出判断部署成败 |
| `.gitignore` | 排除构建产物、本地工具、个人笔记 |

### 构建产物（由 pack.py 生成，不必长期保留）

| 文件 | 说明 |
|---|---|
| `aihot-intel.html` | 瑞士风成品，约 165 KB |
| `aihot-intel-cassette.html` | 卡带皮肤成品，约 172 KB |

### 文档

| 文件 | 内容 |
|---|---|
| `DEPLOY-GUIDE.md` | **完整部署流程 + 7 个实测踩坑与解决方案** |
| `PROJECT-FILES.md` | 每个文件的用途、必需性、删除影响对照 |
| `DEPLOY-international.md` | EdgeOne 国际版部署参考 |

---

## 自动化部署

已配置 GitHub Actions，触发条件：

| 触发 | 说明 |
|---|---|
| `push` 到 main | 改完代码自动部署 |
| 每天 09:00（北京时间） | 定时抓取并重新部署 |
| 手动触发 | Actions 页面点 Run workflow |

### ⚠️ 仓库 Secret 名必须是 `BOARD`

GitHub 仓库 → **Settings → Secrets and variables → Actions → New repository secret**

| 名称 | 值 |
|---|---|
| `BOARD` | EdgeOne 控制台「API Token」页创建的令牌 |

**踩坑警告**：Secret 名写错（比如写成 `EDGEONE_API_TOKEN`）时，
GitHub 会**静默返回空字符串**，不报错、不警告——但云端部署会一直失败。
症状很有迷惑性：前 9 步全绿，只有部署步骤红，而本机手动跑完全正常。

新增或改名 Secret 后，务必核对工作流里的引用是否逐字一致。

---

## EdgeOne 配置要点

- **区域选 `global`**（全球可用区，不含中国大陆）→ 该区域**免 ICP 备案**
- 创建方式选「直接上传」
- **API Token 在账号级位置**，不在项目内部设置里
  （直接访问 `.../pages?tab=settings` 可跳到正确标签）

### 国内访问返回 401？

**不是故障。** 官方策略：「全球可用区（不含中国大陆）」时，
大陆网络访问会返回 401，仅海外网络可直连。

解法：
1. 绑定自定义域名（该区域免备案，推荐）
2. 换国内版（需实名；两套账号的 Token **互不通用**）

---

## 快照机制

页面有两层数据保障：

1. **内嵌快照** —— 构建期抓取写入页面，打开即见约 155 条
2. **实时拉取** —— 打开后浏览器直连 AI HOT 补充最新数据

任一层可用都能正常显示，不会白屏。

内嵌快照占用约 80 KB（gzip 后 44 KB）。**不建议删除**：
不仅省不了多少流量（整页 gzip 后仅约 41 KB），还会导致实时拉取失败时白屏，
且 44 条国内 RSS 无 CORS 支持，只能靠构建期抓取写进快照。

---

## 安全提醒

- **Token 权限是账号级**，拿到即可以你的身份部署。只存 GitHub Secrets，
  绝不写进代码或提交仓库
- Token 只在创建时显示一次，当场保存
- 设置过期时间（最长 1 年），到期后需更换
- 国内 RSS 无 CORS，无法在浏览器抓取，只能构建期抓取

---

## 环境要求

| 工具 | 版本 | 必需 |
|---|---|---|
| Python | 3.8+ | ✅ 仅标准库，无需 pip 安装 |
| curl | 任意 | ✅ 抓取用 |
| Node.js | >= 12 | ⭕ 仅本机部署需要（EdgeOne CLI 要求） |

---

## 排查

| 现象 | 原因与处理 |
|---|---|
| `未生成 aihot-intel.html` | `pack.py` 执行失败，看输出中的 `[FAIL]` 行 |
| 产物过小 / 快照不足 | 抓取异常，部署会被阻断，线上保持旧版本 |
| 部署报 Token 失效 | Token 过期或填错，回控制台新建 |
| 只有部署步骤失败 | 大概率是 Secret 名不匹配（见上文警告） |
| 工作流秒失败且无 job 记录 | YAML 语法错误——多行代码不要内联在 `run: |` 里 |
| 国内访问 401 | 国际版合规策略，非故障，见上文 |

更详细的排查步骤见 `DEPLOY-GUIDE.md`。

---

*打包时间：2026-10-04*
