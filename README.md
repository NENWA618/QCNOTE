# NOTE 个人笔记应用（重构文档）

> 简洁优雅的全功能笔记管理系统，支持本地存储、Live2D 看板娘、全文 + 向量搜索、离线敏感内容保护，以及可选后端增强服务。

## 🌟 项目简介

- 技术栈：Next.js 14 + React 18 + TypeScript 5 + Tailwind CSS 3
- 数据存储：前端首选 IndexedDB（lib/storage.ts, lib/idb.ts），保护隐私，支持离线。
- 动画助手：本地 Live2D 模型（public/js/waifu.js + public/models/*），包括交互、提醒、台词。
- 搜索能力：lunr + 自定义向量检索（lib/indexer.ts, lib/vector.ts），支持全文检索与相似笔记推荐。
- 可选后端：Node + Fastify（server/index.ts）用于队列、情感分析、推送等高级功能。

## ✅ 核心功能

- 笔记 CRUD：新建、编辑、删除、归档、收藏
- Markdown 支持：react-markdown + remark-gfm + rehype-sanitize
- 标签/分类：多维度笔记组合组织，支持多标签搜索
- 数据导入/导出：JSON 批量操作与迁移（components/ImportExport.tsx）
- 仪表盘：统计、热力、趋势图（components/NoteStats.tsx）
- 本地天气：public/data/local-weather.json + 非依赖 API fallback
- 看板娘：本地交互模型 + 健康提示（components/Character.tsx, public/js/waifu*.js）

## 📁 目录说明

- pages/: Next.js 页面入口
- components/: UI 组件
- lib/: 业务逻辑、存储、搜索、辅助函数
- public/: 静态资源（js、模型、图片、数据）
- server/: 可选后端服务（推荐 Render 部署）
- test/: Vitest 单测

## 🚀 本地运行

### 1. 前端

```bash
cd c:\Users\USER\OneDrive\Documents\NOTE
npm install
npm run dev
```

访问：`http://localhost:3000`

### 2. 可选后端（启动与同步）

```bash
cd server
npm install
npm start
```

默认：`http://localhost:10000`

### 3. 常用脚本

```bash
npm run build
npm start
npm run lint
npm test
npm run format
```

## ⚙️ 配置与环境变量

### 前端（./.env.local）

```env
NEXT_PUBLIC_CHARACTER_SERVER_URL=http://localhost:10000
NEXT_PUBLIC_VAPID_PUBLIC=<your-vapid-public-key>
```

### 后端（server/.env 或环境变量）

```env
PORT=10000
REDIS_URL=redis://<user>:<password>@<host>:<port>
VAPID_PUBLIC=<publicKey>
VAPID_PRIVATE=<privateKey>
```

## 🧩 数据模型

笔记说明（lib/types/ 和 lib/storage.ts）：

```json
{
  "id": "note_1708262400000",
  "title": "示例标题",
  "content": "Markdown 内容",
  "category": "生活|工作",
  "tags": ["tag1", "tag2"],
  "color": "#dc96b4",
  "isFavorite": false,
  "isArchived": false,
  "createdAt": 1708262400000,
  "updatedAt": 1708262400000
}
```

## 📦 部署建议

### 前端：Vercel
1. 连接 GitHub 仓库
2. 设置环境变量
   - NEXT_PUBLIC_CHARACTER_SERVER_URL
   - NEXT_PUBLIC_VAPID_PUBLIC
3. 构建命令：`npm install && npm run build`
4. 启动命令：`npm start`

### 后端：Render
1. 目标目录：server
2. Build：`npm install`
3. Start：`node index.js`
4. Redis：建议使用 Render Key Value /外部 Redis

## 🛠️ 快速故障排查

- 页面空白：浏览器控制台是否 waifu.js / Live2D 加载失败
- 数据无法保存：IndexedDB 权限或存储异常（lib/idb.ts）
- 搜索不准：重建全文和向量索引，查看 lib/indexer.ts
- 后端 500：server/log 及 REDIS_URL/VAPID 配置

## 🔐 隐私与授权

- 前端默认仅本地存储，无远程同步
- Live2D 资源遵循源项目许可证（GPL-2.0 或模型对应授权）
- 敏感信息请断网使用或自行扩展加密存储

## 🧪 测试

```bash
npm test
```

## 📌 贡献指南

- 代码风格：ESLint + Prettier
- 分支策略：main + 特性分支
- PR 内容：功能说明、测试覆盖、文档变更

## 📚 参考链接

- pages/index.tsx, pages/dashboard.tsx
- lib/storage.ts, lib/indexer.ts, lib/vector.ts
- components/Character.tsx, public/js/waifu.js
- server/index.ts, server/queue.ts, server/worker.ts

## 🏷️ 版本

- 当前：1.0.0

## 📜 许可证

MIT
