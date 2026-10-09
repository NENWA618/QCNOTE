# QCNOTE 架构

## 1. 概览

QCNOTE 是本地优先的个人笔记应用。编辑、搜索、双链、知识图谱都在浏览器里完成；登录、同步、个人主页、推送等服务端能力是可选的，后端缺失时这些功能降级或隐藏，不影响离线写笔记。

三条原则贯穿整个设计：

- **本地优先**：笔记只存在浏览器 IndexedDB 里，核心功能无网络也能用。
- **默认不上传**：只有用户主动"发布"或开启 WebDAV / OneDrive 同步时，内容才会离开设备。
- **读不出来就不写**：读取失败、设备未解锁、远端文件解不开时一律中止，绝不把"读不到"当成"没有数据"再写回去。

## 2. 分层

```
┌──────────────────────────────────────────────────────────────┐
│ 浏览器                                                         │
│   界面        pages/、components/                              │
│   业务逻辑    lib/（NoteStorage、搜索、同步引擎）                │
│   运行时      qcruntime/（Worker 中的 IndexedDB + AES-GCM）      │
│   离线/推送   public/service-worker.js                         │
└──────────────────────────┬───────────────────────────────────┘
                           │ （可选）pages/api/* → BACKEND_URL
┌──────────────────────────▼───────────────────────────────────┐
│ 后端  server/（Fastify 5）→ PostgreSQL、Redis                  │
└──────────────────────────────────────────────────────────────┘
```

| 目录          | 内容                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| `pages/`      | Next.js Pages Router 页面；`pages/api/*` 是到后端的薄代理（带 CSRF 同源校验）     |
| `components/` | React 组件，`Layout.tsx` 统一页头页脚                                             |
| `lib/`        | 业务逻辑，见下表                                                                  |
| `qcruntime/`  | 浏览器存储运行时，见第 4 节和 [qcruntime/README.md](../qcruntime/README.md)       |
| `server/`     | 独立的 Fastify 服务，有自己的 `package.json`，见第 8 节                           |
| `extensions/` | Chrome / Firefox 网页剪藏扩展，见 [extensions/README.md](../extensions/README.md) |
| `scripts/`    | 数据库 SQL（`001`–`003`）、索引脚本 `migrate-db.mjs`、管理员引导、备份脚本        |

样式用 Tailwind CSS 4（`@import 'tailwindcss'` + `@tailwindcss/postcss`）。

### 2.1 `lib/` 主要模块

| 模块                                                                       | 职责                                                                      |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `storage.ts`                                                               | `NoteStorage`：笔记的唯一读写入口，负责命名空间、加锁、加密存储、同步编排 |
| `storage/syncEngine.ts`                                                    | 纯函数的三方合并（`threeWayMerge`、`noteSyncHash`）                       |
| `storage/remoteSync.ts`                                                    | WebDAV / OneDrive 传输层：下载、条件上传                                  |
| `storage/deviceSession.ts`                                                 | 设备指纹、设备会话令牌、向后端换取金库密钥（KEK）                         |
| `storage/crypto.ts`                                                        | PBKDF2 + AES-GCM 文本加密（同步文件、访客的同步凭据）                     |
| `storage/linkGraph.ts`、`storage/types.ts`                                 | 双链 / 反向链接计算；笔记、配置、冲突等类型定义                           |
| `hooks/useDeviceVerification.ts`                                           | 登录后的设备验证流程，令牌通过 `BroadcastChannel` 在同源标签页间共享      |
| `indexer.ts`、`vector.ts`、`utils/search.ts`                               | Lunr 全文索引、词频向量、搜索语法解析                                     |
| `embeddings.ts`、`embeddings.worker.ts`                                    | 语义搜索，在 Worker 里用 `@huggingface/transformers` 推理                 |
| `webdavSyncManager.ts`                                                     | WebDAV 定时自动同步                                                       |
| `aiClient.ts`、`aiSettings.ts`                                             | 调用用户配置的 OpenAI 兼容接口；设置加密保存在本地                        |
| `clipImport.ts`                                                            | 解析并校验网页剪藏扩展传来的数据                                          |
| `publicNotes.ts`                                                           | 公开笔记的发布 / 取消发布                                                 |
| `pushNotification.ts`                                                      | Web Push 订阅                                                             |
| `api-client.ts`、`backend-proxy.ts`、`csrfProtection.ts`、`authCookies.ts` | 后端访问、代理、CSRF、Cookie 命名                                         |
| `sentiment.ts`、`logger.ts`、`idb.ts`                                      | 情感分析、日志、通用 IndexedDB 键值助手                                   |

