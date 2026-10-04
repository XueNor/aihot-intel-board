# AI HOT 情报看板 · 部署完全手册

> 记录 2026-10-04 首次部署 GitHub + EdgeOne 全流程，含实测踩坑与解决方案。
> 重装系统、换机器、重新部署时照此执行即可。

---

## 一、最终架构

```
GitHub 仓库（12 文件 / 229KB）
    │
    │ 每天 09:00定时，或 push 触发
    ▼
GitHub Actions（ubuntu-latest）
    │ 1. 检出代码
    │ 2. 装 Python 3.12
    │ 3. python pack.py --fetch← 抓取 AI HOT + 5 个国内 RSS
    │ 4. 校验产物（体积 > 20KB 且快照≥ 50 条）
    │ 5. 复制为 dist/index.html
    │ 6. npx edgeone makers deploy -t <Token>
    ▼
EdgeOne Pages（国际版 / 全球可用区）
    ▼
https://aihot-intel-board.edgeone.dev
```

**月成本：¥0**（公共仓库 Actions 额度无限 + EdgeOne 免费计划永久有效）

---

## 二、关键标识与凭证

| 项 | 值 |
|---|---|
| GitHub 仓库 | `XueNor/aihot-intel-board`（**Public**） |
| Git 身份 | `XueNor` / `78398293+XueNor@users.noreply.github.com` |
| SSH 密钥 | `~/.ssh/id_ed25519_github`（独立文件名，便于多账号） |
| EdgeOne 项目名 | `aihot-intel-board` |
| EdgeOne 项目 ID | `makers-7xzljuh4zmss` |
| EdgeOne 区域 | `global`（全球可用区，不含中国大陆） |
| **仓库 Secret 名** | **`BOARD`** ← 见下方警告 |
| EdgeOne 控制台 | https://console.intl.cloud.tencent.com/edgeone/pages?tab=settings |

> ⚠️ **Secret 名必须是 `BOARD`**
>
> 创建时用的是 `BOARD`，而工作流最初写的是 `secrets.EDGEONE_API_TOKEN`，
> 名字对不上导致云端连续多次部署失败。GitHub 对**不存在的 Secret 会静默返回空字符串**，
> 不报错、不警告，只是拿不到值。
>
> 症状极具迷惑性：前 9 步（检出/抓取/校验/打包）全绿，只有部署步骤红，
> 而本机手动跑同一条命令 100% 成功。
>
> **新增或改名 Secret 后，务必先核对工作流里的引用是否逐字一致。**

### Token 安全须知

- Token 是**账号级权限**（拿到它就能以你的身份部署）
- 只存GitHub Secrets，**绝不写进代码、绝不提交仓库**
- 控制台创建时**只显示一次**，当场复制保存
- 设置过期时间（最长可选 1 年），到期后部署会失败，需换新
- 怀疑泄露时（如出现在聊天记录、截图里）立即在控制台删除重建

---

## 三、本机环境配置（已完成）

```bash
# 1. Git 身份
git config --global user.name "XueNor"
git config --global user.email "78398293+XueNor@users.noreply.github.com"

# 2. 换行符策略（Windows 必设，避免无谓的diff 噪音）
git config --global core.autocrlf true
git config --global core.safecrlf false

# 3. 凭据管理器（HTTPS 推送时记住密码）
git config --global credential.helper manager

# 4. SSH 密钥（独立文件名，不覆盖默认 id_ed25519）
ssh-keygen -t ed25519 -C "78398293+XueNor@users.noreply.github.com" \
  -f ~/.ssh/id_ed25519_github -N ""
```

`~/.ssh/config`：

```
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_github
    IdentitiesOnly yes
    AddKeysToAgent yes
```

**把公钥添加到GitHub**：https://github.com/settings/ssh/new
（粘贴 `~/.ssh/id_ed25519_github.pub` 内容）

**首次连接需导入服务器信任**（防中间人攻击，校验服务器指纹）：

