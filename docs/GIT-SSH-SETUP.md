# 本机环境配置清单（Git / SSH）

> 记录 2026-10-04 从零配置 GitHub 连接能力的全过程。
> **这些文件不在项目 ZIP 里**，机器重装、换电脑、或 `~/.ssh/` 丢失后照此重建。
>
> ⚠️ 本文档不包含私钥内容，仅记录配置方式、指纹与公钥（公钥可公开）。

---

## 一、当前环境速览

| 项 | 值 |
|---|---|
| Git 版本 | 2.55.0.windows.3 |
| Node.js | v22.22.2（EdgeOne CLI 要求 >=12） |
| npm | 10.9.7 |
| Git 身份 | `XueNor` |
| 身份邮箱 | `78398293+XueNor@users.noreply.github.com`（GitHub 隐私邮箱） |
| SSH 密钥类型 | ed25519（ED25519, 256 bit） |
| 密钥指纹 | `SHA256:j4lsCLwR7X77FGEpx6FKJfoVjT3R+kCAeC48mJFSCCk` |
| 连通状态 | `ssh -T git@github.com` → `Hi XueNor!` |

---

## 二、涉及的三个文件位置

| 文件 | 是否敏感 | 说明 |
|---|---|---|
| `~/.gitconfig` | 否（只有身份和偏好） | Git 全局配置 |
| `~/.ssh/config` | 否 | 指定用哪把密钥连 GitHub |
| `~/.ssh/id_ed25519_github` | **⚠️ 是，私钥** | **绝不可提交、不可外传** |
| `~/.ssh/id_ed25519_github.pub` | 否（公钥可公开） | 贴在 GitHub 上的那把 |
| `~/.ssh/known_hosts` | 否 | 服务器信任列表，防中间人攻击 |

---

## 三、完整重建步骤

### 第 1 步：Git 身份

```bash
git config --global user.name "XueNor"
git config --global user.email "78398293+XueNor@users.noreply.github.com"
```

**不配这一步，第一次 commit 会直接报错。**

GitHub 隐私邮箱格式：`{用户数字ID}+{用户名}@users.noreply.github.com`，
可在 https://github.com/settings/emails 查到。好处是完全隐藏真实邮箱。

### 第 2 步：换行符与凭据策略

```bash
# Windows 必设：避免无意义的 diff 噪音
git config --global core.autocrlf true
git config --global core.safecrlf false

# 凭据管理器：HTTPS 推送时记住密码
git config --global credential.helper manager
```

> `core.autocrlf true` 会把 CRLF 自动转成 LF 再提交。
> `core.safecrlf false` 关闭"换行符冲突"报错，避免某些操作卡住。

### 第 3 步：生成 SSH 密钥

```bash
ssh-keygen -t ed25519 \
  -C "78398293+XueNor@users.noreply.github.com" \
  -f ~/.ssh/id_ed25519_github \
  -N ""
```

**为什么用独立文件名 `id_ed25519_github` 而非默认 `id_ed25519`：**
将来若配置第二个 GitHub 账号（公司/个人），两把密钥可并存互不干扰，
只需在 `~/.ssh/config` 里按 Host 分别指定。

`-N ""` 表示不设 passphrase。个人单机场景为了免去每次输入，
代价是私钥泄露即失守；若在意安全可改为 `-N "你的密码"`（配合 ssh-agent 缓存）。

### 第 4 步：指定连接用哪把密钥

`~/.ssh/config`：

```
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_github
    IdentitiesOnly yes
    AddKeysToAgent yes
```

| 配置项 | 作用 |
|---|---|
| `IdentityFile` | 指定私钥路径 |
| `IdentitiesOnly yes` | **只**用这把，不去尝试 agent 里的其他密钥 |
| `AddKeysToAgent yes` | 用过后加入 ssh-agent，短期内免重复读取 |

> `IdentitiesOnly yes` 很关键。不加的话，SSH 会遍历 agent 里所有密钥，
> 逐个向 GitHub 询问"这把是不是你的"——既慢又在有多个账号时可能出错。

### 第 5 步：导入服务器信任

```bash
ssh-keyscan -t ed25519,rsa github.com >> ~/.ssh/known_hosts
```

**这一步不做会报 `Host key verification failed`。**

它不是可选项——SSH 首次连接陌生主机时会校验服务器指纹，
拒绝就意味着无法确认"对面真是 GitHub"还是"中间人伪装的"。
`ssh-keyscan` 拿到的是 GitHub 官方公布的公钥指纹。

可校验导入的指纹是否正确：

```
github.com (RSA):     SHA256:uNiVztksCsDhcc0u9e8BujQXVUpKZIDTMczCvj3tD2s
github.com (ED25519): SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU
```

### 第 6 步：公钥添加到 GitHub

打开 https://github.com/settings/ssh/new

| 字段 | 填什么 |
|---|---|
| Title | 随便起，如「我的电脑」 |
| Key | 粘贴 `~/.ssh/id_ed25519_github.pub` 的完整内容 |