## 3. NoteStorage：笔记的读写

所有笔记读写都经过 `lib/storage.ts` 的 `NoteStorage`，几个约束保证不丢数据：

- **严格读取**：`loadNotesAsync()` 读不出来就抛 `NoteStorageError`（`kind` 为 `locked` / `read` / `write`）。会写回或导出的路径都用它；`getDataAsync()` 失败时返回空列表，只用于显示。
- **串行的读改写**：所有修改都经过 `mutateNotes()`，在同一个标签页内排队执行（`runExclusive`）；`setCurrentUser()` 也排在队里，所以一次保存不会读 A 用户的笔记再写进 B 用户的库。
- **原子、只写差异**：`mutateNotes()` 对比前后两份列表，只把变化的笔记交给 `QCDb.bulkWrite()`，在一个 IndexedDB 事务里完成全部 put / delete，要么全成功要么全不变。
- **失败要让用户知道**：增删改在保存失败时抛错，仪表盘统一提示，并保留编辑器内容。

### 3.1 命名空间

| 数据                               | 访客                    | 登录用户                     |
| ---------------------------------- | ----------------------- | ---------------------------- |
| 笔记库（QCRuntime / IndexedDB）    | `QCNOTE_NOTES_DB_GUEST` | `QCNOTE_NOTES_DB_<userId>`   |
| 键值数据（设置、同步配置、冲突等） | `QCNOTE_<KEY>`          | `QCNOTE_<KEY>_USER_<userId>` |

键值数据优先存进通用 IndexedDB 库（`lib/idb.ts`），不可用时退回 `localStorage`。

访客登录后，`migrateGuestDataToUser()` 把访客笔记合并进账号库；**确认写入成功后**才清除访客数据，失败时两边都保持原样，可以重试。

### 3.2 加密规则

| 数据                                        | 访客                               | 登录用户              |
| ------------------------------------------- | ---------------------------------- | --------------------- |
| 笔记记录                                    | 明文                               | 字段级加密（见 4.2）  |
| 冲突记录、同步基线、语义搜索 embedding 缓存 | 明文                               | 用笔记库密钥整体 seal |
| WebDAV / OneDrive 配置                      | 密码、令牌、同步密钥用设备密钥加密 | 整份配置 seal         |
| AI 设置（`/models`）                        | API Key 用设备密钥加密             | 整份设置 seal         |

- **seal** 是用笔记库自己的数据密钥（DEK）加密任意 JSON 值（`QCDb.seal` / `unseal`），存储形如 `{ "__sealed": "<密文>" }`。拿不到服务端下发的密钥就读不出来。
- **设备密钥**是一段随机值，存在同一个浏览器的 `localStorage` 里，只能防止秘密以原文出现在存储中，挡不住能读取这个浏览器存储的人。访客的笔记本身就是明文，所以这里只做到这一步。
- 读到旧格式（明文、旧的设备密钥或硬编码口令加密）时会自动按当前格式重新保存。
- 登录用户的设备未解锁时，上述数据读写都会失败，**不会退回较弱的加密或明文**。
- 旧版本把全文索引、词频向量、embedding 明文写进过 IndexedDB（`QCNOTE_LUNR_INDEX` 等），`NoteStorage` 启动时会删除这些键。

## 4. 运行时与密钥

### 4.1 QCRuntime

`qcruntime/` 在 Worker 里管理 IndexedDB 和 AES-GCM 加密，主线程通过 RPC 调用；浏览器不支持 Worker 时退化为在主线程执行同一套代码。它只提供存储能力，不关心笔记的结构。API 见 [qcruntime/README.md](../qcruntime/README.md)。

