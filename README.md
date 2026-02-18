# NOTE - 个人笔记应用

一个简洁而优雅的个人笔记应用。完全本地存储，100% 隐私保护。现已迁移至 **Next.js 14 + TypeScript + Tailwind CSS**。

## 🎯 项目状态

### ✅ 已完成迁移

- **框架**：HTML → **Next.js 14**（React 18）
- **语言**：JS → **TypeScript** 5.2（核心模块与 React 组件）
- **样式**：内联 CSS → **Tailwind CSS 3.4.1**（实用优先 CSS 框架）
- **页面**：`pages/` 下的三个主要页面（`index.tsx`、`dashboard.tsx`、`contact.tsx`）
- **组件化**：`Header`、`Sidebar`、`Footer` React 组件
- **存储层**：`NoteStorage` 类与 React hooks 集成
- **工具链**：ESLint + Prettier 代码检查与格式化
- **工作流**：GitHub Actions CI/CD（类型检查、构建验证）

## 🚀 快速开始

### 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器（默认 http://localhost:3000，如被占用自动选择下一个可用端口）
npm run dev

# 3. 在浏览器打开（替换 3000 为实际端口）
# http://localhost:3000 — 首页
# http://localhost:3000/dashboard — 笔记管理
# http://localhost:3000/contact — 联系和支持
```

### 生产构建

```bash
npm run build    # 构建生产版本
npm start        # 启动生产服务器
```

### 代码检查与格式化

```bash
npm run lint     # 运行 ESLint 代码检查
npm run format   # 运行 Prettier 自动格式化
npx tsc --noEmit # TypeScript 类型检查
```

### 快捷键

- `Ctrl+K` - 搜索笔记

## 📁 项目结构

```
NOTE/
├── pages/                   # Next.js 页面 (TSX)
│   ├── _app.tsx            # 应用入口（导入 Tailwind globals）
│   ├── index.tsx           # 首页
│   ├── dashboard.tsx       # 笔记管理页面
│   └── contact.tsx         # 联系页面
├── components/             # React 可复用组件 (TSX)
│   ├── Header.tsx          # 导航栏
│   ├── Sidebar.tsx         # 侧边栏（分类、排序、统计）
│   └── Footer.tsx          # 页脚
├── lib/                    # 业务逻辑与工具 (TS)
│   ├── storage.ts          # 存储层（localStorage 管理）
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

### 自定义主题配置

在 `tailwind.config.js` 中定义的设计令牌：

**颜色调色板**

- `primary-light`: #f6e0e7（浅粉紫）
- `primary-medium`: #d8cbcf（中粉紫）
- `primary-dark`: #c8b8c8（深粉紫）
- `accent-pink`: #dc96b4（强调粉色）
- `accent-purple`: #b0a8c0（强调紫色）
- `text-light`: #7a7a7a（浅灰文字）

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
- 🏷️ 按分类和标签组织
- 🔍 强大的搜索功能
- ❤️ 收藏重要笔记
- 📊 笔记统计与可视化
- 💾 完全本地存储（隐私优先）

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

### 响应式设计

使用 Tailwind 的断点前缀：

- `md:` — 平板（768px 及以上）
- `lg:` — 桌面（1024px 及以上）

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">响应式网格</div>
```

## 许可证

MIT License - 可自由使用、修改和分发

## 👨‍💻 开发者

NOTE 由热爱笔记的开发者创建于 2026 年。

---

**更新日期**：2026 年 2 月 18 日  
**版本**：2.0.0（Next.js + TypeScript + Tailwind CSS 完全迁移）

享受记录的过程，让思考变成力量。✨
