# QCNOTE

本地优先的个人笔记应用。笔记只存在你的浏览器里，搜索、双链、知识图谱都在本地运行；登录后笔记在本机加密保存。同步、个人主页、推送等后端功能都是可选的。可以作为 PWA 安装到桌面或手机主屏幕。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520.9-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

## 功能

**写笔记**

- Markdown 编辑与实时预览，LaTeX 公式（行内 `$...$`、块级 `$$...$$`）
- 双链 `[[笔记标题]]` 与自动反向链接
- 标签、分类、文字着色、收藏、归档、回收站
- 版本历史，可对比差异并恢复
- 列表、日历、时间线、知识图谱四种视图

**搜索**

- 全文搜索，支持 `title:`、`tag:`、`category:`、`date:` 过滤和 `AND / OR / NOT`
- 语义搜索（默认关闭）：在浏览器里运行多语言 embedding 模型按含义匹配，首次开启才下载模型

**数据与隐私**

- 访客模式：不用登录，笔记以明文存在浏览器 IndexedDB 中
- 登录后：笔记及其版本历史、标签、搜索缓存、同步凭据等全部在本机加密，密钥需要经过设备验证才能取得，详见[数据安全](#数据安全)
- WebDAV / OneDrive 同步：逐条三方合并，删除能双向传播，冲突可手动解决；可设置密钥加密同步文件
- 一键导出 / 导入 JSON 备份

**离线与安装**

- 可从浏览器"安装应用"，以独立窗口打开；访问过的页面离线可用
- Web Push 提醒（需要后端和 VAPID 密钥）

**账号与社区（需要后端）**

- Google / GitHub / Discord 登录
- 个人主页和公开笔记：你主动发布的笔记会以**明文副本**保存在服务器上，任何人可见
- AI 模型接入：在 `/models` 配置任意 OpenAI 兼容接口，请求由浏览器直接发往你配置的地址
- 迷宫小游戏排行榜、管理后台

**其他**：网页剪藏扩展（Chrome / Firefox）、情感分析与笔记统计、深色模式。

## 快速开始

需要 Node.js 20.9+（CI 使用 22）和 npm。

```bash
git clone https://github.com/NENWA618/QCNOTE.git
cd QCNOTE
npm install
npm run dev
```

打开 <http://localhost:3000>，不需要任何配置就能以访客身份记笔记。

> Service Worker 只在生产构建中注册。要试安装和离线，请运行 `npm run build && npm run start`。

### 启用后端

登录、加密存储、个人主页、排行榜、推送都依赖 `server/` 下的 Fastify 后端。

**前端**：复制 [.env.example](.env.example) 为 `.env.local`，至少填写：

```bash
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<openssl rand -base64 32>
BACKEND_URL=http://localhost:10000
```

**后端**：`server/` 不读取 `.env.local`，变量由 shell 或部署平台注入：

```bash
export NEXTAUTH_URL=http://localhost:3000
export NEXTAUTH_SECRET=<与前端相同>
export DATABASE_URL=postgresql://user:password@localhost:5432/qcnote
export REDIS_URL=redis://localhost:6379
export VAULT_MASTER_KEY=<openssl rand -base64 32>

cd server && npm install && npm run dev   # 默认端口 10000
```

后端启动时会自动建好大部分表；使用 Web Push 时还要手动执行一次 `scripts/001-create-push-subscriptions-table.sql`。

生产环境缺少 `DATABASE_URL`、`REDIS_URL` 或 `VAULT_MASTER_KEY` 时后端拒绝启动；开发环境会回退到内存 mock 和仅供开发的默认密钥。其余可选变量（OAuth、`DEVICE_SESSION_SECRET`、VAPID 等）见 [.env.example](.env.example)，推送配置见 [docs/VAPID_SETUP.md](docs/VAPID_SETUP.md)。

没有配置 OAuth 时，开发环境（`NODE_ENV=development`）可以用内置的 `test` 账号登录。

## 使用说明

- 编辑器快捷键：`Ctrl/Cmd+S` 保存，`Ctrl/Cmd+Shift+P` 切换编辑 / 预览
- 顶部工具栏切换视图；回收站、冲突、标签管理、云端同步、导入导出在"更多"菜单

### 数据安全

| 你是                 | 笔记存在哪里           | 是否加密                                       |
| -------------------- | ---------------------- | ---------------------------------------------- |
| 访客                 | 本浏览器 IndexedDB     | 否                                             |
| 登录用户             | 本浏览器 IndexedDB     | 是。标题、正文、标签、分类、版本历史等都是密文 |
| 发布到个人主页的笔记 | 服务器                 | 否，公开可见                                   |
| 同步文件             | 你的 WebDAV / OneDrive | 填了同步加密密钥才加密，否则是明文 JSON        |

登录用户的加密方式：浏览器本地生成一把数据密钥加密笔记，这把密钥再由服务器为你保管的账号密钥包裹。单独拿到服务器数据库或单独拿到浏览器数据都解不开笔记。但服务器能取得你的账号密钥，所以这**不是端到端加密**。

需要知道的几点：

- **设备验证**：登录后当前浏览器要先通过设备验证才能解锁笔记。每个账号同一时间只登记一台设备；换设备或浏览器升级导致验证失败时，可在仪表盘"重置设备"，旧设备随之失效。
- **离线**：登录用户离线时拿不到密钥，笔记库会显示"未解锁"；访客模式离线可完整使用。
- **笔记不会自动跨设备**：每台设备有自己的本地库，跨设备请用 WebDAV / OneDrive 同步。
- **无法解密的笔记**会被暂时隐藏，不会被修改、删除或同步，原始数据保留在本机。

技术细节见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#4-运行时与密钥)。

### 同步

在"更多 → 云端同步"中配置：

- **WebDAV**：填写地址、账号、远端文件路径和可选的加密密钥。"立即同步"双向合并；"从 WebDAV 下载"只合并到本机；"覆盖上传"会用本机笔记覆盖远端（需确认）。可开启定时自动同步，并选择冲突策略（手动 / 本地优先 / 远端优先）。
- **OneDrive**：目前需要手动粘贴 Microsoft Graph 访问令牌和文件路径；两边都改过的笔记保留较新的一份，另一份存进版本历史。

同步只合并"上次同步以来哪一边改了什么"，不依赖设备时钟。远端文件解不开（例如加密密钥不一致）时会中止，不会覆盖远端。

### 安装为应用

在 Chrome、Edge、Safari 等浏览器打开生产站点，点地址栏的安装图标或菜单里的"安装 / 添加到主屏幕"。离线时访问过的页面从缓存打开，其余显示离线提示页；`/api/`、登录、管理后台和他人的公开页不缓存。

### 个人主页与公开笔记

登录用户有一个公开主页 `/u/<userId>`（头像、用户名、简介、加入时间，不含邮箱），在 `/profile` 编辑。

- 在编辑器里点"发布"才会把这篇笔记的标题、正文、标签和文字着色以**明文**上传；未发布的笔记不会上传
- 发布的是当时的副本，之后修改需要点"更新发布"，编辑器会提示"有未发布的更改"
- 可随时取消发布，服务器副本立即删除；删除已公开的本地笔记时会询问是否一并取消发布
- 每人最多 100 篇，标题 ≤ 200 字符，正文 ≤ 100KB，标签 ≤ 20 个
- 页面带 `noindex`，但无法阻止他人复制已看到的内容；管理员可下架违规内容

### 网页剪藏

在 Chrome 或 Firefox 加载 `extensions/` 下的扩展，点图标选择"剪藏整页 / 选中内容 / 文章"。QCNOTE 会弹出确认框，确认后才保存。剪藏数据放在 URL hash 里，不发往服务器。见 [extensions/README.md](extensions/README.md)。

### Claude 技能

仓库自带一个 Claude 技能（[SKILL.md](.claude/skills/qcnote-new-note/SKILL.md)），让 Claude 在你自己的 Chrome 里操作 QCNOTE 仪表盘新建或追加笔记，并核对保存结果。需要安装并登录 [Claude in Chrome 扩展](https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn)。笔记在你 Chrome 的本地存储里，所以必须用 Claude in Chrome 而不是内置浏览器。技能不会执行清空、删除、回收站等破坏性操作，也不碰同步设置。

## 开发

```bash
npm run dev           # 开发服务器
npm run build         # 生产构建
npm run start         # 启动生产服务器
npm run lint          # ESLint
npm run format        # Prettier
npm test              # 单元测试（Vitest）
npm run test:e2e      # E2E 测试（Playwright）
npm run start-server  # 从仓库根目录启动后端
npm run check-admin   # 查询管理员账号状态
```

```
QCNOTE/
├── pages/          页面与 API 代理路由
├── components/     React 组件
├── lib/            业务逻辑：storage（存储、同步、加密）、indexer、hooks 等
├── qcruntime/      浏览器存储运行时（IndexedDB + Worker + AES-GCM）
├── server/         Fastify 后端（独立 package.json）
├── extensions/     网页剪藏扩展
├── public/         静态资源、manifest、Service Worker
├── scripts/        数据库迁移、管理员引导
├── test/  e2e/     单元测试 / 端到端测试
└── docs/           文档
```

提交前 husky 会运行 lint-staged。CI（`.github/workflows/ci.yml`）依次执行 `npm audit`、lint、`tsc --noEmit`、单元测试、构建，另有独立的 E2E 任务。

修改存储相关代码时请注意：

- 笔记的读写只走 `NoteStorage`；会写回的路径用 `loadNotesAsync()`，不要用 `getDataAsync()`
- 新增携带用户内容的笔记字段，要在 `noteStoreSchema` 里标为 `secret`；`test/encryption-at-rest.test.ts` 会检查存储中是否出现明文

## 部署

- **Vercel**：前端，连接 GitHub 仓库自动部署
- **Render**：后端，见 `render.yaml`（`rootDirectory: server`）
- **Docker Compose**：`docker-compose up -d` 启动 `app`（3000）、`server`（仅内网 10000）和 `redis`，**不含 PostgreSQL**。必须设置 `NEXTAUTH_URL`、`NEXTAUTH_SECRET`、`DATABASE_URL`、`VAULT_MASTER_KEY`、`REDIS_PASSWORD`；`DEVICE_SESSION_SECRET`、`VAPID_PUBLIC` / `VAPID_PRIVATE` 可选
- **自托管**：`npm run build && npm run start` 启动前端，后端单独运行

站点需要 HTTPS（`localhost` 除外）。**`VAULT_MASTER_KEY` 丢失或更换后，所有登录用户都无法解锁已有笔记**，请妥善备份。上线前请过一遍 [安全检查清单](docs/SECURITY_IMPROVEMENTS.md#8-检查清单)。

## 文档

| 文档                                                           | 内容                                  |
| -------------------------------------------------------------- | ------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                   | 架构、存储与加密、同步、后端接口、PWA |
| [docs/SECURITY_IMPROVEMENTS.md](docs/SECURITY_IMPROVEMENTS.md) | HSTS、Cookie、CSRF、CSP 等配置及原因  |
| [docs/VAPID_SETUP.md](docs/VAPID_SETUP.md)                     | Web Push 密钥生成与部署               |
| [qcruntime/README.md](qcruntime/README.md)                     | 浏览器存储运行时 API                  |
| [extensions/README.md](extensions/README.md)                   | 网页剪藏扩展                          |

## 贡献

Fork 仓库，创建特性分支，提交前运行 `npm test` 和 `npm run lint`，为新功能补测试并更新相关文档，然后发起 Pull Request。问题请提交到 [GitHub Issues](https://github.com/NENWA618/QCNOTE/issues)。

## 许可证

[MIT](LICENSE)

## 联系方式

- 邮箱：yours@girl.cat
- GitHub：[@NENWA618](https://github.com/NENWA618)