### 4.2 登录用户的密钥（金库方案）

```
后端 PostgreSQL                        浏览器
user_vault_keys.wrapped_key            QCNOTE_NOTES_DB_<userId>__qcnote_meta__
  = AES-GCM(VAULT_MASTER_KEY, KEK)        wrappedDEK = AES-GCM(KEK, DEK)
            │                                        │
            └──── /api/vault/key 下发 KEK ───────────┤
                  （需要登录 + 有效设备会话令牌）       ▼
                                          DEK 只在 Worker 内存中，
                                          加密笔记的 secret 字段和 seal 数据
```

- **KEK**（每用户一把）由后端随机生成，用 `VAULT_MASTER_KEY` 加密后存进 `user_vault_keys` 表。
- **DEK**（每个浏览器的每个笔记库一把）在浏览器本地生成，用 KEK 包裹后存在该库的元数据库里，**从不发往服务器**；KEK 也只在内存中使用，不落盘。
- 打开笔记库的顺序：读取设备会话令牌 → 计算设备指纹 → `/api/device/session/validate` → `/api/vault/key` 换取 KEK → 解包 DEK。任何一步失败（离线、令牌过期、KEK 解不开 DEK）都会把库标记为**锁定**（`notesDbLocked`），仪表盘提示"设备未解锁"，而不是显示一个空列表。
- **加密的字段**：标题、正文、分类、标签、文字着色、引用的标题（`links`）、版本历史、情感分析结果。明文保留的只有 id、时间戳、收藏 / 归档 / 删除标记、笔记颜色、`backlinks`（笔记 id 列表）和 `ownerId`。新增携带用户内容的字段时，必须在 `NoteStorage.noteStoreSchema` 里标为 `secret`。
- **迁移**：打开库时，Worker 会把仍是明文的 secret 字段一次性加密；旧方案（v1，本机持久化密钥）的库在拿到 KEK 后迁移到金库方案（v2）。
- **无法解密的记录**：某条记录的加密字段解不开时，Worker 去掉它的 secret 字段并标记 `_undecryptable`。`NoteStorage` 读取时跳过这些记录（计数在 `undecryptableCount`），它们不会被显示、修改、删除或同步，原始数据留在本机以便日后恢复。

**这意味着什么**：只拿到服务器数据库（即使连同 `VAULT_MASTER_KEY`）解不开笔记，因为 DEK 和笔记都只在浏览器里；只拿到浏览器存储也解不开，因为缺 KEK。但服务端能解出每个用户的 KEK，所以这是**服务端托管密钥，不是端到端加密**：能同时拿到服务端密钥和某个浏览器存储的一方可以解密那台设备上的笔记。

### 4.3 设备验证

- 设备指纹是 UA、平台、语言、屏幕、CPU 核数等的 SHA-256（`getDeviceFingerprint`）。
- 每个账号同一时间只登记**一台**设备：第一次验证的设备自动登记；其他指纹会被拒绝（`DEVICE_MISMATCH`）。浏览器升级等导致指纹变化时也会被拒绝。
- 用户可在仪表盘"重置设备"（`/api/device/reset`）：清空登记列表，并把当前设备登记为新设备。重置只要求已登录，所以设备绑定防的是"令牌被拿到别的设备上用"，而不是账号本身被盗用。
- 设备会话令牌是 HS256 JWT，绑定用户和指纹，有效期 12 小时，签名密钥为 `DEVICE_SESSION_SECRET`（未设置时用 `NEXTAUTH_SECRET`）。令牌存在 `sessionStorage`，关闭浏览器即失效。

每台设备有自己的 DEK，笔记不会自动出现在另一台设备上；跨设备需要 WebDAV / OneDrive 同步。

## 5. 搜索

### 5.1 全文搜索

`indexer.ts` 用 Lunr 为 `title`、`content` 建索引，同时计算词频向量（`vector.ts`，中文按字切分）和情感分析。笔记集合（id + `updatedAt`）没变时复用**内存中**的索引，任何保存都会让它失效；索引不写入持久存储。

