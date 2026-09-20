# QCNOTE - 个人笔记平台

一个现代化、隐私优先的个人笔记应用，采用离线优先架构，具有强大的搜索功能、知识管理和社区功能。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-16.3.4-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2.0-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3.1-61dafb?logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3.4.1-38b2ac?logo=tailwindcss)](https://tailwindcss.com/)

## ✨ 核心功能

### 笔记管理

- **📝 Markdown 编辑器**: 支持富文本编辑，实时预览
- **🧮 LaTeX 数学公式**: 支持行内公式 `$...$` 和块级公式 `$$...$$`
- **🔗 双链支持**: 使用 `[[笔记标题]]` 创建双向链接，自动生成反向链接
- **📋 块状编辑**: 将笔记组织为灵活的块结构
- **🏷️ 标签和分类**: 灵活的标签管理和多维度分类
- **📌 版本历史**: 完整的版本控制和冲突解决机制

### 搜索与发现

- **🔍 全文搜索**: 基于 Lunr.js 的秒级全文搜索
- **🤖 语义搜索**: 在浏览器内运行多语言 embedding 模型（`paraphrase-multilingual-MiniLM-L12-v2`），按含义匹配笔记；默认关闭，首次开启时才下载模型，全程本地推理
- **📊 知识图谱**: 可视化呈现笔记之间的联系
  - 🔵 蓝线 = 被引用的反向链接
  - 🟣 紫线 = 主动引用他人笔记
- **📅 多维视图**: 日历视图、时间线视图、列表视图

### 隐私与同步

- **📝 离线优先**: 完全支持离线工作，所有数据存储在本地
- **🔒 隐私保护**: 个人数据默认不上传，完全掌控权
- **🔐 客户端加密存储**: 登录后可启用本地 AES-GCM 加密，对敏感字段进行字段级保护
- **👤 账号隔离**: 不同登录账号的数据按命名空间隔离存储，避免账号间数据混淆
- **☁️ 云端同步**: 支持 WebDAV 和 OneDrive 跨设备同步，可选本地加密后再同步
- **🔄 冲突解决**: 自动检测并帮助解决同步冲突
- **📦 导入导出**: 支持多种格式的数据导入导出

### 社区功能

- **🙋 个人主页**: 编辑头像、简介，公开/私密可选
- **🏆 排行榜**: 迷宫挑战排行
- **👤 用户系统**: OAuth 认证、用户资料
- **🤖 AI 模型接入**: 配置外部 AI 服务的接口地址与密钥，密钥仅加密存储在本地

### 智能分析

- **💭 情感分析**: 自动分析笔记内容的情感倾向
- **📈 统计信息**: 笔记数量、更新频率、内容长度等统计
- **🎯 关键词提取**: 自动提取和追踪主要话题

### 用户体验

- **🎨 深色模式**: 全站深色模式支持
- **📱 响应式设计**: 完美适配桌面、平板、手机
- **♿ 无障碍支持**: WCAG 标准的无障碍设计
- **⚡ 快速加载**: 优化的性能和流畅的交互

## 🚀 快速开始

### 系统要求

- Node.js 20.9+（Next.js 16 的最低要求；CI 使用 Node 22）
- npm

### 本地开发

1. 克隆仓库：

```bash
git clone https://github.com/NENWA618/QCNOTE.git
cd QCNOTE
```

2. 安装依赖：

```bash
npm install
```

3. 启动开发服务器：

```bash
npm run dev
```

4. 打开浏览器访问 [http://localhost:3000](http://localhost:3000)

### Docker 快速部署

```bash
docker-compose up -d
```

访问 [http://localhost:3000](http://localhost:3000)

`docker-compose.yml` 会启动 `app`（前端）、`server`（Fastify 后端，镜像见 `server/Dockerfile`，构建上下文为仓库根目录）和 `redis` 三个服务，**不包含 PostgreSQL**，请自行提供数据库。启动前需在 shell 或 `.env` 中设置 `NEXTAUTH_URL`、`NEXTAUTH_SECRET`、`DATABASE_URL`、`VAULT_MASTER_KEY`（缺少时 compose 会直接报错），`DEVICE_SESSION_SECRET`、`VAPID_PUBLIC`/`VAPID_PRIVATE` 可选。

### 环境配置（可选）

纯本地笔记功能无需任何配置。要启用登录、个人主页、排行榜、推送等后端功能，请复制 [.env.example](.env.example) 为 `.env.local` 并填写：

```bash
# 前端（Next.js）
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<openssl rand -base64 32>
BACKEND_URL=http://localhost:10000       # 独立 Fastify 后端地址
VAULT_MASTER_KEY=<openssl rand -base64 32>  # 生产必填，用于加密存储用户密钥
DEVICE_SESSION_SECRET=<openssl rand -base64 32>

# 后端（server/）
DATABASE_URL=postgresql://user:password@localhost:5432/qcnote
REDIS_URL=redis://localhost:6379
```

本地开发时若未配置 OAuth，可使用开发专用的 `test` 登录（仅 `NODE_ENV=development` 生效，见 [docs/SECURITY_IMPROVEMENTS.md](docs/SECURITY_IMPROVEMENTS.md)）。

OAuth（Google / GitHub / Discord）、Web Push（`VAPID_PUBLIC` / `VAPID_PRIVATE`，见 [docs/VAPID_SETUP.md](docs/VAPID_SETUP.md)）等可选变量的说明见 `.env.example`。生产环境下缺少 `DATABASE_URL`、`REDIS_URL` 或 `VAULT_MASTER_KEY` 时相关服务会拒绝启动，仅开发环境会回退到内存 mock。

后端服务单独运行：

```bash
cd server && npm install
npm run dev            # 开发（tsx --watch），默认监听 10000 端口
```

## 📖 使用指南

### 创建和编辑笔记

1. **新建笔记**: 点击 "新建笔记" 或按 `Ctrl+N`
2. **Markdown 支持**: 支持标准 Markdown 语法
3. **数学公式**:
   - 行内公式：`$E=mc^2$`
   - 块级公式：`$$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$$`
4. **创建双链**: `[[相关笔记标题]]` 即可创建链接
5. **自动保存**: 编辑内容会自动保存到本地

### 搜索和浏览

- **全文搜索**: 使用顶部搜索框进行全文搜索
- **语义搜索**: 在仪表盘搜索栏旁开启后，可找出措辞不同但含义相近的笔记（首次开启会下载模型，之后由浏览器缓存）
- **标签筛选**: 按标签、分类或日期筛选
- **知识图谱**: 查看笔记关系网络
- **多维视图**: 在日历、时间线、列表视图间切换

### 网页剪藏

1. 在 Chrome 或 Firefox 中加载 `extensions/` 下对应的扩展（步骤见 [extensions/README.md](extensions/README.md)）。
2. 点击扩展图标，填入你的 QCNOTE 地址并保存，然后选择"剪藏整页 / 选中内容 / 文章"。
3. 浏览器会打开 QCNOTE 仪表盘并弹出确认框，显示标题、来源和内容预览，点击"保存为笔记"后才会写入本地。

剪藏数据放在 URL hash 中，不会发送到服务器；未经确认不会保存任何内容。

### 同步和备份

1. **WebDAV 同步**:
   - 打开设置 → 同步设置
   - 填入 WebDAV 服务器地址
   - 点击"连接"并授权

2. **OneDrive 同步**:
   - 打开设置 → OneDrive 同步
   - 登录微软账户
   - 选择同步文件夹

3. **版本历史**:
   - 右侧面板查看历史版本
   - 对比不同版本的差异
   - 恢复到任意历史版本

### 社区功能

- **个人主页**: 编辑并展示你的公开资料
- **排行榜**: 查看用户排行和成就

## 🏗️ 架构概览

QCNOTE 采用浏览器优先的本地存储架构，核心功能在客户端运行，后端服务作为可选扩展。

### 前端与运行时

- **Next.js 16.3.4**: 构建页面与路由
- **React 18.3.1**: UI 组件与交互
- **TypeScript 5.2.0**: 类型安全
- **Tailwind CSS 3.4.1**: 响应式样式
- **QCNOTE 运行时（qcruntime/）**: 浏览器端 IndexedDB + AES-GCM 字段级加密
- **IndexedDB / localStorage**: 本地优先存储，支持离线工作

### 搜索与智能

- **Lunr.js**: 本地全文搜索引擎
- **语义搜索**: `@huggingface/transformers` 在 Web Worker 中运行多语言 MiniLM 模型生成 embedding，笔记向量按更新时间缓存，仅在用户开启后才加载
- **词频向量**: `lib/vector.ts` 的 bag-of-words 余弦相似度，作为全文搜索的补充，无需下载模型
- **Sentiment.js**: 笔记情感分析
- **react-markdown / remark / rehype**: Markdown 与公式渲染

### 可选后端

- **Fastify**（`server/`）: 独立后端，`pages/api/*` 通过 `BACKEND_URL` 代理转发
- **PostgreSQL**: 用户、推送订阅、用户金库密钥等数据
- **Redis**: 缓存与排行榜
- **NextAuth**: Google / GitHub / Discord OAuth 登录
- **设备会话**（`/api/device/*`）: 基于设备指纹的会话签发与校验
- **金库密钥**（`/api/vault/key`）: 服务端用 `VAULT_MASTER_KEY` 加密保存每个用户的本地加密密钥
- **Web Push**（`/api/push/*`）: VAPID 推送通知
- **管理后台**（`/admin`）: 用户、角色与统计管理
- **OneDrive 集成**: Microsoft Graph 支持

### AI 模型接入

`/models` 页面可配置任意 OpenAI 兼容的 Chat Completions 接口。API Key 仅加密保存在本地，请求由浏览器直接发往你配置的地址，不经过 QCNOTE 服务器。

### 浏览器扩展

`extensions/` 提供 Chrome 与 Firefox 的网页剪藏扩展：内容通过 URL hash 交给仪表盘，用户确认后写入本地笔记，详见 [extensions/README.md](extensions/README.md)。

详见 [ARCHITECTURE.md](docs/ARCHITECTURE.md)

## 💻 开发指南

### 可用命令

```bash
npm run dev      # 启动开发服务器
npm run build    # 生产构建
npm run start    # 启动生产服务器
npm run lint     # 代码检查
npm run format   # Prettier 格式化
npm test         # 运行单元测试（Vitest）
npm run test:e2e # 运行 E2E 测试（Playwright）
npm run start-server # 从仓库根目录启动 Fastify 后端
npm run check-admin  # 查询管理员账号状态
```

### 项目结构

```
QCNOTE/
├── components/          # React 组件
│   ├── NoteEditor.tsx   # 笔记编辑器
│   ├── NoteList.tsx     # 笔记列表
│   ├── KnowledgeGraph.tsx # 知识图谱
│   └── ...
├── lib/                # 业务逻辑
│   ├── storage.ts       # 数据持久化层
│   ├── indexer.ts       # 搜索索引
│   ├── vector.ts        # 向量搜索
│   └── ...
├── pages/              # Next.js 页面
│   ├── index.tsx       # 首页
│   ├── dashboard.tsx   # 仪表盘
│   └── api/            # API 路由
├── qcruntime/          # 浏览器运行时与加密存储
├── styles/             # 全局样式
├── public/             # 静态资源（含 service-worker.js）
├── server/             # Fastify 后端（独立的 package.json）
│   ├── index.ts        # 路由入口
│   ├── ugc-service.ts  # 用户资料、排行榜
│   ├── push-service.ts # Web Push
│   └── ...
├── extensions/         # Chrome / Firefox 网页剪藏扩展（内容经 URL hash 交给仪表盘）
├── scripts/            # 数据库迁移、管理员引导、依赖审计等脚本
├── test/  e2e/         # 单元测试 / 端到端测试
├── .dockerignore       # Docker 构建上下文排除项（前端与后端镜像共用）
├── docs/               # 文档
└── docker-compose.yml  # Docker 编排文件
```

### 开发流程

1. 创建特性分支：`git checkout -b feature/your-feature`
2. 编写代码并测试：`npm test`
3. 提交代码：`git commit -m 'Add your feature'`
4. 推送分支：`git push origin feature/your-feature`
5. 提交 Pull Request

## 🧪 测试

QCNOTE 使用多层次的测试策略：

```bash
# 单元测试
npm test

# 端到端测试
npm run test:e2e

# 代码检查
npm run lint
```

## 📦 依赖管理

### 核心依赖

- `react` 18.3.1 - UI 框架
- `next` 16.3.4 - 服务器框架
- `typescript` 5.2.0 - 类型系统
- `tailwindcss` 3.4.1 - 样式框架
- `lunr` 2.3.9 - 搜索引擎
- `@huggingface/transformers` 4.x - 浏览器端语义搜索
- `next-auth` 4.x - 认证
- `zod` 4.x - 输入校验

### 后端依赖（`server/package.json`）

- `fastify` 5.x、`@fastify/jwt`、`@fastify/cors`
- `pg` - PostgreSQL 驱动
- `redis` - 缓存服务
- `web-push` - 推送通知
- `bull` - 任务队列

## 🚀 部署

### Vercel 部署

最简单的部署方式，自动从 GitHub 部署：

```bash
# 推送到 GitHub
git push origin main

# 在 Vercel 上连接仓库即可自动部署
```

### Docker 部署

```bash
# 构建镜像
docker build -t qcnote .

# 运行容器
docker run -p 3000:3000 qcnote
```

完整栈（前端 + 后端 + Redis）请使用 `docker-compose up -d`。后端也可用 `render.yaml` 部署到 Render。

### 自托管

1. 克隆仓库到服务器
2. 安装依赖：`npm install`
3. 构建：`npm run build`
4. 启动：`npm run start`
5. （可选）在 `server/` 中安装依赖并启动后端，见上文"环境配置"

## 🤝 贡献指南

我们欢迎任何形式的贡献！

### 贡献步骤

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 贡献指南

- 遵循现有代码风格
- 为新功能添加测试
- 更新相关文档
- 确保所有测试通过

## 🐛 问题反馈

如发现问题，请在 [GitHub Issues](https://github.com/NENWA618/QCNOTE/issues) 上反馈

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

感谢以下开源项目和社区的支持：

- [Next.js](https://nextjs.org/)
- [React](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Lunr.js](https://lunrjs.com/)
- [Fastify](https://www.fastify.io/)
- 和所有其他贡献者

## 📧 联系方式

- **邮箱**: i24026878@student.newinti.edu.my
- **GitHub**: [@NENWA618](https://github.com/NENWA618)
- **问题反馈**: [Issues](https://github.com/NENWA618/QCNOTE/issues)
- **讨论**: [Discussions](https://github.com/NENWA618/QCNOTE/discussions)

---

**⭐ 如果这个项目对您有帮助，请给个 star！**
