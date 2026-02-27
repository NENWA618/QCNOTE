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
```│   └── Footer.tsx          # 页脚
├── lib/                    # 业务逻辑与工具 (TS)
│   ├── idb.ts              # IndexedDB 助手（键值对存储）
│   ├── storage.ts          # 存储层（IndexedDB + localStorage 兼容）
│   ├── utils.ts            # 工具函数
│   └── types/global.d.ts   # 全局类型声明
├── styles/                 # Tailwind CSS 样式
│   └── globals.css         # 全局 Tailwind 配置 (@tailwind 指令，@layer 组件）
├── public/                 # 静态资源
│   └── images/
├── data/                   # 示例数据
│   └── sample-notes.json
├── docs/                   # 文档
├── .eslintrc.json         # ESLint 配置（next/core-web-vitals）
├── .prettierrc             # Prettier 代码格式化配置
├── tailwind.config.js      # Tailwind CSS 自定义主题和扩展
├── postcss.config.js       # PostCSS 配置（Tailwind 处理）
├── tsconfig.json           # TypeScript 配置
├── next.config.js          # Next.js 配置
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

1. 使用同步方法（`getData()`、`addNote()` 等）
   在组件间共享的全局 `window.storage` 实例上可用。
2. 为了与 IndexedDB 配合，所有核心操作也提供了对应的异步版本（`getDataAsync()`、`addNoteAsync()`、`toggleFavoriteAsync()` 等）。
   应用中已经把所有新业务逻辑改为调用这些 `*Async` 方法。
   **请勿混用同步和异步接口**，否则可能产生竞态写入、旧数据覆盖的情况。

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