语法（`parseSearchQuery`）：`title:`、`content:`、`tag:`、`category:`、`date:` 字段过滤，`AND / OR / NOT` 组合，以及日期范围。标签、分类、日期过滤在 Lunr 之外处理。

### 5.2 语义搜索

- 仪表盘上的开关，偏好存在 `localStorage`，**默认关闭**。
- 开启后 `embeddings.worker.ts` 加载 `Xenova/paraphrase-multilingual-MiniLM-L12-v2`（多语言），模型只在首次开启时下载，进度通过 `onEmbeddingProgress` 回传。
- embedding 按笔记缓存（记录 `updatedAt`，只重算变化的笔记）；缓存按用户隔离，登录用户的缓存是 seal 过的。
- 查询向量与笔记向量做余弦相似度（阈值 0.5），关键词没命中的语义结果追加在列表末尾。
- 推理完全在本地。CSP 因此需要 `blob:` 和 `'wasm-unsafe-eval'`，见 [SECURITY_IMPROVEMENTS.md](SECURITY_IMPROVEMENTS.md)。

```
输入 → 解析语法 → Lunr 全文搜索 →（若开启）语义补充 → 合并 → 列表 / 知识图谱
```

## 6. 同步

WebDAV 和 OneDrive 都把**全部笔记**（包括回收站）存成远端的一个文件。填写了同步加密密钥时，文件内容是 `base64(salt‖iv‖AES-GCM 密文)`，密钥用 PBKDF2（SHA-256，250,000 次）派生；**没填就是明文 JSON**。

### 6.1 三方合并

`lib/storage/syncEngine.ts` 以**同步基线**为依据逐条合并：基线是上次同步成功时双方一致的状态，每条笔记记录一个摘要（`noteSyncHash`，只覆盖标题、正文、分类、标签、颜色、着色、收藏、归档、删除标记，不含时间戳和派生字段）。

| 本地 vs 基线 | 远端 vs 基线 | 结果             |
| ------------ | ------------ | ---------------- |
| 未变         | 改了         | 取远端           |
| 改了         | 未变         | 取本地           |
| 改了         | 改了         | 冲突，按策略处理 |
| 未变         | 删除         | 两边删除         |
| 改了         | 删除         | 保留本地的修改   |
| 新增         | —            | 两边都加上       |

- 首次同步（没有基线）时取并集，不删除任何东西。
- 基线按"提供方 + 用户 + 远端文件"保存（`remoteId`），换了远端文件就重新开始。
- 不依赖设备时钟，删除能双向传播，不需要墓碑记录。
- 冲突策略：WebDAV 可选 `manual`（默认，进入冲突列表由用户选择）、`prefer-local`、`prefer-remote`；OneDrive 用 `newest`（`updatedAt` 较新的一方）。自动解决时，输的一方存进赢家的版本历史。
- 有未解决冲突的笔记在同步时原样跳过，其余笔记照常同步。

### 6.2 一次同步

`NoteStorage.runSync()`：

1. 下载远端文件。文件存在但**解不开或解析失败**时中止，绝不覆盖读不懂的远端。
2. 在写锁内做三方合并，保存本地结果，记录新的冲突。
3. 远端需要更新时**条件上传**：WebDAV 用 `If-Match`（新文件用 `If-None-Match: *`），服务器回 412 说明期间被别的设备改过；服务器不给 ETag 时（以及 OneDrive），上传前再下载一次比对。
4. 冲突时从第 1 步重试，最多 3 次；成功后记录新基线。

### 6.3 入口

| 操作                       | 行为                                                                    |
| -------------------------- | ----------------------------------------------------------------------- |
| WebDAV"立即同步"、自动同步 | `syncWithWebDAVAsync`：双向合并                                         |
| WebDAV"从 WebDAV 下载"     | `pullFromWebDAVAsync`：只合并到本机，不上传                             |
| WebDAV"覆盖上传至 WebDAV"  | `pushToWebDAVAsync`：用本机笔记覆盖远端，丢弃远端独有的修改，需二次确认 |
| OneDrive"同步"             | `syncWithOneDriveAsync`：双向合并                                       |

