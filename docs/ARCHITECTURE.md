# QCNOTE 架构设计文档

## 1. 系统概览

QCNOTE 是一个以**隐私优先、离线优先**为核心的个人知识管理平台。系统设计聚焦于在浏览器中提供完整的笔记编辑、搜索、关联和同步功能，同时将敏感数据保持在用户设备本地。

核心原则：

- **本地优先**：笔记数据默认存储在浏览器本地，业务逻辑可在无网络环境下完整运行。
- **隐私优先**：默认不上传用户笔记；仅在用户授权后开启可选云同步。
- **模块化与渐进增强**：前端组件和运行时分层设计，可在不同环境中平滑降级。
- **可扩展性**：同步、社区与后端服务作为可选扩展，不影响核心离线体验。

## 2. 总体架构

QCNOTE 的架构分为四个主要层级：

1. 用户界面层（UI）
2. 业务逻辑层（`lib/`）
3. 运行时与存储层（`qcruntime/` + browser storage）
4. 可选后端服务层（`server/`）

### 2.1 用户界面层（UI）

- `pages/`：Next.js 页面入口，例如 `index.tsx`、`dashboard.tsx`、`privacy.tsx`、`terms.tsx`。
- `components/`：共享组件库，包括 `NoteEditor`、`NoteList`、`KnowledgeGraph`、`WebDAVSync`、`OneDriveSync`、`Footer` 等。
- `Layout.tsx`：统一页面布局，负责 Header 与 Footer 渲染。

### 2.2 业务逻辑层（`lib/`）

- `storage.ts`：本地存储适配层，负责 IndexedDB/localStorage 读写、加密解密、命名空间隔离、配置与数据迁移。
- `utils.ts`：搜索解析、全文检索、语义向量搜索、时间格式化等工具函数。
- `embeddings.ts` / `embeddings.worker.ts`：语义搜索。Worker 中通过 `@huggingface/transformers` 运行 `paraphrase-multilingual-MiniLM-L12-v2`，主线程懒加载 Worker，只有用户开启语义搜索才会下载模型。
- `vector.ts`：基于词频的 bag-of-words 向量与余弦相似度，作为全文搜索的轻量补充。`basicVector.ts` 是同类实现，但未被业务代码引入，仅在 `test/basicVector.test.ts` 中使用。
- `aiClient.ts` / `aiSettings.ts`：外部 AI 服务（OpenAI 兼容接口）调用与本地加密配置，请求由浏览器直接发出。
- `sentiment.ts`：情感分析能力，用于笔记情绪检测与展示。
- `webdavSyncManager.ts`：WebDAV 同步管理、冲突检测与处理。
- `api-client.ts` / `backend-proxy.ts` / `csrfProtection.ts`：前端访问后端的封装、代理与 CSRF 校验。
- `pushNotification.ts`：Web Push 订阅管理（配合 `public/service-worker.js`）。
- `clipImport.ts`：解析并校验浏览器扩展通过 URL hash 传来的网页剪藏（zod 校验、大小限制，数据视为不可信）。

### 2.3 运行时与存储层

- `qcruntime/`：QCNOTE 自定义浏览器运行时，封装了 IndexedDB 数据库、Worker 沙箱、字段级 AES-GCM 加密、元数据管理。
- `lib/idb.ts`：IndexedDB 通用助手。
- 浏览器存储：主要使用 IndexedDB；在特殊场景下回退到 localStorage。

### 2.4 可选后端层

- `server/`：独立的 Fastify 服务（有自己的 `package.json`），Next.js 的 `pages/api/*` 通过 `BACKEND_URL` 代理调用它。
- PostgreSQL / Redis：用户资料、推送订阅、金库密钥、排行榜与缓存数据的后端存储。
- `NextAuth`：Google / GitHub / Discord OAuth 登录与 OneDrive 集成。
- `extensions/`：Chrome / Firefox 网页剪藏扩展。扩展把剪藏编码进 `/dashboard#qcnote-clip=...`（URL hash 不发往服务器），仪表盘用 `lib/clipImport.ts` 校验并弹出 `ClipImportDialog`，用户确认后才写入本地存储。