```bash
ssh-keyscan -t ed25519,rsa github.com >> ~/.ssh/known_hosts

# 验证：应输出 "Hi XueNor! You've successfully authenticated"
ssh -T git@github.com
```

---

## 四、EdgeOne 控制台配置

1. 打开 https://console.intl.cloud.tencent.com/edgeone/pages
2. 点「直接上传」（另有「导入 Git 仓库」「从模板开始」「创建 Agent」三个选项，都不适用）
3. 填项目名 `aihot-intel-board`，加速区域选 **全球可用区（不含中国大陆）**
4. 上传 `dist/index.html`（见第五步生成）
5. 进入项目 → **API Token** 标签 → 创建 → 过期时间选 1 年 → **立刻复制**

> **API Token 在账号级位置**，不在项目内部设置里。
> 项目设置页只有构建部署/ 日志分析 / 指标分析 / 存储 / Agent，没有 Token。
> 直接访问 `.../pages?tab=settings` 可跳到正确标签。
>
> 另外：控制台已从 "Pages" 更名为 **"Makers"**（标签：项目 / Agents / Models / 存储 / 设置）。

---

## 五、本机部署（快速验证用）

```bash
cd "E:/Software Development/库存管理/实时记录"

# 抓取数据并打包
python pack.py --fetch

# 组装部署目录（必须是 index.html，否则访问根路径会404）
mkdir -p dist && cp aihot-intel.html dist/index.html

# 部署
export PAGES_SOURCE=skills
npx --yes edgeone@latest makers deploy ./dist \
  -n aihot-intel-board \
  -t'<你的Token>' \
  -a global
```

成功后会输出 `Deploy URL`。

---

## 六、GitHub仓库配置

### 建仓要点

1. https://github.com/new → 仓库名 `aihot-intel-board`，选 **Public**
2. ⚠️ **不要勾选** Add README / .gitignore / license
   （本地已有文件，云端再放一份会导致首次推送冲突）
3. 创建后添加 Secret：**Settings → Secrets and variables → Actions → New repository secret**
   - 名称：`BOARD`
   - 值：EdgeOne Token

### 日常更新

```bash
git add -A && git commit -m "描述" && git push
```

push 后 Actions 自动部署。工作流触发条件：`push` 到 main、每天 09:00定时、手动触发。

---

## 七、本次部署遇到的问题与解决方案

### 问题 1：仓库 Secret 名不匹配（耗时最久）

**现象**：Actions 连续 6 次失败，但本机手动跑同一条命令 100% 成功。
前 9 步骤全绿，只有「部署到 EdgeOne Pages」红。

**根因**：Secret 实际名为 `BOARD`，工作流引用 `secrets.EDGEONE_API_TOKEN`。
GitHub 对不存在的 Secret 静默返回空字符串，不报错。

**解决**：工作流统一改为 `secrets.BOARD`，并在部署步骤加前置检查：

```bash
if [ -z "${EDGEONE_API_TOKEN:-}" ]; then
  echo "::error title=缺少仓库 Secret::请确认 Secret 名为 BOARD（全大写、无空格）"
  exit 1
fi
```

**教训**：Secret 名必须与工作流引用逐字核对。名字不匹配是最难查的一类 bug——
因为它在本地完全无法复现。

---

### 问题 2：多行 Python 内联在 YAML 里导致语法错误

**现象**：工作流秒失败，API 查询返回 `total_count: 0`（jobs 数组为空）。

**根因**：把多行 Python 直接写在 YAML 块标量`run: |` 中，
缩进层级被 YAML 解析器误判：
`ScannerError: could not find expected ':'`

**解决**：把解析逻辑抽成独立文件 `tools/parse_deploy.py`，YAML 只调用 `python tools/parse_deploy.py`。

**验证方法**（改完必做）：

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/daily-deploy.yml',encoding='utf-8')); print('OK')"
```

**信号识别**：`total_count: 0` / jobs 数组为空 = YAML 语法错误，
不是超时也不是依赖问题。

---

### 问题 3：CLI 输出格式与官方文档不符

**现象**：解析部署结果步骤反复失败，尽管 CLI 确实部署成功了。

**根因**：官方文档说文本模式输出 `EDGEONE_DEPLOY_URL=https://xxx`，
但**实测输出是**：
```
[cli][✔] Deploy Success
[cli][✔] Deploy URL: https://aihot-intel-board.edgeone.dev
```