OneDrive 目前需要用户手动粘贴 Microsoft Graph 访问令牌，没有内置的微软账号登录流程。

## 7. 前端

### 7.1 页面

| 页面                                  | 作用                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------- |
| `index`                               | 首页                                                                        |
| `dashboard`                           | 笔记仪表盘：列表 / 日历 / 时间线 / 图谱视图、统计、设备验证、同步，接收剪藏 |
| `models`                              | AI 模型接入配置（需登录且设备已解锁）                                       |
| `profile`                             | 编辑个人资料、管理公开笔记（仅本人）                                        |
| `u/[userId]`、`u/[userId]/n/[noteId]` | 公开的个人主页和公开笔记阅读页                                              |
| `leaderboard`、`diejie`               | 排行榜与迷宫小游戏                                                          |
| `admin`、`signin`                     | 管理后台（需管理员角色）、登录页；这两页服务端渲染，其余是静态页            |
| `privacy`、`terms`、`contact`         | 法律与支持页面                                                              |

### 7.2 关键组件

- `NoteEditor`：Markdown 编辑与预览、KaTeX、双链、版本历史、文字着色、情感分析、自动保存、发布 / 取消发布。
- `DashboardToolbar`：视图切换和"新建笔记"；回收站、冲突、标签管理、云端同步、导入导出、清空所有笔记收在"更多"菜单（清空需输入"清空"确认）。
- `Conflicts`：同步冲突列表，逐条选择本地、远端或合并后的版本。
- `KnowledgeGraph`：节点是笔记，边是 `[[双链]]`；节点多时按重要度做 LOD 裁剪，力导向布局后绘制到 Canvas。
- `WebDAVSync`、`OneDriveSync`：同步设置面板。

### 7.3 网页剪藏

```
扩展：提取整页 / 选中文本 / 文章正文（≤ 100,000 字符）
  → JSON → base64url → 打开 <应用>/dashboard#qcnote-clip=...   （hash 不发往服务器）
仪表盘读取并清除 hash → clipImport.ts 用 zod 校验
  → 等待会话就绪（登录用户需完成设备验证）
  → ClipImportDialog 预览 → 用户确认后才保存
```

任何链接都能带这个 hash，所以它被当作不可信输入。

## 8. 可选后端

### 8.1 路由

`server/index.ts` 是入口，路由在 `server/routes/`：

| 文件             | 路由                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `core.ts`        | `GET /api/health`、`GET /api/sitemap.xml`                                                                                      |
| `device.ts`      | `POST /api/device/verify`、`/api/device/session/create`、`/api/device/session/validate`、`/api/device/reset`、`/api/vault/key` |
| `ugc.ts`         | 用户资料与公开笔记，见 8.2                                                                                                     |
| `leaderboard.ts` | `GET /api/ugc/leaderboard/:type`、`/api/ugc/leaderboard/maze`；`POST /api/ugc/maze/submit`                                     |
| `push.ts`        | `/api/push/subscribe`、`/unsubscribe`、`/broadcast`、`GET /api/push/stats`                                                     |
| `admin.ts`       | `/api/admin/users`、`/roles`、`/set-admin`                                                                                     |

服务器不保存、也不接收任何私有笔记；唯一的笔记内容是用户主动发布的公开副本。

其他文件：`ugc-service.ts`（资料、设备、金库密钥、排行榜）、`push-service.ts`（VAPID，见 [VAPID_SETUP.md](VAPID_SETUP.md)）、`public-notes.ts`（公开笔记校验）、`session.ts`（从 NextAuth JWT Cookie 解析用户）、`check-admin.ts` / `set-admin.ts`。`postinstall.js` 可通过 `ADMIN_SET_EMAIL` 引导管理员。

### 8.2 公开笔记

公开笔记是用户主动发布到服务器的一份**明文快照**，展示在个人主页。

