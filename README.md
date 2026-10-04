# QCNOTE - 个人笔记平台

隐私优先、离线优先的个人笔记应用：笔记默认只存在你的浏览器里，搜索、双链、知识图谱都在本地运行；登录、同步、个人主页等后端功能都是可选的。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520.9-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

## 功能

**笔记**

- Markdown 编辑与实时预览，支持 LaTeX 公式（行内 `$...$`、块级 `$$...$$`）
- 双链 `[[笔记标题]]`，自动生成反向链接
- 标签、分类、文字着色、回收站
- 版本历史，可对比差异并恢复；同步冲突可手动解决
- 列表、日历、时间线、知识图谱四种视图

**搜索**

- 全文搜索（Lunr.js），支持 `title:`、`tag:`、`category:`、`date:` 等字段过滤和 `AND / OR / NOT`
- 语义搜索：浏览器内运行多语言 embedding 模型，按含义匹配笔记。默认关闭，首次开启才下载模型，全程本地推理

**隐私与同步**

- 所有笔记存放在浏览器 IndexedDB；登录后可启用字段级 AES-GCM 加密；不同账号的数据按命名空间隔离
- WebDAV / OneDrive 跨设备同步，可选加密后再上传
- 数据可导出为 JSON 备份

**账号与社区（需要后端）**