**解决**：`tools/parse_deploy.py` 实现三条解析路径依次尝试：
1. JSON 对象（兼容 `--json` 模式）
2. `Deploy URL: ` 前缀格式（实测的真实格式）
3. 裸 URL 兜底

解析前先剥离 ANSI 颜色码：
```python
ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
```

**教训**：不要相信文档里的输出格式假设，拿真实输出实测。

---

### 问题 4：管道吞掉退出码，真错误被掩盖

**现象**：加了 `set -o pipefail` 后部署步骤反而从"绿色"变成"红色"。

**根因**：`npx ... | tee log.txt` 中 `tee` 会吞掉左边的退出码。
之前看起来"成功"其实一直在失败。

**解决**：

```bash
set -o pipefail
npx --yes edgeone@latest makers deploy ./dist ... 2>&1 | tee deploy-output.log
CODE=${PIPESTATUS[0]}
echo "CLI 退出码: $CODE"
exit $CODE
```

**教训**：管道后的退出码要用 `PIPESTATUS` 取。看似 bug 的行为修正，往往是在暴露之前被掩盖的真问题。

---

### 问题 5：国内网络访问返回 401

**现象**：`curl https://aihot-intel-board.edgeone.dev` 返回 **401 UNAUTHORIZED**。

**这不是故障。** 官方文档明确说明：

> 加速区域为「全球可用区（不含中国大陆）」时，
> 非中国大陆网络环境可直接访问；**中国大陆网络环境会返回 401**。

这是内容合规策略。项目记忆里也记录过：本机代理会剥离
`access-control-allow-origin` 响应头，导致实时拉取失败。

**三种解法**：

| 方案 | 说明 | 成本 |
|---|---|---|
| **绑定自定义域名**（官方推荐） | 全球可用区**免 ICP 备案** | 需一个域名 |
| 换国内版| 含大陆节点，速度最快 | 需实名认证；两套账号 Token **不通用** |
| 控制台 Preview 链接 | 仅**3 小时**有效期 | 只适合临时验证 |

---

### 问题 6：无权限环境下读不到 Actions 日志

**现象**：排查时无法查看云端日志，报各种错误。

| 通道 | 结果 |
|---|---|
| `curl /logs` | 403 `Must have admin rights to Repository` |
| `upload-artifact` 后下载 | 公共仓库需登录态，匿名拿不到 |
| `gh issue create` | 容器内无权限，issue 未创建 |
| 推`diag-branch` 再读 raw | `git push` 在容器内失败（但步骤却报 success） |
| `check-runs` API | 需认证，匿名返回 404 |

**可用方案**（按优先级）：

1. **`echo "::error::消息"` 注解** ← 首选。显示在运行页底部 Annotations 区，
   **无需任何权限**即可读。
   ```bash
   echo "::error title=部署失败::退出码 $CODE"
   tail -5 deploy.log | while IFS= read -r l; do echo "::error::${l}"; done
   ```
2. **`$GITHUB_STEP_SUMMARY`** —— 写进运行页Summary 区，完整日志可直接读。
3. **让用户截图运行页** —— Annotations 和Summary 都在页面上。

---

### 问题 7：站点名不一致

**根因**：工作流 `SITE_NAME` 默认值是 `intel-board`，
而 EdgeOne 上实际项目名是 `aihot-intel-board`。
未配置 `EDGEONE_SITE_NAME` 时云端一直对着不存在的项目名部署。

**解决**：直接在 job env 中写死，移除 Secret 覆盖逻辑（减少配置来源）：

```yaml
env:
  SITE_NAME: aihot-intel-board
  EDGEONE_AREA: global
```

---

## 八、Git Bash (Windows) 踩坑备忘