- **数据**：`public_notes` 表，`(user_id, local_note_id)` 唯一；`id` 是独立随机值，公开链接不暴露本地笔记 ID。只保存标题、正文、标签、文字着色。`source_updated_at` 记录发布时本地笔记的 `updatedAt`，仪表盘据此提示"有未发布的更改"。
- **限制**（`server/public-notes.ts`）：标题 ≤ 200 字符，正文 ≤ 100KB，标签 ≤ 20 个，每人最多 100 篇。
- **接口**：

  | 方法与路径                                          | 说明                         | 权限       |
  | --------------------------------------------------- | ---------------------------- | ---------- |
  | `PUT /api/ugc/notes/public/:localNoteId`            | 发布 / 更新                  | 登录       |
  | `POST /api/ugc/notes/public/:localNoteId/unpublish` | 取消发布，删除副本           | 登录       |
  | `POST /api/ugc/notes/public/unpublish-all`          | 全部取消（清空所有笔记时用） | 登录       |
  | `GET /api/ugc/notes/public`                         | 我已发布的笔记               | 登录       |
  | `GET /api/ugc/public/user/:userId/notes`            | 某用户的公开笔记列表         | 匿名，限流 |
  | `GET /api/ugc/public/notes/:id`                     | 单篇公开笔记                 | 匿名，限流 |
  | `POST /api/admin/public-notes/:id/remove`           | 管理员下架                   | 管理员     |

  取消发布用 POST，因为前端代理只放行 GET / POST / PUT。

- **与本地删除的关系**：删除本地笔记不会自动取消发布；仪表盘在"删除"、"永久删除"、"清空所有笔记"涉及已公开笔记时会询问，取消发布失败则中止删除。备份不含发布状态，导入的笔记不会自动公开。
- **安全**：服务端逐项校验着色范围并丢弃不安全的颜色，渲染端使用 `rehype-sanitize`；两个公开页面带 `noindex` 且在客户端渲染。

### 8.3 数据库与缓存

- **PostgreSQL**：用户资料与设备指纹（`users`）、角色（`user_roles`）、推送订阅（`push_subscriptions`）、金库密钥（`user_vault_keys`）、公开笔记（`public_notes`）、迷宫成绩（`maze_submissions`）。除 `push_subscriptions` 外，表都由后端在启动或首次使用时自动创建（`server/postgres-client.ts`）；`push_subscriptions` 需手动执行 `scripts/001-create-push-subscriptions-table.sql`。`002` 是 `user_vault_keys` 的等价脚本，`003` 清理旧的默认头像；`scripts/migrate-db.mjs` 只补充查询索引。
- **Redis**：用户资料缓存（`user:{userId}:profile`）和排行榜（`leaderboard:{type}`、`leaderboard:maze:{day}`）。会话由 NextAuth 的 JWT Cookie 承载，不存 Redis。
- 生产环境缺少 `DATABASE_URL`、`REDIS_URL` 或 `VAULT_MASTER_KEY` 时后端拒绝启动；开发环境回退到内存 mock 和仅供开发的默认密钥。

### 8.4 认证

`next-auth` 负责 Google / GitHub / Discord OAuth 和会话；Cookie 配置见 [SECURITY_IMPROVEMENTS.md](SECURITY_IMPROVEMENTS.md)。Fastify 后端用同一个 `NEXTAUTH_SECRET` 解析会话 Cookie。

## 9. PWA 与离线

| 文件                          | 作用                                                                       |
| ----------------------------- | -------------------------------------------------------------------------- |
| `public/manifest.webmanifest` | 名称、图标（含 maskable）、`standalone`，起始页 `/`，快捷入口 `/dashboard` |
| `public/service-worker.js`    | 缓存策略和推送                                                             |
| `public/offline.html`         | 既没网络也没缓存时的兜底页                                                 |

`pages/_app.tsx` 只在**生产环境**注册 Service Worker；开发环境会注销已有的 SW（开发模式的 chunk 没有内容哈希，缓存会拿到旧代码）。

缓存策略（只处理同源 GET）：

