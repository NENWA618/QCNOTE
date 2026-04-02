# NOTE - 个人笔记应用

[![build](https://github.com/NENWA618/NOTE/actions/workflows/ci.yml/badge.svg)](https://github.com/NENWA618/NOTE/actions)
[![version](https://img.shields.io/badge/frontend-1.0.0-blue)](https://github.com/NENWA618/NOTE)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

一个简洁而优雅的个人笔记应用，配备完全本地化的 Live2D 看板娘。前端100%本地存储（隐私优先），后端可选部署以启用高级功能。

- 🎨 **Next.js 14** + TypeScript + Tailwind CSS
- 💾 **IndexedDB 本地存储** 零隐私泄露风险
- 🎭 **Live2D 看板娘** 本地模型 + 自定义台词 + 健康提醒
- 🌤️ **本地天气系统** 无API依赖 + 确定性fallback
- 🚀 **可选后端** TypeScript + Fastify + Node.js（推荐部署到 Render）

## ✨ 核心功能

| 功能 | 说明 |
|------|------|
| 📝 笔记管理 | 创建、编辑、删除、收藏、归档 |
| 📋 Markdown 富文本 | 表格、代码块、列表等支持 |
| 🏷️ 分类 + 标签 | 灵活的笔记组织 |
| 🔍 搜索 | 全文搜索 + 向量相似度搜索 |
| 📊 统计 | 笔记数量、标签热力、类别分布 |
| 🎭 看板娘 | 本地Live2D模型，健康提醒、自定义台词 |
| 🌤️ 天气显示 | 本地数据优先 + 确定性算法fallback |
| 📤 导入导出 | JSON 备份和恢复 |

## 🚀 快速开始

### 前置要求

- Node.js 18+
- npm

### 安装并启动

```bash
npm install
npm run dev
```

访问 http://localhost:3000

### 常用命令

```bash
npm run build      # 生产构建（7页编译成功）
npm start          # 启动生产服务器
npm run lint       # ESLint 检查
npm test           # 单元测试
```

## 📁 项目结构

```
NOTE/
├── pages/                   # Next.js 页面
│   ├── _app.tsx            # 应用入口（初始化存储、加载脚本）
│   ├── index.tsx           # 首页
│   ├── dashboard.tsx       # 笔记管理
│   ├── contact.tsx         # 联系页面
│   ├── privacy.tsx         # 隐私政策
│   └── terms.tsx           # 使用条款
├── components/             # React 组件
│   ├── Character.tsx       # 虚拟助手展示
│   ├── Header.tsx          # 导航栏
│   ├── Sidebar.tsx         # 侧边栏
│   ├── Footer.tsx          # 页脚
│   └── MarkdownView.tsx    # Markdown 渲染
├── lib/                    # 业务逻辑与工具
│   ├── idb.ts              # IndexedDB 助手
│   ├── storage.ts          # 存储层（IndexedDB + localStorage）
│   ├── indexer.ts          # 全文搜索与向量索引
│   ├── vector.ts           # 向量计算
│   ├── sentiment.ts        # 情感分析
│   ├── utils.ts            # 工具函数
│   ├── ui.ts               # UI 工具
│   ├── logger.ts           # 日志工具
│   └── types/              # 类型定义
├── public/                 # 静态资源
│   ├── js/
│   │   ├── waifu.js        # Live2D 看板娘脚本
│   │   ├── waifu-tips.js   # 台词配置
│   │   ├── live2d.min.js   # Live2D 运行时
│   │   ├── jquery.min.js   # jQuery
│   │   └── jquery-ui.min.js # jQuery UI
│   ├── data/
│   │   └── local-weather.json # 本地天气数据
│   ├── live2d/koharu/      # Live2D 模型文件
│   ├── service-worker.js   # Service Worker
│   └── images/             # 图片资源
├── server/                 # 后端服务（可选，TypeScript）
│   ├── index.ts            # 主服务器
│   ├── queue.ts            # 任务队列
│   ├── worker.ts           # 后台工作进程
│   ├── sentiment.ts        # 情感分析服务
│   ├── vector.ts           # 向量计算服务
│   └── package.json        # 后端依赖
├── test/                   # 单元测试
│   ├── storage.test.ts
│   ├── vector.test.ts
│   ├── live2d.test.tsx
│   └── ...
├── styles/                 # 样式文件
│   └── globals.css         # Tailwind 配置
├── tailwind.config.js      # Tailwind 主题
├── tsconfig.json           # TypeScript 配置
├── vitest.config.ts        # 测试配置
└── package.json            # 前端依赖
```

## 🎨 技术栈

**前端**

| 部分 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js | 14.2 |
| UI | React | 18 |
| 语言 | TypeScript | 5.2 |
| 样式 | Tailwind CSS | 3.4 |
| 存储 | IndexedDB | 原生 |
| 搜索 | lunr | 2.3 |
| 解析 | react-markdown | 10.1 |
| 测试 | Vitest | 1.4 |

**后端（可选）**

| 部分 | 技术 | 版本 |
|------|------|------|
| 框架 | Fastify | 4.24 |
| 运行时 | Node.js | 18+ |
| 队列 | BullMQ | 5.0 |
| 缓存 | Redis | 5.3 |
| 语言 | TypeScript | 5.2 |

## 🔧 环境变量

**前端（`.env.local`）**

```env
# 可选：后端 API 地址
NEXT_PUBLIC_CHARACTER_SERVER_URL=http://localhost:10000

# 可选：Web Push 公钥
NEXT_PUBLIC_VAPID_PUBLIC=<your-vapid-public-key>
```

**后端**

```env
# Web Push 密钥对
VAPID_PUBLIC=<your-vapid-public-key>
VAPID_PRIVATE=<your-vapid-private-key>

# Redis 连接（可选）
REDIS_URL=redis://<user>:<password>@<host>:<port>

# 监听端口
PORT=10000
```

## 🚀 部署指南

### 前端部署（Vercel）

1. Fork 仓库到 GitHub
2. 在 Vercel 导入项目
3. 配置环境变量（可选）
4. 自动构建部署

### 后端部署（Render）

1. Fork 仓库到 GitHub
2. 在 Render 创建 Web Service
3. 构建命令：`npm install`
4. 启动命令：`npm start`
5. 配置环境变量（见上方）

### 本地开发

```bash
# 前端
npm install
npm run dev        # http://localhost:3000

# 后端（可选）
cd server
npm install
npm start          # http://localhost:10000
```

## 💾 数据结构

笔记对象：

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

## 🎭 Live2D 看板娘

看板娘配置位于 [public/js/waifu.js](public/js/waifu.js)。

**特性**

- 🎨 支持本地 Live2D 模型（默认 koharu）
- 💬 可自定义台词、问候、提醒语
- ⏰ 健康提醒：喝水、休息、坐姿、睡眠
- 🎮 交互功能：拖拽、点击、显示/隐藏
- 💾 配置保存在 `localStorage`，无需后端

**授权**

- 脚本：GPL-2.0（来自 [fghrsh/live2d_demo](https://github.com/fghrsh/live2d_demo)）
- 模型：遵循对应 Live2D 模型的许可证

## 🌤️ 本地天气系统

天气数据存储在 [public/data/local-weather.json](public/data/local-weather.json)。

**架构**

```json
{
  "default": {
    "weather": "晴",
    "temperature": "25°C",
    "description": "万里无云"
  },
  "广东": {
    "广州": {
      "2026-04-02": {
        "weather": "多云",
        "temperature": "28°C",
        "description": "局部多云"
      },
      "default": {
        "weather": "晴",
        "temperature": "26°C",
        "description": "阳光明媚"
      }
    },
    "default": {
      "weather": "晴",
      "temperature": "25°C",
      "description": "广东天气"
    }
  }
}
```

**fallback机制**

当本地数据不可用时，使用确定性哈希算法基于城市+日期生成天气：

```javascript
function fallbackWeather(city, date) {
  const hash = hashCode(city + date);
  const weathers = ['晴', '多云', '阴', '小雨', '中雨'];
  const temps = ['20°C', '22°C', '25°C', '28°C', '30°C'];
  return {
    weather: weathers[Math.abs(hash) % weathers.length],
    temperature: temps[Math.abs(hash) % temps.length],
    description: '本地算法生成'
  };
}
```

## 🛠️ 开发指南

### 添加新笔记功能

编辑 `components/` 中的组件，使用 `await storage.getDataAsync()` 获取数据。

### 扩展搜索功能

参考 `lib/indexer.ts`，支持全文搜索和向量搜索。

### 自定义样式

在 `tailwind.config.js` 定义颜色和组件，在 `styles/globals.css` 使用 `@layer components`。

## 📦 贡献

欢迎 Fork、Issue 和 Pull Request。

## 📄 许可证

MIT License - 自由使用、修改、分发

## 👨‍💻 开发者

NOTE 由热爱笔记的开发者创建。

---

**更新日期**：2026 年 4 月  
**版本**：1.0.0  
**构建状态**：✅ 7页编译成功

享受记录的过程，让思考变成力量。✨