### 8.1 `git show` 的 rev:path 被误当盘符

```bash
git show origin/main:.github/workflows/x.yml
# fatal: ambiguous argument 'origin\main;.github\workflows\x.yml'
```

Git Bash 会把形如 `:.` 的路径分隔符误当 Windows 盘符转换。

**解决**：改用 `grep` 直接读本地文件（先确认 `git diff HEAD origin/main` 无差异）：

```bash
grep -A7 "^on:" .github/workflows/x.yml
```

### 8.2 管道截断导致 `&&` 链误判

```bash
git commit -q -m "多行消息" && git push 2>&1 | tail -3
# →输出 "nothing to commit, working tree clean"，
#   实则提交成功，且 push 未执行
```

管道会截断上游退出码，导致 `&&` 判断错误。

**解决**：分开执行并显式打印退出码

```bash
git push origin main; echo "EXIT=$?"
```

### 8.3 判断有无输出用变量更可靠

```bash
R=$(cmd | head -N); if [ -z "$R" ]; then echo 空; else echo "$R"; fi
# 优于
cmd | head -N || echo 空
```

---

## 九、安全检查清单（公开仓库上传前必做）

```bash
# 1. 密钥类文件名
git ls-files | grep -Ei "\.env|token|secret|\.pem$|\.key$|id_rsa|id_ed25519"

# 2. 密钥赋值模式
git grep -nIE "(api[_-]?key|secret[_-]?key|access[_-]?token|password|Bearer +[A-Za-z0-9]{16,})"

# 3. 真实邮箱
git grep -nIE "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}" | grep -viE "example|noreply"

# 4. 真实 IP / 内网地址
git grep -nIE "\b([0-9]{1,3}\.){3}[0-9]{1,3}\b"

# 5. 本机绝对路径
git grep -nIE "[A-Z]:\\\\(Users|Program Files)|/c/Users/"

# 6. URL 内嵌凭据
git grep -nIE "https?://[^/\s:]+:[^/\s@]+@"

# 7. Git 历史残留（最关键——删过的文件仍在历史里）
git log --all -p | grep -cE "你的密钥片段"
# 必须为 0
```

**本次审查结果**：18 文件 + Git 全历史，Token 明文出现 **0 次**，
无邮箱、无本机路径、无密钥文件。6 处 `127.0.0.1:9222` 是本机
Chrome DevTools 调试端口（回环地址，外部无法访问），无害。

---

## 十、故障速查表

| 现象 | 原因 | 处理 |
|---|---|---|
| 工作流秒失败，`total_count: 0` | YAML 语法错误 | 用 pyyaml 验证；多行代码抽成独立 .py |
| 前几步全绿，只有部署红 | Secret 名不匹配 | 核对工作流引用与 Secret 名逐字一致 |
| 本机成功，云端失败 | 同上（最常见） | 同上 |
| 401 UNAUTHORIZED | 国际版合规策略 | 非故障；国内访问需绑域名或换国内版 |
| 404 NOT_FOUND | 域名错或部署中 | 确认项目名；423 表示正在部署，等一会儿 |
| 「未生成 aihot-intel.html」 | `pack.py` 执行失败 | 看日志 `[FAIL]` 行 |
| 「产物过小」/「快照不足」告警 | 抓取异常 | 校验步骤会阻断部署，线上保持旧版本 |
| 工作流没按时跑 | GitHub schedule 高峰期延迟 | 5–15 分钟属正常 |
| 页面空白无内容 | 实时拉取失败 + 快照为空 | 确认 `data/refreshed.json` 已提交 |

---

## 十一、当前状态（2026-10-04 已验证）

- ✅ Git / SSH / GitHub 仓库全部就绪
- ✅ 敏感信息扫描 10 项全过
- ✅ Actions 12 步骤全绿
- ✅ 本机部署成功，线上站点已上线
- ✅ 仓库精简至 12 文件 / 229KB
- ⏳ 每天 09:00 自动部署
- ⏳ 国内访问需绑自定义域名

---

*文档生成时间：2026-10-04*