本次使用的公钥：

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIInjCAmTp+xNy2Az95GU7O1FEdklnsBE1ILGOjcy9ufW78398293+XueNor@users.noreply.github.com
```

⚠️ 粘贴时注意结尾的 `+用户名` 部分不能截断。

### 第 7 步：验证

```bash
ssh -T git@github.com
```

**成功输出：**

```
Hi XueNor! You've successfully authenticated, but GitHub does not provide shell access.
```

| 输出 | 含义 |
|---|---|
| `Hi XueNor!` | ✅ 认证通过，`XueNor` 是你的 GitHub 账号 |
| `The file you've added is invalid` | 公钥粘贴时损坏或截断 |
| `Permission denied (publickey)` | 私钥与 GitHub 上的公钥不匹配 |
| `Host key verification failed` | 漏了第 5 步，`known_hosts` 缺记录 |

验证成功后 GitHub 页面上的 "Never used" 会变成
**"Authenticated by this key"**。

---

## 四、仓库连接配置

```bash
# 使用 SSH 地址（免密）。不要用 HTTPS
git remote add origin git@github.com:XueNor/aihot-intel-board.git
git push -u origin main
```

用 SSH 而非 HTTPS 的好处：连接和认证一次完成，
不需要每次输入密码或 token。

查看配置：

```bash
git remote -v
# origin  git@github.com:XueNor/aihot-intel-board.git (fetch)
# origin  git@github.com:XueNor/aihot-intel-board.git (push)
```

---

## 五、EdgeOne API Token（另一类凭证）

⚠️ **注意区分**：这个不是 SSH 密钥，是部署用的账号级令牌。

| 项 | 值 |
|---|---|
| 存放位置 | GitHub 仓库 Secret，名称为 `BOARD` |
| 权限范围 | **账号级**（拿到就能以你的身份部署） |
| 有效期 | 最长 1 年，建议设置 |
| 获取位置 | https://console.intl.cloud.tencent.com/edgeone/pages?tab=settings |

**只在 GitHub Secrets 里保存，绝不写进代码或提交仓库。**

Token 只在创建时显示一次，当场复制保存。

---

## 六、隐私与安全检查

### 本机环境自检

```bash
# 确认私钥权限（应仅本人可读）
ls -l ~/.ssh/id_ed25519_github
# -rw------- 1... ← 两横线才对

# 确认私钥是 ed25519 且未被加密（-N "" 的结果）
head -1 ~/.ssh/id_ed25519_github

# 确认指纹与文档一致
ssh-keygen -lf ~/.ssh/id_ed25519_github
# 应输出 SHA256:j4lsCLwR7X77FGEpx6FKJfoVjT3R+kCAeC48mJFSCCk
```

### 本次审查结论

- ✅ 私钥从未进入项目目录、从未提交 Git、从未写进任何文档
- ✅ 两份项目文档中 Token 与私钥均零明文，一律用 `BOARD` 指代
- ✅ `.workbuddy/`（工作记忆）已在 `.gitignore` 中排除
- ✅ 全部提交历史扫描确认无密钥明文

### 私钥泄露了怎么办

1. **立即**在 https://github.com/settings/ssh/keys 删除对应公钥
2. 删除本地 `~/.ssh/id_ed25519_github`
3. 重新执行第 3~7 步生成新钥并添加
4. 检查仓库历史是否有泄露（`git log --all -p | grep -c "私钥片段"`）

---

## 七、快速排查

| 现象 | 原因 | 处理 |
|---|---|---|
| `Host key verification failed` | 缺 known_hosts | 执行第 5 步 |
| `Permission denied (publickey)` | 密钥不匹配 | 确认 GitHub 上的公钥与本地私钥同源 |
| `git push` 要密码 | 用成了 HTTPS remote | 改用 SSH 地址 |
| 换了 SSH 端口后失效 | 443 端口 | 见下方补充 |
| `safecrlf` 相关报错 | 换行符策略冲突 | `core.safecrlf false` |

### 补充：网络受限时的 SSH 443 端口

国内网络有时会阻断 22 端口。可改走 443：

```
Host github.com
    HostName ssh.github.com
    Port 443
    User git
    IdentityFile ~/.ssh/id_ed25519_github
    IdentitiesOnly yes
```

**注意 `HostName` 要改成 `ssh.github.com`**（GitHub 为此专门提供的入口）。
验证：https://github.com/settings/ssh/keycheck

---

## 八、备份建议

需要备份的只有两样：

| 文件 | 处理方式 |
|---|---|
| `~/.gitconfig` | 可复制保存，无敏感信息 |
| `~/.ssh/id_ed25519_github`（私钥） | **不建议放在云盘或GitHub**。用密码管理器加密保存，或离线存 U 盘 |

**备份私钥的方式**：找一个可信的密码管理器（如 1Password、Bitwarden），
把私钥内容粘进一个加密笔记里。换机器时贴出来并 `chmod 600` 即可。

---

*配置时间：2026-10-04 · 校验通过：`ssh -T git@github.com` → `Hi XueNor!`*