## 3. 运行时架构（QCRuntime）

`qcruntime/` 是 QCNOTE 核心运行时引擎，用于安全地管理浏览器端数据库和敏感字段：

- 通过 `QCRuntime.open(name, schemas, version = 1, secret?, sessionToken?, kekBytes?)` 打开数据库；后两个可选参数用于登录用户的金库密钥（KEK）流程，见 8.1.1 节。
- 读取与写入操作委托给 `QCDb`，通过 Worker 或内联进程执行。
- 支持 `put/getById/get/find/count/deleteById/delete/clear/purgeExpired/close` 方法。
- 利用 `QCStoreSchema` 定义数据库结构，支持字段类型、是否索引、是否加密、TTL 等。

详细 API 与实现说明见 [qcruntime/README.md](../qcruntime/README.md)。

### 3.1 Worker 沙箱

- `qcnote-runtime.ts` 负责创建 Worker，并实现 RPC 调用协议。
- 若浏览器不支持 Web Worker，运行时会降级为内联进程实现。
- Worker 处理数据库打开、元数据读写、加密密钥管理和 CRUD 请求。

### 3.2 字段级加密

- 采用 AES-GCM 进行敏感字段加密。
- 若用户提供了 secret，会通过 PBKDF2（SHA-256，250,000 次迭代）派生 AES-GCM 256 位密钥。
- 如果未显式提供 secret，运行时仍可在本地管理一个持久化加密密钥，以便同一设备上保持该用户数据库的可读写状态。
- 仅对 schema 中 `secret: true` 的字段执行加密，非 secret 字段保持可索引和明文存储。
- 加密值存储为 `base64(iv) + '.' + base64(ciphertext)` 格式。

### 3.3 持久化元数据

- 运行时在一个单独的元数据库 `__qcnote_meta__` 中保存盐值与 worker-keystore。
- 该元数据库不会与业务数据混合，用于加密密钥持久化与历史盐值迁移。
- 兼容旧版 `localStorage` 中的盐值，并自动迁移到元数据库。

### 3.4 访问与查询

- `QCDb.find()` 支持复杂条件查询，如 `where`、`sort` 与 `limit`。
- Worker 内部使用 `evalWhere()` 处理逻辑比较、字符串包含、范围查询、数组包含等条件，支持 `=`、`!=`、`<`、`<=`、`>`、`>=`、`~=`、`between`、`in`。
- 通过 `QCDb.purgeExpired()` 清理 TTL 到期记录。

## 4. 数据存储架构

### 4.1 本地数据组织

QCNOTE 以用户或访客为命名空间隔离存储：

- `lib/storage.ts` 中 localStorage 命名空间键（设置、WebDAV 配置等）：访客不带后缀，登录用户使用 `*_USER_<userId>` 后缀（`getNamespacedKey`）。
- 笔记 IndexedDB 数据库名（`getNotesDbName`）：访客固定为 `*_NOTES_DB_GUEST`，登录用户为 `*_NOTES_DB_<userId>`（不含字面量 `_USER_`）。
- 同一账号不同用途的数据通过不同对象存储（`ObjectStore`）组织。

### 4.2 数据加密策略

- 仅对标记为 `secret` 的字段执行 AES-GCM 加密。
- 登录用户的数据按命名空间隔离存储，不同账号不会共用同一存储空间。
- 如果用户启用加密或手动提供加密密钥，系统会在本地派生或管理 AES-GCM 密钥。
- 未启用加密时，数据仍以明文形式在浏览器本地保存。

### 4.3 回退与兼容

- `lib/storage.ts` 实现了在 IndexedDB 不可用时回退到 `localStorage`。
- 这一回退路径可能导致数据以明文形式保存，因此推荐在支持 IndexedDB 的环境中使用 QCNOTE。
- 对旧版存储格式和旧加密盐值进行兼容，防止升级后数据丢失。

