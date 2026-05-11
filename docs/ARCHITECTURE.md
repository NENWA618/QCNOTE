# 架构设计文档

## 系统概览

QCNOTE 是一个以**隐私优先、离线优先**为核心的现代个人笔记应用。系统采用分层架构，分为客户端层、业务逻辑层、数据层和后端服务层。

### 核心设计原则

- **🔒 隐私优先**: 所有个人数据默认存储在本地，不上传到服务器
- **🚀 离线优先**: 完整功能支持离线使用，网络连接是可选的
- **📈 渐进增强**: 核心功能在浏览器中完整工作，后端服务为可选扩展
- **🧩 模块化设计**: 清晰的关注点分离和可复用组件
- **⚡ 性能优先**: 优化加载速度和交互响应

## 技术栈详解

### 前端技术栈

#### 核心框架
| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 15.0 | React 服务框架，App Router |
| React | 18.0 | UI 组件库，并发特性 |
| TypeScript | 5.0 | 类型安全和开发体验 |
| Tailwind CSS | 3.4 | 响应式 UI 设计系统 |

#### 数据处理和搜索
| 技术 | 版本 | 用途 |
|------|------|------|
| Lunr.js | 2.3.9 | 全文搜索引擎（500KB 库） |
| IndexedDB | - | 客户端本地数据库 |
| React Context | - | 状态管理 |
| axios | 1.6.5 | HTTP 请求库 |

#### 内容渲染
| 技术 | 版本 | 用途 |
|------|------|------|
| react-markdown | - | Markdown 渲染 |
| remark-gfm | - | GitHub 风格 Markdown |
| remark-math | - | 数学公式支持 |
| rehype-katex | 7.0.1 | KaTeX 数学渲染 |
| rehype-sanitize | - | HTML 内容安全防护 |

#### 交互增强
| 技术 | 版本 | 用途 |
|------|------|------|
| @dnd-kit | - | 拖拽排序功能 |
| react-window | - | 虚拟滚动优化 |
| react-diff-viewer-continued | - | 版本对比 |

#### 3D 和图形
| 技术 | 版本 | 用途 |
|------|------|------|
| Pixi.js | 6.5.10 | 2D WebGL 渲染引擎 |
| pixi-live2d-display | - | Live2D 虚拟角色 |

### 后端技术栈（可选）

#### 核心框架
| 技术 | 版本 | 用途 |
|------|------|------|
| Fastify | 5.8.4 | 高性能 HTTP 服务器 |
| Node.js | 18+ | JavaScript 运行时 |
| TypeScript | 5.0 | 服务端类型安全 |

#### 数据存储
| 技术 | 版本 | 用途 |
|------|------|------|
| PostgreSQL | 14+ | 关系数据库（论坛、用户数据） |
| pg | 8.20.0 | PostgreSQL 驱动 |
| Redis | 7.0 | 缓存和会话存储 |
| ioredis | 5.10.1 | Redis 客户端库 |

#### 认证
| 技术 | 版本 | 用途 |
|------|------|------|
| NextAuth | 4.24.7 | OAuth 认证框架 |
| @microsoft/microsoft-graph-client | - | OneDrive 集成 |

### 开发工具

| 工具 | 版本 | 用途 |
|------|------|------|
| Vitest | 4.1.4 | 单元测试框架 |
| Playwright | 1.59.1 | E2E 自动化测试 |
| ESLint | 8.0.0 | 代码检查 |
| Prettier | 2.8.0 | 代码格式化 |
| Docker | - | 容器化部署 |

## 应用层次结构

```
┌─────────────────────────────────────────────────────────┐
│                   用户界面层 (UI)                       │
│  ├─ 页面组件 (pages/)                                  │
│  │  ├─ dashboard - 仪表盘                              │
│  │  ├─ forum - 论坛                                    │
│  │  ├─ models - 模型市场                               │
│  │  └─ ...                                             │
│  │                                                     │
│  └─ 组件库 (components/)                               │
│     ├─ 笔记组件 (7): NoteEditor, NoteList, etc.      │
│     ├─ 视图组件 (5): Calendar, Timeline, Graph, etc. │
│     ├─ 社区组件 (5): Forum, Leaderboard, etc.        │
│     ├─ 同步组件 (4): WebDAVSync, OneDrive, etc.      │
│     └─ 工具组件 (10): Modal, ErrorBoundary, etc.     │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                  业务逻辑层 (lib/)                      │
│  ├─ 数据管理                                            │
│  │  ├─ storage.ts - 核心数据持久化                     │
│  │  ├─ idb.ts - IndexedDB 操作                         │
│  │  └─ cache-manager.ts - 缓存策略                     │
│  │                                                     │
│  ├─ 搜索功能                                            │
│  │  ├─ indexer.ts - 索引构建                           │
│  │  ├─ vector.ts - 向量搜索                            │
│  │  └─ sentiment.ts - 情感分析                         │
│  │                                                     │
│  ├─ 同步协调                                            │
│  │  ├─ webdavSyncManager.ts - WebDAV 同步             │
│  │  └─ csrfProtection.ts - CSRF 防护                  │
│  │                                                     │
│  └─ 工具函数                                            │
│     ├─ utils.ts - 通用工具                             │
│     ├─ ui.ts - UI 工具                                 │
│     ├─ logger.ts - 日志管理                            │
│     └─ secureLogger.ts - 安全日志                      │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                    数据层 (Storage)                     │
│  ├─ 客户端存储                                          │
│  │  ├─ IndexedDB - 本地笔记、索引、配置                │
│  │  └─ localStorage - 小数据和用户偏好                 │
│  │                                                     │
│  └─ 可选后端存储                                        │
│     ├─ PostgreSQL - 论坛、用户、社区数据               │
│     └─ Redis - 缓存层                                  │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│               后端服务层 (server/) - 可选               │
│  ├─ forum-service.ts - 论坛业务逻辑                    │
│  ├─ recommendation-service.ts - 推荐引擎               │
│  ├─ ugc-service.ts - 用户内容管理                      │
│  ├─ postgres-client.ts - 数据库连接                    │
│  └─ redis-client.ts - 缓存连接                         │
└─────────────────────────────────────────────────────────┘
```

