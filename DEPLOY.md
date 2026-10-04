# 云端部署说明

把看板部署到公网，脱离本机运行。月成本 **¥0**。

## 方案构成

| 环节 | 承担者 | 费用 |
|---|---|---|
| 定时抓取 + 生成 HTML | GitHub Actions（每天 9:00 CST） | 免费（公共仓库额度无限） |
| 静态托管 + CDN + SSL | EdgeOne Pages（腾讯云） | 免费计划永久有效 |
| 数据来源 | AI HOT API + 5 个国内 RSS 源 | 免费 |

## 前置条件

1. **一个 GitHub 仓库**（建议设为 Public，Actions 免费额度无限制）
2. **一个 EdgeOne 账号**：到 [EdgeOne 控制台](https://console.edgeone.ai) 注册，
   新建 Pages 项目，生成 API Token

## 部署步骤

### 1. 推送代码

```bash
cd "E:\Software Development\库存管理\实时记录"
git init
git add .
git commit -m "情报看板首次提交"
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

### 2. 配置仓库密钥

在 GitHub 仓库页面：**Settings → Secrets and variables → Actions → New repository secret**

| 名称 | 值 | 必填 |
|---|---|---|
| `EDGEONE_API_TOKEN` | EdgeOne 控制台「设置 → API Token」创建的令牌 | 是 |
| `EDGEONE_SITE_NAME` | 项目名，不填则用 `intel-board` | 否 |

### 3. 首次手动触发

Actions 页面选「每日情报看板更新」→ **Run workflow**。约 1 分钟后部署完成，
EdgeOne 会给出访问地址（形如 `https://<项目名>.edgeone.app`）。

之后每天 9:00 自动执行。

## 自定义域名（可选）

未备案域名走海外节点，国内延迟约 670–1400ms。若要启用国内节点加速
（50–90ms），需先把域名完成 ICP 备案，再在 EdgeOne 控制台绑定。

## 部署了什么

只上传 `aihot-intel.html`（改名为 `index.html`），源码不部署——
避免把抓取脚本暴露在公开站点上。

## 实时性说明

页面有两层数据保障：

1. **内嵌快照** —— 每天由 Actions 抓取生成，打开即见约 160 条内容
2. **实时拉取** —— 打开后浏览器直连 AI HOT 补充最新数据。
   该接口返回 `access-control-allow-origin: *`，公网直连可正常跨域。

任一层可用都能看到内容，不会白屏。

## 排查

| 现象 | 排查方向 |
|---|---|
| 工作流没有按时跑 | GitHub schedule 在高峰期可能延迟 5–15 分钟，属正常现象 |
| `未生成 aihot-intel.html` | `pack.py` 执行失败，看日志中 `[FAIL]` 行 |
| `产物过小` 告警 | 抓取异常，校验步骤会阻断部署，线上保持旧版本 |
| EdgeOne 部署失败 | 检查 `EDGEONE_API_TOKEN` 是否有效、项目名是否冲突 |
| 国内访问慢 | 未备案只能走海外节点，见上方「自定义域名」 |

## 手动更新

```bash
python pack.py --fetch
node tools/verify.mjs      # 可选，本地验证渲染
```

然后 `git commit` + `git push` 触发 `push` 事件部署，
或在 Actions 页面手动触发。

> 注：工作流目前仅配置了 `schedule` 与 `workflow_dispatch` 触发条件。
> 如需 push 即自动部署，在 `on:` 下补一行 `- push: branches: [main]`。