## 5. 搜索与语义

### 5.1 全文搜索

使用 `lunr.js` 构建本地索引，索引字段包括 `title`、`content`、`tags`、`category`，支持字段限定、布尔运算和通配词。

索引构建与缓存流程（`indexer.ts`）：

```typescript
// 1. 索引构建
notes.forEach((note) => {
  lunr_index.add({ id: note.id, title: note.title, content: note.content });
});

// 2. 索引缓存（hash 追踪，笔记未变化时复用旧索引）
const hash = generateHash(notes);
if (cached_hash === hash) {
  use_cached_index;
} else {
  rebuild_index;
}

// 3. 搜索查询
const results = lunr_index.search(query);
```

### 5.2 语义搜索（embedding）

- 由仪表盘上的开关控制（偏好保存在 `localStorage`），默认关闭。
- 开启后由 `embeddings.worker.ts` 加载 `Xenova/paraphrase-multilingual-MiniLM-L12-v2`，支持中英文等多语言；模型仅在首次使用时下载，下载进度通过 `onEmbeddingProgress` 回传界面。
- `indexer.ts` 按笔记缓存 embedding（记录 `updatedAt`），仅对新增或改动的笔记重新计算。
- 查询向量与笔记向量做余弦相似度，把关键词搜索未命中的语义匹配结果追加到列表末尾。
- 推理完全在本地进行，笔记内容不会发送到任何服务器。CSP 因此需要 `blob:` 与 `wasm-unsafe-eval`（见 `next.config.mjs`，详见 [SECURITY_IMPROVEMENTS.md](SECURITY_IMPROVEMENTS.md)）。

### 5.3 词频向量（轻量补充）

`vector.ts` 用 bag-of-words 词频向量（支持中文按字切分）计算余弦相似度，随索引一起构建，不依赖模型下载：

```typescript
// 文本向量化（词频统计）
function vectorize(text: string): number[] {
  const words = tokenize(text);
  const wordCounts = countWords(words);
  return words.map((w) => wordCounts[w] / totalWords);
}

// 余弦相似度
function cosineSimilarity(v1: number[], v2: number[]): number {
  const dotProduct = v1.reduce((acc, val, i) => acc + val * v2[i], 0);
  const magnitude1 = Math.sqrt(v1.reduce((acc, val) => acc + val * val, 0));
  const magnitude2 = Math.sqrt(v2.reduce((acc, val) => acc + val * val, 0));
  return dotProduct / (magnitude1 * magnitude2);
}
```

### 5.4 搜索解析

`utils.parseSearchQuery()` 支持 `title:xxx`、`content:xxx`、`tag:xxx` 等字段过滤，还支持 `AND/OR/NOT` 组合逻辑与日期范围查询。

### 5.5 搜索流程

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

## 6. 同步与冲突

### 6.1 WebDAV 同步

`webdavSyncManager.ts` 封装 WebDAV 的上传/下载逻辑，支持手动推送、拉取和自动定时同步。同步配置保存在本地，并支持可选加密密钥。

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

### 6.2 OneDrive 同步

- OneDrive 同步由 `OneDriveSync.tsx` 实现。
- 必须通过 OAuth 登录获取访问令牌。
- 用户可选择是否启用同步加密。

### 6.3 冲突处理

- 同步过程中会检测数据差异与版本冲突。
- `webdavSyncManager` 提供冲突解决策略与日志记录。

## 7. 页面与功能模块

### 7.1 主要页面