## 数据存储架构

### IndexedDB 存储结构

```
QCNOTE (ObjectStore)
├── QCNOTE_STORAGE
│   ├── key: "NOTES"
│   └── value: NoteItem[] - 所有笔记
│
├── QCNOTE_SETTINGS
│   ├── key: "settings"
│   └── value: UserSettings - 用户设置
│
├── QCNOTE_LUNR_INDEX
│   ├── key: "lunr_index"
│   └── value: Lunr Index JSON - 搜索索引
│
├── QCNOTE_VECTORS
│   ├── key: "vectors"
│   └── value: Map<noteId, vector[]> - 语义向量
│
├── QCNOTE_SENTIMENTS
│   ├── key: "sentiments"
│   └── value: Map<noteId, sentiment> - 情感分析缓存
│
├── QCNOTE_WEBDAV_CONFIG
│   ├── key: "webdav_config"
│   └── value: WebDAVConfig - 同步配置
│
└── QCNOTE_CONFLICTS
    ├── key: "conflicts"
    └── value: SyncConflict[] - 待解决的冲突
```

### PostgreSQL 数据模型

```sql
-- 用户表
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE,
  username VARCHAR UNIQUE,
  image VARCHAR,
  bio TEXT,
  followers INTEGER,
  following INTEGER,
  credit BIGINT,
  created_at TIMESTAMP
);

-- 用户角色
CREATE TABLE user_roles (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users,
  role VARCHAR (user/moderator/admin)
);

-- 论坛帖子
CREATE TABLE forum_posts (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users,
  title VARCHAR,
  content TEXT,
  category VARCHAR,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- 帖子评论
CREATE TABLE forum_replies (
  id UUID PRIMARY KEY,
  post_id UUID REFERENCES forum_posts,
  user_id UUID REFERENCES users,
  content TEXT,
  created_at TIMESTAMP
);

-- 用户成就
CREATE TABLE achievements (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users,
  achievement_type VARCHAR,
  unlocked_at TIMESTAMP
);
```

### Redis 缓存键结构

```
用户数据:
  user:{userId}:profile - 用户资料
  user:{userId}:credit - 用户积分
  user_role:{userId} - 用户角色

论坛数据:
  forum:posts:{postId} - 帖子缓存
  forum:posts:list - 帖子列表
  forum:categories - 分类缓存

会话数据:
  sessions:{sessionId} - 认证会话

实时数据:
  online:users - 在线用户集合
  leaderboard:{period} - 排行榜缓存
```

## 数据流程

### 笔记编辑流程

```
用户输入
  ↓
React Component State
  ↓
IndexedDB Save (storage.ts)
  ↓
Lunr Index Update (indexer.ts)
  ↓
Vector Update (vector.ts)
  ↓
本地存储完成 ✓
  ↓
(可选) WebDAV/OneDrive 同步
  ↓
冲突检测和解决
  ↓
远程同步完成 ✓
```

### 搜索流程

```
用户输入查询
  ↓
1. 全文搜索 (Lunr.js)
2. 语义搜索 (向量相似度)
3. 合并和排序结果
  ↓
返回结果列表
  ↓
知识图谱可视化 (可选)
```

### 知识图谱构建

```
笔记集合
  ↓
提取双链 ([[title]] 格式)
  ↓
构建图结构:
  ├─ 节点: 每个笔记
  └─ 边: 引用关系
     ├─ Forward Links (主动引用)
     └─ Backlinks (反向引用)
  ↓
LOD (细节级别) 优化:
  ├─ 高细节: 显示所有节点
  ├─ 中细节: 显示重要节点(70%)
  └─ 低细节: 显示关键节点(30%)
  ↓
力导向算法模拟
  ├─ 吸引力 (边长度)
  ├─ 斥力 (节点相互排斥)
  └─ 边界约束
  ↓
渲染到 Canvas
```

