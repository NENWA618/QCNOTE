# NOTE - 个人笔记应用

[![build](https://github.com/NENWA618/NOTE/actions/workflows/ci.yml/badge.svg)](https://github.com/NENWA618/NOTE/actions)
[![version](https://img.shields.io/badge/frontend-1.0.0-blue)](https://github.com/NENWA618/NOTE)
[![backend](https://img.shields.io/badge/backend-1.0.3-blue)](https://github.com/NENWA618/NOTE)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![issues](https://img.shields.io/github/issues/NENWA618/NOTE)](https://github.com/NENWA618/NOTE/issues)

一个简洁而优雅的个人笔记应用，配备 AI 看板娘、提醒系统、和养成机制。前端完全本地存储（隐私优先），后端可选部署以启用推送通知。

- 🎨 **前端**：Next.js 14 + TypeScript + Tailwind CSS（已部署 Vercel）
- 🚀 **后端**：Fastify + Node.js（可选，已部署 Render）
- 🤖 **AI诺特**：虚拟助手，支持聊天、养成、提醒解析

## 🎯 当前功能与状态

### ✅ 核心功能

**笔记管理**
- 📝 创建、编辑、删除笔记
- 📋 Markdown 富文本支持（表格、代码块、列表）
- 🏷️ 分类 + 标签组织
- ❤️ 收藏与归档
- 🔍 全文搜索 + 向量相似度搜索
- 📊 统计与可视化
- 💾 IndexedDB 本地存储（隐私优先）
- 📤 JSON 导入/导出

**AI 诺特助手**
- 💬 实时对话与聊天历史
- 🤖 AI 生成回复（本地规则或后端 API）
- 🎮 养成系统（XP、等级、好感度）
- ⏰ 自然语言提醒解析
- 🔔 Web Push 推送通知
- 📚 笔记内容引用与上下文

**技术架构**
- ✨ Next.js 14 + React 18 + TypeScript
- 🎨 Tailwind CSS 响应式设计
- 🏗️ 可选 Fastify 后端（前后端分离）
- 📦 BullMQ + Redis 任务队列
- 🧪 Vitest 单元测试
- 🚀 CI/CD 自动化（GitHub Actions）
- 📱 PWA 支持（Service Worker + Web Push）


## 🚀 快速开始（5 分钟上手）

### 前置要求

- Node.js 18+（推荐）和 npm
- 代码编辑器（推荐 VS Code）

---

### 🤖 AI 看板娘 — 诺特

NOTE 内置了一个虚拟助手"诺特"，她是你的笔记精灵。

**基础对话**
- 出现在首页右下角，点击她即可展开聊天窗口
- 基于浏览器 IndexedDB 中的笔记统计自动生成记忆与个性
- 会分析、索引笔记内容并支持关键词搜索；提问时可自动引用相关笔记片段
- 支持情绪识别（开心/悲伤/调皮/思考等）和上下文对话

**养成系统** ⭐ *新功能*
- 每次聊天和完成提醒都累积 XP，满足阈值自动升级
- 提醒的完成会增加好感度（❤），每 10 分钟无相交自动衰减
- 显示当前等级、XP进度条、好感度

**提醒与推送** ⭐ *新功能*
- 支持自然语言解析提醒，例如：
  ```
  "提醒我在 2025-03-02 09:00 做 喝水"
  "提醒我明天 14:00 去 开会"
  "提醒我在 15:30 做 休息"
  ```
- 本地会在 IndexedDB 存储提醒，后端（Render）可选发送 Web Push 通知
- 需配置 `VAPID_PUBLIC` / `VAPID_PRIVATE` 以启用推送（见[环境变量](#环境变量配置)）
- 若无后端或未配置 VAPID，系统仍会本地存储提醒但不发送推送

**后端支持**
- 可选 Fastify 后端提供 `/reply` 接口以获得更聪慧的回复
- 后端索引笔记内容并在回复时引用相关片段
- 配合 Web Push 和 Redis 队列完整实现提醒推送
- 若无后端或网络不可达，前端自动降级到内置规则


**提醒与推送**

- 前端通过 Service Worker 注册 Web Push 订阅；后端（可部署在 Render）使用 `web-push` 加上 Redis 队列来计划并发送通知。
- 环境变量需配置 `VAPID_PUBLIC`/`VAPID_PRIVATE` 以及指向后端的 `NEXT_PUBLIC_CHARACTER_SERVER_URL`。
- 若无法访问后端，系统会回退到本地简单规则但不会发送推送。


运行后端（可选）：

```bash
npm run start-server   # 启动 Fastify 服务器，默认 10000
```

在环境变量 `NEXT_PUBLIC_CHARACTER_SERVER_URL` 中指定不同 URL。

---
### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

开发服务器默认运行于 http://localhost:3000（若被占用会自动选择下一个可用端口）。

在浏览器打开以下页面：

| 页面 | URL |
| ---- | --- |
| 首页 | http://localhost:3000 |
| 笔记 | http://localhost:3000/dashboard |
| 支持 | http://localhost:3000/contact |

### 生产构建

```bash
npm run build
npm start
```

### 代码检查与开发工具

```bash
npm run lint      # ESLint
npm run format    # Prettier
npm run test      # Vitest 单元测试
npx tsc --noEmit  # TypeScript 类型检查
```

提示：请定期导出重要笔记，清除浏览器缓存会删除本地数据。

### 快捷键

- `Ctrl+K` - 搜索笔记

## 📁 项目结构

```
NOTE/
├── pages/                   # Next.js 页面 (TSX)
│   ├── _app.tsx            # 应用入口（初始化存储、导入 Tailwind）
│   ├── index.tsx           # 首页（包含诺特虚拟助手）
│   ├── dashboard.tsx       # 笔记管理页面
│   ├── contact.tsx         # 联系页面
│   ├── privacy.tsx         # 隐私政策
│   └── terms.tsx           # 使用条款
├── components/             # React 可复用组件 (TSX)
│   ├── Character.tsx       # 诺特虚拟助手（聊天、养成）
│   ├── CharacterSVG.tsx    # 诺特角色 SVG 渲染
│   ├── Header.tsx          # 导航栏
│   ├── Sidebar.tsx         # 侧边栏（分类、排序、统计）
│   ├── Footer.tsx          # 页脚
│   └── MarkdownView.tsx    # 安全渲染 Markdown
├── lib/                    # 业务逻辑与工具 (TS)
│   ├── character.ts        # AI 对话逻辑与聊天历史
│   ├── progression.ts      # 养成系统（XP、等级、好感度）
│   ├── reminder.ts         # 提醒解析与同步
│   ├── push.ts             # Web Push 订阅与通知
│   ├── logger.ts           # 日志工具
│   ├── idb.ts              # IndexedDB 助手
│   ├── storage.ts          # 存储层（IndexedDB 优先 + localStorage 兼容）
│   ├── utils.ts            # 工具函数（搜索、索引等）
│   ├── vector.ts           # 向量计算
│   ├── sentiment.ts        # 情感分析
│   └── types/global.d.ts   # 全局类型声明
├── public/                 # 静态资源
│   ├── service-worker.js   # Service Worker（Web Push 处理）
│   └── images/
├── server/                 # 后端服务 (Node.js + Fastify)
│   ├── index.js            # 主服务器入口
│   ├── push.js             # Web Push 路由与 Redis 队列
│   ├── queue.js            # BullMQ 队列初始化
│   ├── worker.js           # 后台提醒工作进程
│   ├── vector.ts           # 向量索引（共享库副本）
│   ├── sentiment.ts        # 情感分析（共享库副本）
│   ├── characterData.ts    # 诺特角色数据
│   └── package.json        # 后端依赖
├── test/                   # 单元测试 (Vitest)
│   ├── storage.test.ts
│   ├── idb.test.ts
│   ├── vector.test.ts
│   ├── utils.test.ts
│   ├── progression.test.ts
│   └── reminder.test.ts
├── data/                   # 示例数据
│   └── sample-notes.json
├── styles/                 # 样式
│   └── globals.css         # Tailwind 全局配置与组件层
├── types/                  # 全局类型
│   └── sentiment.d.ts      # sentiment 库类型定义
├── .github/                # GitHub Actions CI 配置
├── .eslintrc.json          # ESLint 配置
├── .prettierrc             # Prettier 格式化配置
├── tailwind.config.js      # Tailwind 主题与自定义
├── postcss.config.js       # PostCSS 配置
├── tsconfig.json           # TypeScript 配置
├── package.json            # 前端依赖与脚本
├── render.yaml             # Render 后端部署配置
├── lighthouseci.config.js  # Lighthouse CI 配置
├── NOTE.code-workspace     # VS Code 工作区配置
└── README.md               # 本文档
```

**前后端分离说明**
- 前端部署到 Vercel（自动 CI/CD）
- 后端可选部署到 Render 或自托管（需 Node.js 22+）
- 共享库（`lib/vector.ts`, `lib/sentiment.ts` 等）同时在前后端使用

## 🎨 设计系统（Tailwind CSS）

> 字体：全局使用 Google 的 `Inter` 字体，通过 `next/font` 优化加载，已在 `_app.tsx` 应用。


### 自定义主题配置

在 `tailwind.config.js` 中定义的设计令牌：

**颜色调色板**

- `primary-light`: #f6e0e7（浅粉紫）
- `primary-medium`: #d8cbcf（中粉紫）
- `primary-dark`: #c8b8c8（深粉紫）
- `accent-pink`: #dc96b4（强调粉色）
- `accent-purple`: #b0a8c0（强调紫色）
- `text-light`: #5c5c5c（浅灰文字，已加深提高对比度）

**组件层类**（在 `styles/globals.css` 中定义）

定义了 20+ 可复用的组件类：

- `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-sm` — 按钮组件
- `.card` — 卡片容器
- `.note-card` — 笔记卡片
- `.input` / `.select` / `.search-box` — 表单元素
- `.stat-item` — 统计项
- `.empty-state` — 空状态

所有组件使用 Tailwind 的 `@apply` 指令，保证样式的一致性。

## ⚙️ 核心技术栈

**前端**
| 部分   | 技术              | 版本    |
| ------ | ----------------- | ------- |
| 框架   | Next.js           | 14.2.35 |
| UI     | React             | 18      |
| 语言   | TypeScript        | 5.2     |
| 样式   | Tailwind CSS      | 3.4.1   |
| 存储   | IndexedDB / localStorage | 原生 |
| Markdown| react-markdown + remark-gfm | 10.1.0 |
| 搜索   | lunr              | 2.3.9   |
| 情感   | sentiment         | 5.0.1   |
| Push   | Web Push API      | 原生    |
| 测试   | Vitest            | 1.4.4   |
| 检查   | ESLint            | 8.x     |
| 格式   | Prettier          | 2.8     |

**后端**
| 部分   | 技术              | 版本    |
| ------ | ----------------- | ------- |
| 框架   | Fastify           | 4.24.0  |
| 运行时 | Node.js           | 18+     |
| 队列   | BullMQ            | 5.0.0   |
| 缓存   | Redis (ioredis)   | 5.3.2   |
| Push   | web-push          | 3.6.7   |
| CORS   | @fastify/cors     | 8.2.0   |
| 搜索   | lunr              | 2.3.9   |
| 情感   | sentiment         | 5.0.1   |

---

### 📋 环境变量配置

前端（`.env.local`）：
```env
# 后端 AI 回复接口（可选，默认本地生成）
NEXT_PUBLIC_CHARACTER_SERVER_URL=http://localhost:10000

# Web Push VAPID 公钥（可选，需配置私钥才能启用推送）
NEXT_PUBLIC_VAPID_PUBLIC=<your-vapid-public-key>
```

后端（Render 环境变量）：
```env
# Web Push VAPID 密钥对（见下方生成方式）
VAPID_PUBLIC=<your-vapid-public-key>
VAPID_PRIVATE=<your-vapid-private-key>

# Redis 队列（可选，未配置时提醒不会发送推送）
REDIS_URL=redis://<user>:<password>@<host>:<port>

# 监听端口
PORT=10000
```

**生成 VAPID 密钥**
```bash
npx web-push generate-vapid-keys
# 输出:
# Public Key: ...
# Private Key: ...
```

然后将 Public Key 设置到前端，Private Key 设置到后端。两个值必须成对使用。

---

## 🚀 部署指南

### 前端部署（Vercel）

1. Fork 本仓库到你的 GitHub
2. 连接到 Vercel，导入项目
3. 配置环境变量（可选）：
   ```
   NEXT_PUBLIC_CHARACTER_SERVER_URL=<你的后端地址>
   NEXT_PUBLIC_VAPID_PUBLIC=<VAPID公钥>
   ```
4. 部署自动触发，访问给定的 Vercel URL

**当前生产环境**：https://note-psi-roan.vercel.app

### 后端部署（Render）

1. Fork 本仓库到你的 GitHub
2. 在 Render 创建 Web Service，选择此仓库
3. 配置：
   - **构建命令**：`npm install`
   - **启动命令**：`npm start`
   - **环境变量**：
     ```
     VAPID_PUBLIC=<your-vapid-public-key>
     VAPID_PRIVATE=<your-vapid-private-key>
     REDIS_URL=<redis-url> (可选，无则提醒无法推送)
     PORT=10000
     ```
4. 部署完成后，获得后端 URL（如 `https://note-backend.onrender.com`）
5. 在前端环境变量中设置 `NEXT_PUBLIC_CHARACTER_SERVER_URL=https://note-backend.onrender.com`，重新部署前端

### 本地开发

前端：
```bash
npm install
npm run dev        # http://localhost:3000
```

后端（可选):
```bash
cd server
npm install
npm run dev        # http://localhost:10000
```

## 💾 数据结构

笔记对象结构：

```json
{
  "id": "note_1708262400000",
  "title": "笔记标题",
  "content": "笔记内容...",
  "category": "生活|工作|学习|灵感",
  "tags": ["标签1", "标签2"],
  "color": "#dc96b4",
  "isFavorite": false,
  "createdAt": 1708262400000,
  "updatedAt": 1708262400000,
  "isArchived": false
}
```

## ✨ 核心功能一览

| 功能 | 说明 |
|------|------|
| 📝 笔记管理 | 创建、编辑、删除、收藏、归档 |
| 📋 Markdown | 富文本支持，包括表格、代码块、列表 |
| 🏷️ 分类标签 | 按分类和标签灵活组织 |
| 🔍 搜索 | 全文搜索 + 向量相似度搜索 |
| 📊 统计可视化 | 笔记数量、标签热力、类别分布 |
| 💾 隐私存储 | IndexedDB 本地存储，100% 隐私保护 |
| 💬 AI聊天 | 诺特虚拟助手，支持对话和提醒 |
| 🎮 养成系统 | XP、等级、好感度进度 |
| ⏰ 智能提醒 | 自然语言解析，Web Push 通知 |
| 📤 导入导出 | JSON 备份与恢复 |


## 🔒 存储细节 & 调试

NOTE 的存储逻辑位于 `lib/storage.ts`：

### 异步优先（推荐）

所有核心操作均提供异步版本（`getDataAsync()`、`addNoteAsync()`、`updateNoteAsync()` 等），支持 IndexedDB。
应用中所有新业务逻辑都调用这些 `*Async` 方法。**这是首选方式**。

```typescript
// ✅ 推荐用法
const notes = await storage.getDataAsync();
const newNote = await storage.addNoteAsync({ title: 'Test' });
await storage.updateNoteAsync(id, { title: 'Updated' });
```

### 同步方法（已移除）

为了简化代码路径并避免性能陷阀，原来的同步存取 API（`getData()`、`addNote()` 等）
已在当前版本中彻底移除。应用层不再可见这些方法：所有读写操作均需使用
异步接口（`*Async`），并且后端已删除相关日志警告。

```typescript
// ✅ 正确用法
const notes = await storage.getDataAsync();
```

对于旧项目，请确保完成迁移后彻底删除任何同步调用。

### 迁移指南：从同步到异步

如果你在代码中发现了同步 storage 方法调用，按照以下步骤迁移：

| 同步方法 | 异步替代 |
| --- | --- |
| `storage.getData()` | `await storage.getDataAsync()` |
| `storage.setData(notes)` | `await storage.setDataAsync(notes)` |
| `storage.getSettings()` | `await storage.getSettingsAsync()` |
| `storage.setSettings(s)` | `await storage.setSettingsAsync(s)` |
| `storage.addNote(n)` | `await storage.addNoteAsync(n)` |
| `storage.updateNote(id, u)` | `await storage.updateNoteAsync(id, u)` |
| `storage.deleteNote(id)` | `await storage.deleteNoteAsync(id)` |
| `storage.getNote(id)` | `await storage.getNoteAsync(id)` |
| `storage.searchNotes(kw)` | `await storage.searchNotesAsync(kw)` |
| `storage.getNotesByCategory(cat)` | `await storage.getNotesByCategoryAsync(cat)` |
| `storage.toggleFavorite(id)` | `await storage.toggleFavoriteAsync(id)` |
| `storage.getCategories()` | `await storage.getCategoriesAsync()` |
| `storage.getAllTags()` | `await storage.getAllTagsAsync()` |
| `storage.getStats()` | `await storage.getStatsAsync()` |
| `storage.getFavoriteNotes()` | `await storage.getFavoriteNotesAsync()` |
| `storage.clearAll()` | `await storage.clearAllAsync()` |

**示例**：
```typescript
// 旧的同步方式
function handleSave() {
  const notes = storage.getData() || [];
  notes.push(newNote);
  storage.setData(notes);
}

// 新的异步方式
async function handleSave() {
  const notes = await storage.getDataAsync() || [];
  notes.push(newNote);
  await storage.setDataAsync(notes);
}
```

**注意**：所有调用 storage 方法的函数都需要标记为 `async` 并使用 `await`。

### 启动时的迁移流程

`pages/_app.tsx` 在客户端首次加载时会：

```tsx
const storage = initWindowStorage();
await storage.enableIndexedDB(); // 等待完成后再渲染页面
```

这能确保 localStorage 数据在首次访问时被迁移并且不会被后续同步写回本地存储。

### 自检 & 浏览器存储查看

如果你怀疑笔记丢失或出现覆盖：

1. 打开 DevTools → Application（存储）
2. 在 **Local Storage** 节点下查找 `NOTE_STORAGE` 和 `NOTE_SETTINGS` 键
3. 在 **IndexedDB → note-db → keyvaluepairs** 里查找相同键
4. 若两者同时存在，后一方应当包含最新数据；若看到带 `_backup_` 后缀的键，则说明迁移时做了备份

可使用 `window.storage.getDataAsync()` 在控制台手动读取当前数据。

> Tip：在 Sidebar 或编辑器打开笔记时发生突然刷新，说明某处仍在使用同步方法，请检查 `lib/ui.ts` 或新增的插件是否调用了 `storage.*`。

### 日志信息

应用会在控制台打印状态信息，例如

```
✓ 检测到 IndexedDB 数据，自动启用
✓ 本地数据已备份到 IndexedDB 键： NOTE_STORAGE_backup_167... 
✓ IndexedDB 已启用，数据迁移成功
```

这些有助于追踪首次访问的迁移过程。

## 🛠️ 开发指南

### 添加新的 Tailwind 样式

1. **使用实用类直接在组件中**

   ```tsx
   <div className="bg-primary-light text-accent-pink p-6 rounded-lg shadow-light">内容</div>
   ```

2. **定义可复用组件类**

   ```css
   /* styles/globals.css */
   @layer components {
     .my-custom-component {
       @apply bg-white rounded-lg p-4 shadow-light;
     }
   }
   ```

3. **使用自定义主题配置**
   ```js
   // tailwind.config.js 中的自定义色彩
   colors: {
     'primary-light': '#f6e0e7',
     // ... 更多颜色
   }
   ```

> 额外提示：全局已通过 `next/font` 加载谷歌的 Inter 字体，样式中可使用 `className={inter.className}` 应用。


### 响应式设计

使用 Tailwind 的断点前缀：

- `md:` — 平板（768px 及以上）
- `lg:` — 桌面（1024px 及以上）

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">响应式网格</div>
```

## 📦 发布与贡献

项目托管于 GitHub，欢迎 Fork、Issue 和 Pull Request。您可以自由修改并部署在自己的服务器或静态站点。

## 许可证

MIT License - 可自由使用、修改和分发

## 👨‍💻 开发者

NOTE 由热爱笔记的开发者创建于 2026 年。

---

**更新日期**：2026 年 3 月 1 日  
**前端版本**：1.0.0  
**后端版本**：1.0.3

享受记录的过程，让思考变成力量。✨