- OAuth 登录（Google / GitHub / Discord）
- 个人主页与公开笔记：你主动发布的笔记会作为**明文快照**保存在服务器上，任何人都能看到。详见[个人主页与公开笔记](#个人主页与公开笔记)
- 迷宫小游戏排行榜、管理后台、Web Push 推送
- AI 模型接入：在 `/models` 配置任意 OpenAI 兼容接口，密钥加密保存在本地，请求由浏览器直接发往你配置的地址

**其他**：网页剪藏扩展（Chrome / Firefox）、情感分析与笔记统计、深色模式、响应式布局。

## 快速开始

需要 Node.js 20.9+（Next.js 16 的最低要求，CI 使用 22）和 npm。

```bash
git clone https://github.com/NENWA618/QCNOTE.git
cd QCNOTE
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。纯本地笔记功能无需任何配置。

### 启用后端功能

登录、个人主页、排行榜、推送都依赖独立的 Fastify 后端（`server/`）。

**1. 前端**：复制 [.env.example](.env.example) 为 `.env.local`，至少填写：

```bash
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<openssl rand -base64 32>
BACKEND_URL=http://localhost:10000
```

**2. 后端**：`server/` 不会读取 `.env.local`，变量需由 shell 或部署平台注入：

```bash
export NEXTAUTH_URL=http://localhost:3000
export NEXTAUTH_SECRET=<与前端相同>
export DATABASE_URL=postgresql://user:password@localhost:5432/qcnote
export REDIS_URL=redis://localhost:6379
export VAULT_MASTER_KEY=<openssl rand -base64 32>

cd server && npm install && npm run dev   # 默认监听 10000 端口
```

生产环境缺少 `DATABASE_URL`、`REDIS_URL` 或 `VAULT_MASTER_KEY` 时后端拒绝启动；开发环境会回退到内存 mock。OAuth 密钥、`DEVICE_SESSION_SECRET`、VAPID 等可选变量见 `.env.example`，Web Push 的配置见 [docs/VAPID_SETUP.md](docs/VAPID_SETUP.md)。

没有配置 OAuth 时，开发环境（`NODE_ENV=development`）可用内置的 `test` 账号登录，见 [docs/SECURITY_IMPROVEMENTS.md](docs/SECURITY_IMPROVEMENTS.md)。

## 使用提示

- 快捷键：`Ctrl+N` 新建笔记，`Ctrl+K` 聚焦搜索
- 视图切换在顶部工具栏；回收站、冲突、标签管理、云端同步、导入导出在"更多"菜单
- 同步：设置里连接 WebDAV 或登录微软账户使用 OneDrive

### 个人主页与公开笔记

登录用户有一个公开的个人主页 `/u/<userId>`（头像、用户名、简介、加入时间，不含邮箱），无需登录即可访问。在 `/profile` 可编辑资料并管理公开笔记。

- 在笔记编辑器里点发布，才会把这篇笔记的标题、正文、标签和文字颜色以**明文**上传；未发布的笔记不会上传
- 发布的是当时的一份副本，之后修改本地笔记不会自动同步，需要点"更新发布"；编辑器会提示"有未发布的更改"
- 可随时取消发布，服务器上的副本立即删除；删除本地笔记时若它已公开，会询问是否一并取消发布
- 限制：每人最多 100 篇，标题 ≤ 200 字符，正文 ≤ 100KB，标签 ≤ 20 个
- 页面带 `noindex`，不会被搜索引擎主动收录，但无法阻止他人复制已被访问的内容；管理员可下架违规内容

### 网页剪藏

在 Chrome 或 Firefox 中加载 `extensions/` 下对应的扩展，点击图标选择"剪藏整页 / 选中内容 / 文章"，QCNOTE 会弹出确认框，确认后才写入本地。剪藏数据放在 URL hash 中，不发往服务器。步骤见 [extensions/README.md](extensions/README.md)。

### Claude 技能：用自然语言记笔记

仓库自带一个 Claude 技能（[SKILL.md](.claude/skills/qcnote-new-note/SKILL.md)），可以让 Claude 在你自己的 Chrome 里操作 QCNOTE 仪表盘，新建或追加笔记并核对保存结果。需要：

1. 在 Chrome 安装并登录 [Claude in Chrome 扩展](https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn)
2. 用加载了该技能的 Claude 客户端打开本仓库，用自然语言描述要记的笔记

笔记只存在你 Chrome 的本地存储里，所以技能强制使用 Claude in Chrome（而不是内置浏览器）。它不会点"清空所有笔记"、"回收站"、"删除"等破坏性操作，也不会碰云端同步设置。

## 架构

核心功能全部在浏览器端运行，后端是可选扩展：

```
浏览器：  pages/ + components/   界面
          lib/                   搜索索引、同步、业务逻辑
          qcruntime/             IndexedDB + Worker + AES-GCM 字段加密
              │  （可选）pages/api/* 经 BACKEND_URL 代理
后端：    server/                Fastify + PostgreSQL + Redis
```

各层细节、数据流和后端接口见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 开发

```bash
npm run dev           # 开发服务器
npm run build         # 生产构建
npm run start         # 启动生产服务器
npm run lint          # ESLint
npm run format        # Prettier
npm test              # 单元测试（Vitest）
npm run test:e2e      # E2E 测试（Playwright）
npm run start-server  # 从仓库根目录启动 Fastify 后端
npm run check-admin   # 查询管理员账号状态
```

```
QCNOTE/
├── pages/          Next.js 页面与 API 路由（含 u/ 个人主页、api/ 代理）
├── components/     React 组件
├── lib/            业务逻辑（storage、indexer、publicNotes 等）
├── qcruntime/      浏览器运行时与加密存储
├── server/         Fastify 后端（独立 package.json）
├── extensions/     Chrome / Firefox 网页剪藏扩展
├── scripts/        数据库迁移、管理员引导等脚本
├── test/  e2e/     单元测试 / 端到端测试
├── docs/           文档
└── .claude/skills/ Claude 技能
```

提交前 husky 会运行 lint-staged，CI（`.github/workflows/ci.yml`）会依次执行 `npm audit`、lint、`tsc --noEmit`、单元测试、构建和 E2E。

## 部署

- **Vercel**：前端，连接 GitHub 仓库即可自动部署。
- **Docker Compose**：`docker-compose up -d` 启动 `app`（3000）、`server`（仅内网 10000）和 `redis`，**不含 PostgreSQL**，需自备数据库。启动前必须设置 `NEXTAUTH_URL`、`NEXTAUTH_SECRET`、`DATABASE_URL`、`VAULT_MASTER_KEY`、`REDIS_PASSWORD`，缺少时 compose 会报错；`DEVICE_SESSION_SECRET`、`VAPID_PUBLIC` / `VAPID_PRIVATE` 可选。
- **Render**：仅后端，见 `render.yaml`（`rootDirectory: server`）。
- **自托管**：`npm run build && npm run start` 启动前端，后端按上文单独运行。

## 文档

| 文档                                                           | 内容                               |
| -------------------------------------------------------------- | ---------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                   | 架构设计、数据流、后端接口         |
| [docs/SECURITY_IMPROVEMENTS.md](docs/SECURITY_IMPROVEMENTS.md) | HSTS、Cookie、CSRF、CSP 配置及原因 |
| [docs/VAPID_SETUP.md](docs/VAPID_SETUP.md)                     | Web Push 密钥生成与部署            |
| [extensions/README.md](extensions/README.md)                   | 网页剪藏扩展                       |
| [qcruntime/README.md](qcruntime/README.md)                     | 浏览器运行时 API                   |

## 贡献

欢迎贡献：Fork 仓库，创建特性分支，提交前运行 `npm test` 和 `npm run lint`，为新功能补测试并更新相关文档，然后发起 Pull Request。问题请提交到 [GitHub Issues](https://github.com/NENWA618/QCNOTE/issues)。

## 许可证

[MIT](LICENSE)

## 联系方式

- 邮箱：i24026878@student.newinti.edu.my
- GitHub：[@NENWA618](https://github.com/NENWA618)
