# 🏗️ 项目结构与架构

本文档详细说明 QCNOTE 的整体架构设计、项目结构组织和核心模块。

---

## 📁 项目目录结构

```
NOTE/
├── components/              # React 组件
│   ├── NoteEditor.tsx      # 笔记编辑器
│   ├── NoteList.tsx        # 笔记列表
│   ├── KnowledgeGraph.tsx  # 知识图谱
│   └── ...
├── pages/                   # Next.js 页面
│   ├── _app.tsx            # 应用入口
│   ├── index.tsx           # 首页
│   ├── dashboard.tsx       # 仪表板
│   ├── forum.tsx           # 社区论坛
│   ├── forum-create.tsx    # 发布帖子
│   ├── leaderboard.tsx     # 排行榜
│   ├── models.tsx          # Live2D 模型
│   ├── signin.tsx          # 登录
│   ├── contact.tsx         # 联系我们
│   ├── privacy.tsx         # 隐私政策
│   ├── terms.tsx           # 使用条款
│   └── api/                # API 路由
├── lib/                     # 核心业务逻辑
│   ├── storage.ts          # 存储管理（IndexedDB）
│   ├── indexer.ts          # 搜索索引（Lunr）
│   ├── aiService.ts        # AI 集成（OpenAI）
│   ├── noteContext.tsx     # 全局状态（Context）
│   └── ...
├── server/                  # 后端服务（Node.js）
│   ├── index.ts            # 服务器入口
│   ├── aiService.ts        # AI 后端接口
│   ├── queue.ts            # 任务队列
│   └── ...
├── styles/                  # 全局样式
│   └── globals.css         # Tailwind CSS
├── public/                  # 静态资源
│   ├── images/
│   ├── js/
│   └── live2d/             # Live2D 模型
├── test/                    # 测试文件
│   ├── *.test.ts           # 单元测试
│   └── *.spec.ts           # E2E 测试
├── docs/                    # 项目文档
├── docker-compose.yml       # Docker 容器编排
├── Dockerfile             # Docker 镜像定义
└── package.json           # 项目配置
```

---

## 🏛️ 整体架构

### 分层架构

```
┌─────────────────────────────────────┐
│      表现层 (Presentation)          │
│   ┌──────────────────────────────┐  │
│   │  React 组件                  │  │
│   │  - 页面组件                 │  │
│   │  - 功能组件                 │  │
│   └──────────────────────────────┘  │
└─────────────────────────────────────┘
               ↓
┌─────────────────────────────────────┐
│      业务逻辑层 (Business Logic)    │
│   ┌──────────────────────────────┐  │
│   │  核心模块                    │  │
│   │  - 笔记管理                 │  │
│   │  - 搜索引擎                 │  │
│   │  - AI 助手                  │  │
│   │  - 数据同步                 │  │
│   └──────────────────────────────┘  │
└─────────────────────────────────────┘
               ↓
┌─────────────────────────────────────┐
│      数据层 (Data Access)           │
│   ┌──────────────────────────────┐  │
│   │  存储管理                    │  │
│   │  - IndexedDB (本地)         │  │
│   │  - PostgreSQL (远程)        │  │
│   │  - Redis (缓存)             │  │
│   └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

---

## 🔄 前后端分离

### 前端架构 (Next.js)

**职责:**
- UI 渲染和交互
- 本地数据存储（IndexedDB）
- 离线功能
- 搜索索引维护

**关键特性:**
- 静态生成 (SSG) - 首页、文档
- 服务端渲染 (SSR) - 仪表板、个人页面
- API 路由 - 后端通信代理
- 增量静态再生 (ISR) - 内容更新

### 后端架构 (Node.js + Fastify)

**职责:**
- API 提供
- 数据库管理
- AI 任务处理
- 数据同步协调
- WebSocket 实时通信

**关键特性:**
- RESTful API
- WebSocket 实时协作
- 消息队列处理
- 缓存层管理
- 认证授权

---

## 🔗 数据流

### 笔记创建流程

```
用户输入
   ↓
React 组件
   ↓
useNoteEditor() Hook
   ↓
保存到 IndexedDB (离线存储)
   ↓
发送到后端 API
   ↓
PostgreSQL 数据库
   ↓
Redis 缓存更新
   ↓
WebSocket 推送更新给其他客户端
```

### 搜索流程

```
用户输入搜索词
   ↓
前端搜索 (Lunr.js)
   ↓
本地索引匹配
   ↓
