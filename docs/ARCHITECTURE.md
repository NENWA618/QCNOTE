# QCNOTE 架构设计文档

## 1. 系统概览

QCNOTE 是一个以**隐私优先、离线优先**为核心的个人知识管理平台。系统设计聚焦于在浏览器中提供完整笔记编辑、搜索、关联和同步功能，同时将敏感数据保持在用户设备本地。

核心原则：

- **本地优先**：笔记数据默认存储在浏览器本地，业务逻辑可在无网络环境下完整运行。
- **隐私优先**：默认不上传用户笔记；仅在用户授权后开启可选云同步。
- **模块化与渐进增强**：前端组件和运行时分层设计，可在不同环境中平滑降级。
- **可扩展性**：同步、社区与后端服务作为可选扩展，不影响核心离线体验。

## 2. 总体架构

QCNOTE 的架构可分为四个主要层级：

1. 用户界面层（UI）
2. 业务逻辑层（lib/）
3. 运行时与存储层（qcruntime/ + browser storage）
4. 可选后端服务层（server/）

### 2.1 用户界面层（UI）

- `pages/`：Next.js 页面入口，例如 `index.tsx`、`dashboard.tsx`、`forum.tsx`、`privacy.tsx`、`terms.tsx`。
- `components/`：共享组件库，包括 `NoteEditor`、`NoteList`、`KnowledgeGraph`、`WebDAVSync`、`OneDriveSync`、`Footer` 等。
- `Layout.tsx`：统一页面布局，负责 Header 与 Footer 渲染。

### 2.2 业务逻辑层（lib/）

- `storage.ts`：本地存储适配层，负责 IndexedDB/localStorage 读写、加密解密、命名空间隔离、配置与数据迁移。
- `utils.ts`：搜索解析、全文检索、语义向量搜索、时间格式化等工具函数。
- `vector.ts` / `basicVector.ts`：基于词频向量的相似度计算，提供语义匹配能力。
- `sentiment.ts`：情感分析能力，用于笔记情绪检测与展示。
- `webdavSyncManager.ts`：WebDAV 同步管理、冲突检测与处理。
- `api-client*.ts` 及 `server/`：可选后端交互与论坛服务实现。

### 2.3 运行时与存储层

- `qcruntime/`：QCNOTE 自定义浏览器运行时，封装了 IndexedDB 数据库、Worker 沙箱、字段级 AES-GCM 加密、元数据管理。
- `lib/idb.ts`：IndexedDB 通用助手。
- 浏览器存储：主要使用 IndexedDB；在特殊场景下回退到 localStorage。

### 2.4 可选后端层

- `server/`：Fastify 服务与附加后端逻辑。
- PostgreSQL / Redis：论坛、用户、缓存数据的可选后端存储。
- `NextAuth`：OAuth 登录与 OneDrive 集成。

## 3. 运行时架构（QCRuntime）

`qcruntime/` 是 QCNOTE 核心运行时引擎，用于安全地管理浏览器端数据库和敏感字段：

- 通过 `QCRuntime.open(name, schemas, version, secret)` 打开数据库。
- 读取与写入操作委托给 `QCDb`，并通过 Worker 或内联进程执行。
- 支持 `put/getById/get/find/count/deleteById/delete/clear/purgeExpired/close` 方法。
- 利用 `QCStoreSchema` 定义数据库结构，支持字段类型、是否索引、是否加密、TTL 等。

### 3.1 Worker 沙箱

- `qcnote-runtime.ts` 负责创建 Worker，并实现 RPC 调用协议。
- 若浏览器不支持 Web Worker，运行时会降级为内联进程实现。
- Worker 处理数据库打开、元数据读写、加密密钥管理和 CRUD 请求。

### 3.2 字段级加密

- 采用 AES-GCM 进行敏感字段加密。
- 若用户提供了 secret，会通过 PBKDF2 派生 AES-GCM 256 位密钥。
- 如果未显式提供 secret，运行时仍可在本地管理一个持久化加密密钥，以便同一设备上保持该用户数据库的可读写状态。
- 仅对 schema 中 `secret: true` 的字段执行加密，非 secret 字段保持可索引和明文存储。
- 加密值存储为 `base64(iv) + '.' + base64(ciphertext)` 格式。

### 3.3 持久化元数据

- 运行时在一个单独的元数据库 `__qcnote_meta__` 中保存盐值与 worker-keystore。
- 该元数据库不会与业务数据混合，用于加密密钥持久化与历史盐值迁移。
- 兼容旧版 `localStorage` 中的盐值，并自动迁移到元数据库。

### 3.4 访问与查询

- `QCDb.find()` 支持复杂条件查询，如 `where`、`sort` 与 `limit`。
- Worker 内部使用 `evalWhere` 处理逻辑比较、字符串包含、范围查询、数组包含等条件。
- 通过 `QCDb.purgeExpired()` 清理 TTL 到期记录。