| 请求                                | 策略                                                    |
| ----------------------------------- | ------------------------------------------------------- |
| `/_next/static/*`                   | cache-first（文件名带内容哈希）                         |
| 页面导航                            | network-first，离线时用缓存页面，再退到 `/offline.html` |
| `/images/*`                         | stale-while-revalidate                                  |
| `/api/`、`/admin`、`/signin`、`/u/` | 不缓存                                                  |

- 笔记在 IndexedDB 里，不经过 Service Worker；PWA 补的是"应用壳也能离线打开"。
- 页面访问过一次才会被缓存。
- 登录用户离线时拿不到 KEK，笔记库会处于锁定状态；离线读写完整可用的是访客模式。
- 修改缓存策略时递增 `CACHE_VERSION`；`next.config.mjs` 给 `/service-worker.js` 设了 `no-cache`。
- 推送点击会聚焦或打开 `/dashboard`。

## 10. 性能

- 路由级代码分割；`PushNotificationPrompt` 用 `next/dynamic` 按需加载；语义搜索的模型和 Worker 只在开启后加载；存储层（含 Lunr）只在 `/dashboard`、`/models` 加载。
- 搜索索引在内存中缓存，笔记不变时复用；embedding 持久缓存，只重算变化的笔记。
- 加解密在 Worker 中进行，不阻塞界面。
- 后端：PostgreSQL 连接池、Redis 缓存资料、`@fastify/rate-limit` 限流。

## 11. 安全

完整配置见 [SECURITY_IMPROVEMENTS.md](SECURITY_IMPROVEMENTS.md)。要点：

- **存储**：登录用户的笔记及派生数据静态加密（第 4 节）；访客数据为明文。
- **传输**：HTTPS + HSTS；同步文件可选加密。
- **客户端**：`rehype-sanitize` 防 XSS；zod 校验外部输入；Next API 路由做 CSRF 同源校验。
- **服务端**：OAuth；基于角色的授权（`requireAdmin`）；`@fastify/helmet`、限流。

## 12. 部署

```
GitHub ─push─▶ Vercel（Next.js + pages/api）─BACKEND_URL─▶ Fastify（Render / 自托管）
                                                             ├─ PostgreSQL
                                                             └─ Redis
```

- **Docker Compose**：`app`（3000）、`server`（10000，仅内网；`server/Dockerfile` 的构建上下文是仓库根目录，因为 `server/tsconfig.server.json` 继承根 `tsconfig.json`）、`redis`（7-alpine，AOF）。**不含 PostgreSQL**。
- **Render**：后端，见 `render.yaml`（`rootDirectory: server`）。
- PWA 和 Service Worker 要求 HTTPS（`localhost` 除外）。

## 13. 测试与监控

- 单元测试（Vitest + `fake-indexeddb`）：存储完整性（`storage-integrity`）、静态加密（`encryption-at-rest`：写入带标记的内容后导出全部 IndexedDB 和 `localStorage`，确认找不到标记）、同步引擎（`syncEngine`：合并规则表 + 两台设备对接内存 WebDAV 服务器）等。
- E2E：Playwright + axe-core。
- Lighthouse CI（`.github/workflows/lighthouse.yml`）：性能低于 0.9 报错，无障碍低于 0.9 警告。
- 日志：`lib/logger.ts`，设置 `LOG_ENDPOINT` 可转发；后端健康检查 `GET /api/health`。

## 14. 版本

以 `package.json` 和 `server/package.json` 为准：Node.js ≥ 20.9（CI 用 22）、Next.js 16（Pages Router）、React 18、TypeScript 5、Tailwind CSS 4、Lunr 2、KaTeX、`@huggingface/transformers` 4、next-auth 4、Fastify 5。

## 15. 已知限制与方向

- 金库密钥由服务端托管，不是端到端加密。
- 每个账号同时只能登记一台设备。
- 登录用户离线时无法解锁笔记库。
- OneDrive 需要手动粘贴访问令牌。
- 同步文件不填加密密钥时是明文。

可能的方向：应用内安装入口与 SW 更新提示、后台同步（Background Sync）、端到端加密、多设备登记、OneDrive OAuth、协作编辑。
