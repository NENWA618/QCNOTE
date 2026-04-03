# NOTE 个人笔记应用

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

## 🔒 安全特性

- **错误隔离**：全局 ErrorBoundary 组件，应用级别故障不会导致完全崩溃
- **后端代理**：所有 AI API 调用通过后端代理（server/aiService.ts），API 密钥不暴露浏览器
- **速率限制**：后端中间件限制每IP 30次请求/分钟，防止 API 滥用
- **可选认证**：支持 X-API-Key 请求头认证（REQUIRE_API_KEY=true 启用）

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
npm run dev           # 开发服务器（HMR 启用）
npm run build         # 生产构建
npm start             # 启动生产服务器
npm run lint          # ESLint 检查
npm run format        # Prettier 格式化
npm test              # Vitest 单元测试
npm run test:e2e      # Playwright 端到端测试
npm run test:e2e:ui   # E2E 测试 UI 模式（调试）
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
NODE_ENV=development
OPENAI_API_KEY=<your-openai-key>
REDIS_URL=redis://<user>:<password>@<host>:<port>
VAPID_PUBLIC=<publicKey>
VAPID_PRIVATE=<privateKey>
REQUIRE_API_KEY=false         # 设为 true 启用 X-API-Key 认证
```

### 速率限制与安全

后端自动限制 AI 端点速率：
- **限制**：每个 IP 30 次请求/分钟
- **响应头**：X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
- **超限状态码**：429 Too Many Requests

启用 API 密钥认证：
```bash
REQUIRE_API_KEY=true API_KEY=your-secret-key npm start
```

客户端需在请求头添加：
```javascript
fetch('/api/ai/generateTags', {
  method: 'POST',
  headers: { 'X-API-Key': 'your-secret-key' },
  body: JSON.stringify({ content: '...' })
})
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

## ♿ 可访问性

项目支持 WCAG 2.1 Level AA 可访问性标准：
- ✓ 键盘导航支持
- ✓ 屏幕阅读器兼容
- ✓ 充分的颜色对比度
- ✓ 触摸友好的按钮大小（移动设备）

运行可访问性测试：
```bash
npm run test:e2e -- accessibility.spec.ts
```

## 🔐 隐私与授权

- 前端默认仅本地存储，无远程同步
- Live2D 资源遵循源项目许可证（GPL-2.0 或模型对应授权）
- 敏感信息请断网使用或自行扩展加密存储
- API 密钥通过后端代理安全处理，不暴露客户端

## 🧪 测试与质量

### 单元测试（Vitest）
```bash
npm test              # 运行所有单元测试
npm test -- --ui     # 打开测试 UI
```

**覆盖范围：**
- ✓ 存储操作（test/storage.test.ts）
- ✓ 搜索索引（test/indexer.test.ts）
- ✓ 向量计算（test/vector.test.ts）
- ✓ 服务端路由（test/server.test.ts）
- ✓ 组件行为（test/NoteList.test.tsx）

### E2E 测试（Playwright）
```bash
npm run test:e2e      # 跨浏览器测试
npm run test:e2e:ui   # 交互式调试
```

**覆盖场景：**
- ✓ 基础 CRUD 操作
- ✓ 笔记搜索与过滤
- ✓ 标签与分类管理
- ✓ WCAG 可访问性检查
- ✓ 错误处理行为

### 代码质量
**预提交钩子（Husky + lint-staged）**
```bash
npx husky install    # 初始化钩子（一次性）
```

现在每次提交都会自动：
- ✓ ESLint 检查
- ✓ Prettier 格式化
- ✓ TypeScript 类型检查

推送前会自动运行完整测试套件。

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

## 📜 许可证与致谢

### 主项目许可证

**MIT License** - 详见 [LICENSE](LICENSE) 文件

```
Copyright (c) 2026 LEE YU HAO

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software...
```

### 第三方开源项目

NOTE 应用建立在众多优秀开源项目之上。主要技术依赖包括：

| 项目 | 许可证 | 用途 |
|------|-------|------|
| [React](https://react.dev) | MIT | UI 框架 |
| [Next.js](https://nextjs.org) | MIT | Web 框架 |
| [Lunr.js](https://lunrjs.com) | MIT | 全文搜索 |
| [Pixi.js](https://pixijs.com) | MIT | 2D 渲染 |
| [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) | MIT | Live2D 显示 |
| [Live2D 看板娘](https://github.com/fghrsh/live2d_demo) | GPL-2.0 | 看板娘实现 |
| [react-markdown](https://github.com/remarkjs/react-markdown) | MIT | Markdown 渲染 |
| [Tailwind CSS](https://tailwindcss.com) | MIT | CSS 框架 |

**完整许可证详见：**
- 📄 [CREDITS.md](CREDITS.md) - 所有依赖项的完整列表和许可证
- 📊 [FOOTER_COPYRIGHT_AUDIT.md](FOOTER_COPYRIGHT_AUDIT.md) - 版权审计报告

### 许可证兼容性

- ✅ MIT + GPL-2.0：兼容（项目使用 MIT，可包装 GPL-2.0）
- ✅ MIT + Apache-2.0：兼容（都是宽松许可证）

### 特别感谢

感谢以下项目的贡献者和维护者，使得 NOTE 的开发成为可能：

- **Live2D 官方团队** - 强大的 3D 角色系统
- **React 和 Next.js 团队** - 现代化的开发体验
- **开源社区** - 数百个小型但关键的库维护者


