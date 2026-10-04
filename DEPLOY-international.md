# EdgeOne Pages 国际版部署手册

面向本项目的完整落地流程。国际版的特点：**邮箱注册即可，无需实名，无需绑卡**。

---

## 一、准备清单

### 必备（你手上要有的）

| 项目 | 说明 | 备注 |
|---|---|---|
| 邮箱 | 任意可收信的邮箱 | 推荐 Gmail / Outlook，国内邮箱偶有验证码收不到 |
| GitHub 账号 | 用于跑自动更新 | 会触发 Actions 时才需要 |
| 产物文件 | `aihot-intel.html`（约 165KB） | 由 `pack.py` 生成 |

### 不需要

- 信用卡（国际版不绑卡）
- 实名认证
- ICP 备案（国际版免备案）
- 服务器 / 云主机
- Node.js、npm（CLI 方式会自动装）

### 提前生成产物

在本机执行一次，确保有可部署的文件：

```bash
cd "E:\Software Development\库存管理\实时记录"
python pack.py --fetch
```

确认 `aihot-intel.html` 已生成（约 165KB）。

---

## 二、注册与开通

### 1. 注册账号

打开 <https://pages.edgeone.ai/> →右上角 **Sign Up**

- 填邮箱 + 密码，接收验证码完成注册
- 或直接用 Google 授权登录（更省事）
- **跳过 14 天试用提示页** —— 那个是腾讯云国际站云产品的试用，与 Pages 无关，直接忽略

### 2. 进入控制台

<https://console.intl.cloud.tencent.com/edgeone/pages>

首次进入会看到场景选择厅，悬停 **Create Project** 选 **Upload directly**（直接上传）。

> **重要**：选「直接上传」后该项目**无法再切换成 Git 集成**。我们用 CLI + Token 做自动部署，不依赖 Git 集成，所以选这个最合适。

### 3. 创建项目

填两项：

| 字段 | 填什么 |
|---|---|
| Project name | `intel-board`（或你喜欢的名字，仅限小写字母数字连字符） |
| Acceleration region | **Global** |

上传方式有两种：

- **拖拽上传**（首次验证用）：把 `aihot-intel.html` 改名成 `index.html`，拖进上传区
- **CLI 部署**（后续自动更新用）：见第四步

拖拽上传后点 **Start Deployment**，完成后会给出访问地址，形如：

```
https://intel-board-xxxx.edgeone.app
```

**打开这个地址验证一下** —— 能看到看板就说明托管成功。

---

## 三、创建 API Token

需要 Token 才能让 CI 自动部署。

### 获取

1. 在 Pages 控制台进入你的项目
2. 切到 **API Token** 标签页
3. 点 **Create API Token**
4. 填入描述（如 `daily-build`）
5. **选择过期时间** —— 建议 1 年
6. 提交后立即复制

> Token 只显示一次，务必当场保存。
> 官方也明确建议设置过期时间，这是标准安全实践。

### Token 的性质

它是一串加密字符串，相当于 CI 的身份凭证：

- 拿到它的人可以**以你的身份**往你的项目上传文件
- 它是**账号级权限**，不是单个项目的
- 所以：**只放 GitHub Secrets，绝不写进代码、绝不提交仓库**

---

## 四、配置自动更新（GitHub Actions）

### 1. 推送代码到 GitHub