## 4. 数据存储架构

### 4.1 本地数据组织

QCNOTE 以用户或访客为命名空间隔离存储：

- 访客数据使用 `*_GUEST` 数据库名称。
- 登录用户数据使用 `*_USER_<userId>` 命名空间。
- 同一账号不同用途的数据通过不同对象存储(`ObjectStore`)组织。

### 4.2 数据加密策略

- 仅对标记为 `secret` 的字段执行 AES-GCM 加密。
- 登录用户的数据按命名空间隔离存储，不同账号不会共用同一存储空间。
- 如果用户启用加密或手动提供加密密钥，系统会在本地派生或管理 AES-GCM 密钥。
- 未启用加密时，数据仍可以以明文形式在浏览器本地保存。

### 4.3 回退与兼容

- `lib/storage.ts` 实现了在 IndexedDB 不可用时回退到 `localStorage`。
- 这一回退路径可能导致数据以明文形式保存，因此推荐在支持 IndexedDB 的环境中使用 QCNOTE。
- 对旧版存储格式和旧加密盐值进行兼容，防止升级后数据丢失。

## 5. 搜索与语义

### 5.1 全文搜索

- 使用 `lunr.js` 构建本地索引。
- 索引字段包括：`title`、`content`、`tags`、`category`。
- 搜索支持字段限定、布尔运算和通配词。

### 5.2 向量语义搜索

- 基于 `vector.ts` 中的 bag-of-words 向量化实现。
- 对输入查询与每条笔记计算余弦相似度。
- 将语义得分与 Lunr 搜索结果合并，补充传统全文检索不足。

### 5.3 搜索解析

- `utils.parseSearchQuery()` 支持 `title:xxx`、`content:xxx`、`tag:xxx` 等字段过滤。
- 还支持 `AND/OR/NOT` 组合逻辑与日期范围查询。

## 6. 同步与冲突

### 6.1 WebDAV 同步

- `webdavSyncManager.ts` 封装 WebDAV 的上传/下载逻辑。
- 支持手动推送、拉取和自动定时同步。
- 同步配置保存在本地，并支持可选加密密钥。

### 6.2 OneDrive 同步

- OneDrive 同步由 `OneDriveSync.tsx` 与后端 `@microsoft/microsoft-graph-client` 配合实现。
- 必须通过 OAuth 登录获取访问令牌。
- 用户可选择是否启用同步加密。

### 6.3 冲突处理

- 同步过程中会检测数据差异与版本冲突。
- `webdavSyncManager` 提供冲突解决策略与日志记录。

## 7. 页面与功能模块

### 7.1 主要页面

- `index.tsx`：首页介绍、核心功能卡片、快速上手。
- `dashboard.tsx`：笔记仪表盘，显示笔记列表、统计与视图切换。
- `forum.tsx`：社区论坛入口，支持帖子浏览和讨论。
- `privacy.tsx` / `terms.tsx`：法律与隐私说明页面。
- `contact.tsx`：联系与支持页面。

### 7.2 关键组件

- `NoteEditor.tsx`：Markdown 编辑、KaTeX 渲染、情感分析和自动保存。
- `KnowledgeGraph.tsx`：知识网络可视化组件。
- `NoteList.tsx`：动态笔记列表及标签过滤。
- `WebDAVSync.tsx` / `OneDriveSync.tsx`：同步设置与控制面板。

## 8. 可选后端架构

### 8.1 论坛与用户服务

- `server/forum-service.ts`：论坛帖子与评论逻辑。
- `server/check-admin.ts`：管理员权限检查。
- `server/` 目录下还包含推荐、认证和数据访问模块。

### 8.2 数据库与缓存

- PostgreSQL 用于存储论坛帖子、用户账号和排行榜数据。
- Redis 用于会话、缓存和临时状态管理。

### 8.3 认证与外部集成

- `next-auth` 负责 OAuth 登录、会话管理。
- OneDrive 集成借助 Microsoft Graph 客户端。

## 9. 版本与依赖

- Next.js 16.2.12
- React 18.3.1
- TypeScript 5.2.0
- Tailwind CSS 3.4.1
- Lunr.js 2.3.9
- KaTeX 0.18.1
- Fastify 4.24.0
- PostgreSQL / Redis（可选）

## 10. 设计总结

QCNOTE 的核心价值在于：

- 让笔记数据始终“先留在本地”，不依赖网络即可使用；
- 通过运行时加密和独立 Worker，增强浏览器内存与存储安全；
- 以模块化方式支持云同步、论坛、用户系统等扩展；
- 保持前端页面与文档一致，确保用户体验与实现逻辑同步。

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
notes.forEach((note) => {
  lunr_index.add({
    id: note.id,
    title: note.title,
    content: note.content,
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
  return words.map((w) => wordCounts[w] / totalWords);
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
  constructor(
    private storage: Storage,
    private indexer: Indexer,
  ) {}

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
      - '3000:3000'
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
