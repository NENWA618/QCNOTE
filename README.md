# NOTE - 个人笔记应用

[![build](https://github.com/NENWA618/NOTE/actions/workflows/ci.yml/badge.svg)](https://github.com/NENWA618/NOTE/actions)
[![version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/NENWA618/NOTE)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![issues](https://img.shields.io/github/issues/NENWA618/NOTE)](https://github.com/NENWA618/NOTE/issues)

一个简洁而优雅的个人笔记应用。完全本地存储，100% 隐私保护。现已迁移至 **Next.js 14 + TypeScript + Tailwind CSS**。

## 🎯 项目状态

### ✅ 已完成迁移

- **框架**：HTML → **Next.js 14**（React 18）
- **语言**：JS → **TypeScript** 5.2（核心模块与 React 组件）
- **样式**：内联 CSS → **Tailwind CSS 3.4.1**（实用优先 CSS 框架）
- **页面**：`pages/` 下的三个主要页面（`index.tsx`、`dashboard.tsx`、`contact.tsx`）
- **组件化**：`Header`、`Sidebar`、`Footer` React 组件
- **存储层**：`NoteStorage` 类与 React hooks 集成（支持 localStorage 和 **IndexedDB**）
- **Markdown 渲染**：安全渲染组件 (`react-markdown` + GFM + `rehype-sanitize`)
- **工具链**：ESLint + Prettier 代码检查与格式化
- **测试 & CI**：Vitest 单元测试；GitHub Actions 运行 lint、类型检查、测试与构建
- **性能 & 质量**：Lighthouse CI 配置、字体优化、lazy-loading 图像、可访问性改进


## 🚀 快速开始（5 分钟上手）

### 前置要求

- Node.js 18+（推荐）和 npm
- 代码编辑器（推荐 VS Code）
---

### AI 看板娘 — 诺特

NOTE 内置了一个虚拟助手“诺特”，她是你的笔记精灵。

- 出现在首页右下角，点击她即可展开聊天窗口。
- 基于浏览器 IndexedDB 中的笔记统计自动生成记忆与个性。
- **增强记忆**：会分析、索引笔记内容并支持关键词搜索；提问时可引用之前写过的笔记片段。
- 支持简单情绪识别（开心/悲伤/调皮等）和多句对话。
- 使用过程还能渐进“养成”角色，她会随着你互动累积经验、提升等级，并对完成提醒/任务表现出好感度。
- 可选本地后端（Fastify）提供 `/reply` 接口；若无法访问则在前端使用内置规则。
- 你可以通过对话自动设置提醒，例如“提醒我在 2026-03-02 09:00 做 喝水”，到点后会在设备上弹出通知（需要允许浏览器推送）。


**提醒与推送**

- 前端通过 Service Worker 注册 Web Push 订阅；后端（可部署在 Render）使用 `web-push` 加上 Redis 队列来计划并发送通知。
- 环境变量需配置 `VAPID_PUBLIC`/`VAPID_PRIVATE` 以及指向后端的 `NEXT_PUBLIC_CHARACTER_SERVER_URL`。
- 若无法访问后端，系统会回退到本地简单规则但不会发送推送。


运行后端（可选）：

```bash
npm run start-server   # 启动 Fastify 服务器，默认 4000
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
│   ├── _app.tsx            # 应用入口（导入 Tailwind globals）
│   ├── index.tsx           # 首页
│   ├── dashboard.tsx       # 笔记管理页面
│   ├── contact.tsx         # 联系页面
│   ├── privacy.tsx         # 隐私政策
│   └── terms.tsx           # 使用条款
├── components/             # React 可复用组件 (TSX)
│   ├── Header.tsx          # 导航栏
│   ├── Sidebar.tsx         # 侧边栏（分类、排序、统计）
│   ├── Footer.tsx          # 页脚
│   └── MarkdownView.tsx    # 安全渲染 Markdown
├── lib/                    # 业务逻辑与工具 (TS)
│   ├── idb.ts              # IndexedDB helper
│   ├── storage.ts          # 存储层（IndexedDB + localStorage 兼容）
│   ├── utils.ts            # 工具函数
│   └── types/global.d.ts   # 全局类型声明
├── styles/                 # Tailwind CSS 样式
│   └── globals.css         # 全局 Tailwind 配置
├── public/                 # 静态资源
│   └── images/
├── data/                   # 示例数据
│   └── sample-notes.json
├── .github/                # CI 配置
├── .eslintrc.json          # ESLint 配置
├── .prettierrc             # Prettier 配置
├── tailwind.config.js      # Tailwind 自定义
├── postcss.config.js       # PostCSS 配置
├── tsconfig.json           # TypeScript 配置
├── package.json            # 项目依赖与脚本
└── README.md               # 本文档
```

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

| 部分   | 技术              | 版本    |
| ------ | ----------------- | ------- |
| 框架   | Next.js           | 14.2.35 |
| UI     | React             | 18      |
| 语言   | TypeScript        | 5.2     |
| 样式   | Tailwind CSS      | 3.4.1   |
| 存储   | IndexedDB         | 原生    |
| Markdown| react-markdown + remark-gfm | 10.1.0 + 4.0.1 |
| 安全   | rehype-sanitize   | -       |
| 格式化 | Prettier          | 2.8     |
| 检查   | ESLint            | 8.x     |
| 构建   | Webpack (Next.js) | -       |

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

## ✨ 核心功能

- 📝 创建、编辑、删除笔记
- ✏️ **Markdown 支持** — 包括表格、代码块、列表等语法；编辑/预览模式切换
- 🏷️ 按分类和标签组织
- 🔍 强大的搜索功能
- ❤️ 收藏重要笔记
- 📊 笔记统计与可视化
- 💾 完全本地存储（**IndexedDB 优先**，自动迁移 localStorage 数据，隐私优先）
- 📥 导入/导出 JSON 备份


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

**更新日期**：2026 年 2 月 27 日  
**版本**：1.0.0（以 `package.json` 为准）

享受记录的过程，让思考变成力量。✨