## 功能模块详解

### 1. 笔记编辑器 (NoteEditor)

**功能**:
- Markdown 编辑和实时预览
- LaTeX 数学公式渲染（KaTeX）
- 双链创建和管理
- 版本历史记录
- 块级编辑支持

**数据流**:
```
编辑器输入 → useState → 保存到 IndexedDB → 更新搜索索引 → UI 更新
```

### 2. 全文搜索 (indexer.ts)

**算法流程**:
```typescript
// 1. 索引构建
notes.forEach(note => {
  lunr_index.add({
    id: note.id,
    title: note.title,
    content: note.content
  });
});

// 2. 索引缓存 (hash 追踪)
const hash = generateHash(notes);
if (cached_hash === hash) {
  use_cached_index;
} else {
  rebuild_index;
}

// 3. 搜索查询
const results = lunr_index.search(query);
```

### 3. 语义搜索 (vector.ts)

**向量计算**:
```typescript
// 1. 文本向量化（词频统计）
function vectorize(text: string): number[] {
  const words = tokenize(text);
  const wordCounts = countWords(words);
  return words.map(w => wordCounts[w] / totalWords);
}

// 2. 相似度计算 (余弦相似度)
function cosineSimilarity(v1: number[], v2: number[]): number {
  const dotProduct = v1.reduce((acc, val, i) => acc + val * v2[i], 0);
  const magnitude1 = Math.sqrt(v1.reduce((acc, val) => acc + val * val, 0));
  const magnitude2 = Math.sqrt(v2.reduce((acc, val) => acc + val * val, 0));
  return dotProduct / (magnitude1 * magnitude2);
}
```

### 4. 同步管理 (webdavSyncManager.ts)

**同步流程**:
```
检测本地变化
  ↓
获取远程版本
  ↓
对比检查 (冲突?)
  ├─ 无冲突: 合并更新
  └─ 有冲突: 用户选择解决
  ↓
上传更改到 WebDAV/OneDrive
  ↓
更新本地同步标记
```

## 性能优化

### 前端优化

1. **代码分割**: Next.js 自动路由级代码分割
2. **懒加载**: 组件按需加载（React.lazy）
3. **虚拟滚动**: 大列表使用 react-window
4. **缓存策略**:
   - IndexedDB 缓存搜索索引
   - 向量缓存避免重复计算
   - HTTP 缓存静态资源

5. **渲染优化**:
   - 使用 useCallback 避免重新创建函数
   - useMemo 缓存计算结果
   - 知识图谱 LOD 系统降低节点数

### 后端优化

1. **数据库**:
   - PostgreSQL 连接池
   - Redis 多层缓存
   - 查询结果缓存

2. **API 优化**:
   - 分页返回大数据集
   - 只返回必要字段
   - 压缩响应体

## 安全考虑

### 客户端安全

- **XSS 防护**: rehype-sanitize 清理 HTML
- **CSRF 防护**: Token 验证
- **内容验证**: Zod schema 校验
- **日志**: secureLogger 不记录敏感信息

### 服务端安全

- **认证**: OAuth 2.0 (NextAuth)
- **授权**: 基于角色的访问控制
- **数据加密**: HTTPS 传输，可选加密存储
- **审计**: 操作日志记录

## 扩展性考虑

### 模块化架构

所有功能独立封装，易于扩展：

```typescript
// 添加新功能示例
export class NewFeature {
  constructor(private storage: Storage, private indexer: Indexer) {}
  
  async execute() {
    // 业务逻辑
  }
}
```

### 插件系统

可扩展的架构允许：
- 自定义 Markdown 插件
- 新的搜索算法
- 额外的同步源
- 自定义主题

## 部署架构

```
┌─────────────────────┐
│   GitHub Repository │
└──────────┬──────────┘
           │ git push
           ↓
┌─────────────────────┐
│   Vercel (CDN)      │
│  - Build & Deploy   │
│  - Edge Functions   │
│  - Analytics        │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│   Origin Server     │
│  - Fastify API      │
│  - PostgreSQL DB    │
│  - Redis Cache      │
└─────────────────────┘
```

### Docker 部署

```yaml
version: '3.8'
services:
  web:
    build: .
    ports:
      - "3000:3000"
  db:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: password
  redis:
    image: redis:7
```

## 监控和调试

### 性能监控

- 页面加载时间
- 搜索响应时间
- 数据库查询时间
- 缓存命中率

### 错误追踪

- Sentry 集成
- 本地日志管理
- 错误边界捕获

## 未来改进

- [ ] PWA 离线支持增强
- [ ] GraphQL API
- [ ] 端到端加密
- [ ] 协作编辑
- [ ] AI 智能助手集成
- [ ] 移动应用原生版本