- `index.tsx`：首页介绍、核心功能卡片、快速上手。
- `dashboard.tsx`：笔记仪表盘，显示笔记列表、统计、视图切换与语义搜索开关，并接收扩展剪藏（`ClipImportDialog` 确认后保存）。
- `models.tsx`：AI 模型接入配置（需登录）。
- `profile.tsx` / `leaderboard.tsx`：个人主页与排行榜。
- `admin.tsx`：管理后台（需管理员角色）。
- `signin.tsx`：登录页。
- `diejie.tsx`：迷宫小游戏，成绩通过 `/api/ugc/maze/submit` 提交并进入排行榜。
- `privacy.tsx` / `terms.tsx`：法律与隐私说明页面。
- `contact.tsx`：联系与支持页面。

### 7.2 关键组件

- `NoteEditor.tsx`：Markdown 编辑与实时预览、KaTeX 数学公式渲染、双链创建与管理、版本历史记录、块级编辑、情感分析、自动保存。编辑流程为 `编辑器输入 → useState → 保存到 IndexedDB → 更新搜索索引 → UI 更新`。
- `KnowledgeGraph.tsx`：知识网络可视化组件，见 7.4 节。
- `NoteList.tsx`：动态笔记列表及标签过滤。
- `WebDAVSync.tsx` / `OneDriveSync.tsx`：同步设置与控制面板。

### 7.3 网页剪藏流程

```
浏览器扩展（popup.js）
  ↓ 提取整页 / 选中文本 / 文章正文，正文截断到 100,000 字符
  ↓ JSON → UTF-8 → base64url
打开 <应用地址>/dashboard#qcnote-clip=...   （hash 不会发往服务器）
  ↓
dashboard.tsx 读取并清除 hash → lib/clipImport.ts 校验（zod）
  ├─ 无效 / 过大: 提示并忽略
  └─ 有效: 暂存为 pendingClip
  ↓ 等待会话就绪（登录用户还需设备验证完成）
ClipImportDialog 展示标题、来源、预览
  ├─ 放弃: 丢弃
  └─ 保存为笔记: NoteStorage.addNoteAsync → 更新索引
```

### 7.4 知识图谱构建

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

## 8. 可选后端架构

### 8.1 管理与用户服务

- `server/index.ts`：Fastify 路由入口，包含 `/api/ugc/*`（用户资料、排行榜、迷宫）、`/api/admin/*`、`/api/push/*`、`/api/device/*`、`/api/vault/key`、`/api/health` 等。
- `server/ugc-service.ts`：用户资料与排行榜。
- `server/push-service.ts`：VAPID Web Push 发送与订阅管理（配置见 [VAPID_SETUP.md](VAPID_SETUP.md)）。
- `server/check-admin.ts` / `set-admin.ts`：管理员权限检查与提升，也可由 `postinstall.js` 通过 `ADMIN_SET_EMAIL` 引导。

#### 8.1.1 设备会话与金库密钥

- **设备会话**：`/api/device/verify`、`/api/device/session/create|validate`、`/api/device/reset` 基于设备指纹签发与校验会话令牌，签名密钥为 `DEVICE_SESSION_SECRET`；未设置时回退到 `NEXTAUTH_SECRET`，生产环境两者都缺失才会报错。
- **金库密钥**：`/api/vault/key` 由服务端使用 `VAULT_MASTER_KEY` 加密保存每个用户的本地加密密钥（KEK），以便在新设备上恢复；生产环境未配置该变量时接口会拒绝服务，不会回退到默认值。这意味着服务端持有可解密 KEK 的能力，属于"服务端托管密钥"而非严格的端到端加密。

### 8.2 数据库与缓存

- PostgreSQL 用于存储用户账号、个人主页资料、推送订阅（`scripts/001-*.sql`）和用户金库密钥（`scripts/002-*.sql`）。
- Redis 用于排行榜、会话与缓存。
- 生产环境缺少 `DATABASE_URL` / `REDIS_URL` 时后端会直接拒绝启动，仅开发环境回退到内存 mock。

Redis 缓存键结构：

```
用户数据:
  user:{userId}:profile - 用户资料
  user_role:{userId} - 用户角色

会话数据:
  sessions:{sessionId} - 认证会话

实时数据:
  online:users - 在线用户集合
  leaderboard:{period} - 排行榜缓存
```