展示本地结果
   ↓
可选：发送到后端进行深度搜索
   ↓
合并远程结果
```

### AI 处理流程

```
用户请求 AI 功能
   ↓
前端收集内容
   ↓
发送到后端队列
   ↓
任务处理 (Queue Worker)
   ↓
调用 OpenAI API
   ↓
保存结果到数据库
   ↓
WebSocket 推送结果给客户端
   ↓
前端展示结果
```

---

## 📦 核心模块详解

### 1. 存储管理 (`lib/storage.ts`)

**功能:**
- IndexedDB 数据持久化
- 本地数据同步
- 离线编辑支持
- 冲突检测和解决

**API:**
```typescript
// 保存笔记
await storage.saveNote(note)

// 获取笔记
const note = await storage.getNote(id)

// 查询笔记列表
const notes = await storage.queryNotes(filters)

// 批量操作
await storage.batch(operations)
```

### 2. 搜索引擎 (`lib/indexer.ts`)

**功能:**
- Lunr.js 全文搜索
- 中文分词支持
- 实时索引更新
- 搜索结果排序

**API:**
```typescript
// 创建索引
const index = await indexer.buildIndex(notes)

// 搜索
const results = indexer.search('关键词')

// 更新索引
await indexer.updateIndex(note)
```

### 3. 状态管理 (`lib/noteContext.tsx`)

**功能:**
- React Context 全局状态
- 减少 Props 穿透
- 编辑器状态管理
- 版本历史追踪

**API:**
```typescript
// 使用 Hook
const editor = useNoteEditor()

// 打开编辑器
editor.openEditor(note)

// 保存笔记
await editor.saveNote()

// 查看版本历史
editor.showVersions()
```

### 4. AI 集成 (`lib/aiService.ts`, `server/aiService.ts`)

**功能:**
- OpenAI API 调用
- 配额管理和限流
- 响应缓存
- 错误处理

**API:**
```typescript
// 生成标签
const tags = await aiService.generateTags(content)

// 生成摘要
const summary = await aiService.summarize(content)

// 情感分析
const sentiment = await aiService.analyzeSentiment(content)
```

### 5. 数据同步 (`lib/webdavSyncManager.ts`, `lib/oneDrive.ts`)

**功能:**
- WebDAV / OneDrive 同步
- 冲突解决
- 进度追踪
- 错误重试

**API:**
```typescript
// 初始化同步
const syncer = new WebDAVSyncManager(config)

// 同步数据
await syncer.sync()

// 检查状态
const status = syncer.getStatus()
```

---

## 🗂️ 状态管理策略

### React Context 用途

- **NoteEditorContext** - 编辑器全局状态
- **UIContext** - UI 主题、布局状态（可选）
- **AuthContext** - 认证和用户信息（可选）

### 本地存储

- **IndexedDB** - 笔记数据、索引、附件
- **LocalStorage** - UI 偏好设置、缓存

### 后端状态

- **PostgreSQL** - 持久化用户数据
- **Redis** - 会话、缓存、队列

---

## 🔐 安全设计

### 认证流程

```
浏览器
   ↓
输入凭证
   ↓
发送到 API
   ↓
验证 (JWT)
   ↓
返回 Token
   ↓
存储在 Secure Cookie
   ↓
后续请求自动携带
```

### 数据加密

- **传输**: TLS 1.3
- **存储**: AES-256-GCM
- **端到端**: 用户级加密（可选）

---

## 📊 性能优化

### 前端优化

- **代码分割** - Next.js 自动分割
- **图片优化** - next/image 组件
- **缓存策略** - Service Worker
- **虚拟化** - 长列表虚拟滚动

### 后端优化

- **数据库索引** - PostgreSQL 优化查询
- **缓存层** - Redis 减轻数据库压力
- **异步处理** - 队列处理长任务
- **API 限流** - 防止滥用

---

## 🚀 扩展性

### 水平扩展

- **负载均衡** - Nginx / HAProxy
- **数据库复制** - 主从架构
- **缓存集群** - Redis Cluster
- **消息队列** - 异步任务分布

### 垂直扩展

- **资源增加** - CPU、内存、存储
- **性能优化** - 算法、查询优化
- **并发处理** - 连接池、线程池

---

## 📖 相关文档

- [环境搭建](setup.md) - 开发环境配置
- [系统架构](../ARCHITECTURE.md) - 更详细的架构说明
- [贡献指南](contributing.md) - 开发流程

*最后更新: 2026-04-07*