```bash
cd "E:\Software Development\库存管理\实时记录"
git init
git add .
git commit -m "情报看板：初始提交"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

建议设为 **Public**（公共仓库 Actions 免费额度无限制；私有仓库每月 2000 分钟，这个任务也用不完，但没必要限制）。

> `.gitignore` 已配好，会自动排除 `data/raw_*.json`、`dist/`、`.shots/` 等中间产物。

### 2. 添加仓库密钥

在 GitHub 仓库页面：
**Settings → Secrets and variables → Actions → New repository secret**

| 名称 | 值 | 必填 |
|---|---|---|
| `EDGEONE_API_TOKEN` | 第四步复制的 Token | 是 |
| `EDGEONE_SITE_NAME` | `intel-board`（不填默认同名） | 否 |

### 3. 首次手动触发

Actions 页面选「每日情报看板更新」→ **Run workflow**。

约 1 分钟后看运行日志，成功时会打印部署 URL。

### 4. 之后全自动

工作流已配好定时触发：每天 **09:00 北京时间**。

---

## 五、后续更新方式

### 方式A：等定时任务（默认）

每天 9:00 自动抓取并部署，无需干预。

### 方式 B：手动触发一次部署

在 GitHub Actions 页面点 **Run workflow**。

### 方式 C：本机直接部署（不经过 GitHub）

CLI 包名是 `edgeone`（**没有 `@` 前缀**）：

```bash
npx --yes edgeone@latest login -a global     # 选 global 区域
npx --yes edgeone@latest makers deploy ./dist -n intel-board -a global
```

需要先把产物放进 `dist/`：

```bash
python pack.py --fetch
mkdir -p dist && cp aihot-intel.html dist/index.html
npx --yes edgeone@latest makers deploy ./dist -n intel-board -a global
```

适合临时想更新一次、不想等 CI。

> **注意**：旧版 `edgeone pages deploy` 已废弃，CLI 会提示
> `⚠ "edgeone pages" is deprecated. Use "edgeone makers" instead.`
> 区域参数用 `-a`（`global` / `overseas` / `china`），
> 加 `--json` 可拿到机器可读结果（末行是单个 JSON 对象）。

---

## 六、日常维护

### 更新 Token

Token 过期后部署会失败。处理方式：

1. 控制台新建 Token
2. 替换 GitHub 仓库里的 Secret
3. 手动触发一次验证

### 新增关键词 / 改版样式

改完代码后推上去，Actions 会自动部署：

```bash
python pack.py --fetch      # 本地先验证
git commit -am "改版：xxx"
git push
```

> 注意：当前工作流只配了 `schedule` 和 `workflow_dispatch`，
> **push 不会自动触发**。如需 push 即部署，在
> `.github/workflows/daily-deploy.yml` 的 `on:` 下补一行
> `- push: branches: [main]`。

---

## 七、限制与注意事项

| 项目 | 限制 | 对本项目的影响 |
|---|---|---|
| 单文件大小 | 25MB | 无忧（产物 165KB） |
| 文件数量 | 20000 个 | 无忧（只上传 1 个文件） |
| 免费额度 | 账号总 5GB | 无忧 |
| 加速区域（国际版） | 仅国际节点 | **国内访问较慢**，这是选国际版的代价 |
| 备份上限 | 5GB | 无忧 |

### 部署了什么

只上传 `aihot-intel.html`（改名 `index.html`）。**源码不部署**——
避免把抓取脚本暴露在公开站点上。

### 实时性

页面有两层数据保障：

1. **内嵌快照** —— 每天由 CI 抓取生成，打开即见约 160 条
2. **实时拉取** —— 打开后浏览器直连 AI HOT 补充最新数据。
   该接口返回 `access-control-allow-origin: *`，公网直连可正常跨域

任一层可用都能看到内容，不会白屏。

---

## 八、排查

| 现象 | 原因与处理 |
|---|---|
| 注册收不到验证码 | 换 Gmail / Outlook；或用 Google 授权登录 |
| 拖拽上传后打不开 | 确认文件已改名为 `index.html` |
| 部署报 token 失效 | Token 过期或填错，回控制台新建并替换 Secret |
| 工作流没按时跑 | GitHub schedule 在高峰期可能延迟 5–15 分钟，属正常现象 |
| `未生成 aihot-intel.html` | `pack.py` 执行失败，看日志中 `[FAIL]` 行 |
| `产物过小` 告警 | 抓取异常，校验步骤会阻断部署，线上保持旧版本 |
| 国内访问慢 | 国际版固有限制（仅国际节点）。唯一解：换国内版（需实名）或绑定已备案域名 |
| 访问地址带 `?` 参数 | EdgeOne 部署 URL 会带查询串，属正常，完整复制即可 |

---

## 九、如果要更快

### 首次验证用拖拽，不配置 CI

如果你只是想先看看效果：

1. 注册 → 创建项目（Global）→ 拖拽 `index.html` → Start
2. 拿到 URL 就能看
3. 满意后再回来配 CI

这样 5 分钟就能看到效果，Token 和 GitHub 都可以后面再弄。

### 用国内版换取更快访问

如果国内访问慢到影响使用：

- 注册腾讯云账号（可能需实名）
- 在 `console.cloud.tencent.com/edgeone/pages` 创建同名项目
- 创建 Token 时选 **China** 区域
- Token 换到 GitHub Secret 里即可

代价是实名认证，收益是国内节点加速。**国际版的 Token 不能用于国内版**，两者不互通。