### 8.3 认证与外部集成

- `next-auth` 负责 OAuth 登录、会话管理。
- OneDrive 集成借助 Microsoft Graph 客户端。

## 9. 性能优化

### 9.1 前端优化

- **代码分割**：Next.js 自动路由级代码分割。
- **懒加载**：组件按需加载（`React.lazy`）。
- **缓存策略**：IndexedDB 缓存搜索索引；向量缓存避免重复计算；HTTP 缓存静态资源。
- **渲染优化**：`useCallback` 避免重新创建函数；`useMemo` 缓存计算结果；知识图谱 LOD 系统降低节点数。

### 9.2 后端优化

- **数据库**：PostgreSQL 连接池；Redis 多层缓存；查询结果缓存。
- **API 优化**：分页返回大数据集；只返回必要字段；压缩响应体。

## 10. 安全考虑

完整的安全配置（HSTS、Cookie、CSP 等）见 [SECURITY_IMPROVEMENTS.md](SECURITY_IMPROVEMENTS.md)，此处只列出分层要点。

### 10.1 客户端安全

- **XSS 防护**：`rehype-sanitize` 清理 HTML。
- **CSRF 防护**：Token 验证（见 8.1、`lib/csrfProtection.ts`）。
- **内容验证**：Zod schema 校验。
- **日志**：统一通过 `lib/logger` 输出。

### 10.2 服务端安全

- **认证**：OAuth 2.0（NextAuth）。
- **授权**：基于角色的访问控制。
- **数据加密**：HTTPS 传输，可选加密存储。
- **审计**：操作日志记录。

## 11. 部署架构

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

仓库中的 `docker-compose.yml` 包含 `app`（前端，3000）、`server`（Fastify，10000，`server/Dockerfile`，构建上下文为仓库根目录，因为 `server/tsconfig.server.json` 继承根 `tsconfig.json`）和 `redis` 三个服务；**不包含 PostgreSQL**，需自行提供并通过 `DATABASE_URL` 注入 `server`。

```yaml
services:
  app: # build: .        → 前端，BACKEND_URL=http://server:10000
  server: # build: context . + server/Dockerfile → Fastify 后端
  redis: # image: redis:7-alpine（开启 AOF 持久化）
```

后端也可通过 `render.yaml` 部署到 Render（`rootDirectory: server`）。

## 12. 监控和调试

### 性能监控

- 页面加载时间
- 搜索响应时间
- 数据库查询时间
- 缓存命中率

### 错误追踪

- 统一日志（`lib/logger.ts`），可通过 `LOG_ENDPOINT` 转发到远程。
- `/api/health` 后端健康检查。
- 错误边界捕获。

## 13. 版本与依赖

- Node.js ≥ 20.9（Next.js 16 要求；CI 使用 22）
- Next.js 16.3.4
- React 18.3.1
- TypeScript 5.9.3
- Tailwind CSS 3.4.1
- Lunr.js 2.3.9
- KaTeX 0.18.7
- @huggingface/transformers 4.x
- next-auth 4.x
- Fastify 5.12.5（`server/`）
- PostgreSQL / Redis（可选）

## 14. 扩展性考虑

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

## 15. 未来改进

- [ ] PWA 离线支持增强
- [ ] GraphQL API
- [ ] 端到端加密
- [ ] 协作编辑
- [ ] AI 智能助手深度集成（目前仅支持在 `/models` 配置外部接口并从浏览器直接调用）
- [ ] 移动应用原生版本

## 16. 设计总结

QCNOTE 的核心价值在于：

- 让笔记数据始终"先留在本地"，不依赖网络即可使用；
- 通过运行时加密和独立 Worker，增强浏览器内存与存储安全；
- 以模块化方式支持云同步、个人主页、用户系统等扩展；
- 保持前端页面与文档一致，确保用户体验与实现逻辑同步。
