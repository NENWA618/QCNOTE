# 架构

这份文档面向开发者，说明 QCNOTE 各部分怎样组织、数据怎样存储和加密、同步怎样合并，以及改代码时需要守住的约束。使用说明见 [USER_GUIDE.md](USER_GUIDE.md)，部署见 [DEPLOYMENT.md](DEPLOYMENT.md)，安全配置见 [SECURITY.md](SECURITY.md)。

1. [设计原则](#1-设计原则)
2. [系统组成](#2-系统组成)
3. [笔记存储](#3-笔记存储)
4. [密钥与设备](#4-密钥与设备)
5. [搜索](#5-搜索)
6. [同步](#6-同步)
7. [前端](#7-前端)
8. [后端](#8-后端)
9. [PWA 与离线](#9-pwa-与离线)
10. [性能](#10-性能)
11. [测试与持续集成](#11-测试与持续集成)
12. [技术栈](#12-技术栈)
13. [已知限制](#13-已知限制)

## 1. 设计原则

- **本地优先**：笔记只存在浏览器的 IndexedDB 里，编辑、搜索、双链、图谱都在本地完成，没有网络也能用。登录、同步、个人主页、推送等服务端能力都是可选的，后端缺失时这些功能降级或隐藏。
- **默认不上传**：只有用户主动“发布”一篇笔记，或开启 WebDAV / OneDrive 同步时，内容才会离开设备。服务器从不接收私有笔记。
- **读不出来就不写**：读取失败、设备未解锁、远端文件解不开时一律中止，绝不把“读不到”当成“没有数据”再写回去。

## 2. 系统组成

```
┌─────────────────────────────────────────────────────────────┐
│ 浏览器                                                        │
│   界面        pages/、components/                             │
│   业务逻辑    lib/（NoteStorage、搜索、同步引擎）               │
│   运行时      qcruntime/（Worker 中的 IndexedDB + AES-GCM）     │
│   离线/推送   public/service-worker.js                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ 可选：pages/api/* 代理到 BACKEND_URL
┌──────────────────────────▼──────────────────────────────────┐
│ 后端  server/（Fastify 5）→ PostgreSQL、Redis                 │
└─────────────────────────────────────────────────────────────┘
```

| 目录          | 内容                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `pages/`      | Next.js Pages Router 页面；`pages/api/*` 是到后端的薄代理，带 CSRF 同源校验                                 |
| `components/` | React 组件；`Layout` 统一页头页脚，`AppLoader` 是笔记页的初始化界面                                         |
| `lib/`        | 业务逻辑，见下表                                                                                            |
| `qcruntime/`  | 浏览器存储运行时，见第 4 节和 [qcruntime/README.md](../qcruntime/README.md)                                 |
| `server/`     | 独立的 Fastify 服务，有自己的 `package.json`，见第 8 节                                                     |
| `extensions/` | Chrome / Firefox 网页剪藏扩展，见 [extensions/README.md](../extensions/README.md)                           |
| `scripts/`    | 数据库 SQL（`001`–`003`）、管理员查询、前后端公共依赖同步、备份脚本                                         |
| `styles/`     | `globals.css`：Tailwind CSS 4（`@import 'tailwindcss'` + `@tailwindcss/postcss`）主题、组件类和深色模式覆盖 |

### 2.1 `lib/` 主要模块

| 模块                                                                       | 职责                                                                                       |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `storage.ts`                                                               | `NoteStorage`：笔记的唯一读写入口，负责命名空间、加锁、加密存储、同步编排                  |
| `storage/notesDb.ts`、`storage/writeLock.ts`                               | 笔记库连接（解锁、重试、访客库）；写锁与用户代际                                           |
| `storage/noteOps.ts`、`storage/noteSchema.ts`                              | 新建 / 更新笔记（版本、情感）、导入合并、统计；笔记库的字段加密表                          |
| `storage/keyValueStore.ts`、`storage/syncConfig.ts`、`storage/sealing.ts`  | 键值存储（IndexedDB，退回 localStorage）；同步配置的加密读写；密封值格式                   |
| `storage/guestMigration.ts`                                                | 登录后把访客的笔记、设置、同步配置迁入账号                                                 |
| `storage/syncEngine.ts`、`storage/syncRunner.ts`、`storage/remoteSync.ts`  | 三方合并（纯函数 `threeWayMerge`、`noteSyncHash`）；一次同步往返；WebDAV / OneDrive 传输层 |
| `storage/deviceSession.ts`                                                 | 设备会话令牌、向后端换取金库密钥（KEK）                                                    |
| `storage/crypto.ts`                                                        | PBKDF2 + AES-GCM 文本加密（同步文件、访客的同步凭据）                                      |
| `storage/linkGraph.ts`、`storage/types.ts`                                 | 双链 / 反向链接计算；类型定义                                                              |
| `hooks/useDeviceVerification.ts`                                           | 登录后获取设备会话令牌的流程，令牌通过 `BroadcastChannel` 在同源标签页间共享               |
| `indexer.ts`、`vector.ts`、`utils/search.ts`                               | Lunr 全文索引、词频向量、搜索语法解析                                                      |
| `embeddings.ts`、`embeddings.worker.ts`                                    | 语义搜索，在 Worker 里用 `@huggingface/transformers` 推理                                  |
| `webdavSyncManager.ts`                                                     | WebDAV 定时自动同步                                                                        |
| `aiClient.ts`、`aiSettings.ts`                                             | 调用用户配置的 OpenAI 兼容接口；AI 设置加密保存在本地                                      |
| `clipImport.ts`                                                            | 解析并校验网页剪藏扩展传来的数据                                                           |
| `publicNotes.ts`、`pushNotification.ts`                                    | 公开笔记的发布 / 取消发布；Web Push 订阅                                                   |
| `api-client.ts`、`backend-proxy.ts`、`csrfProtection.ts`、`authCookies.ts` | 后端访问、代理、CSRF、Cookie 命名                                                          |
| `env-config.ts`                                                            | 前端环境变量校验；生产环境拒绝弱的 `NEXTAUTH_SECRET`                                       |
| `sentiment.ts`、`logger.ts`、`idb.ts`                                      | 情感分析、日志、通用 IndexedDB 键值助手                                                    |

## 3. 笔记存储

所有笔记读写都经过 `lib/storage.ts` 的 `NoteStorage`。下面几条约束保证不丢数据，改存储相关代码时必须守住：

- **严格读取**：`loadNotesAsync()` 读不出来就抛 `NoteStorageError`（`kind` 为 `locked`、`read` 或 `write`）。会写回或导出的路径都必须用它；`getDataAsync()` 失败时返回空列表，只能用于显示。
- **串行的读改写**：所有修改都经过 `mutateNotes()`，排队执行：同一标签页内靠 Promise 队列，跨标签页靠 Web Locks（`navigator.locks`，锁名 `qcnote:notes-write`；不支持的浏览器只做标签页内排队）。`setCurrentUser()` 也排在这个队列里，所以一次保存不会读 A 用户的笔记、再写进 B 用户的库。
- **原子、只写差异**：`mutateNotes()` 对比前后两份列表，只把变化的笔记交给 `QCDb.bulkWrite()`，在一个 IndexedDB 事务里完成全部 put / delete，要么全成功，要么全不变。
- **失败要让用户知道**：增删改保存失败时抛错，控制台统一提示，并保留编辑器里的内容。

### 3.1 命名空间

| 数据                               | 访客                    | 登录用户                     |
| ---------------------------------- | ----------------------- | ---------------------------- |
| 笔记库（QCRuntime / IndexedDB）    | `QCNOTE_NOTES_DB_GUEST` | `QCNOTE_NOTES_DB_<userId>`   |
| 键值数据（设置、同步配置、冲突等） | `QCNOTE_<KEY>`          | `QCNOTE_<KEY>_USER_<userId>` |

键值数据优先存进通用 IndexedDB 库（`lib/idb.ts`），不可用时退回 `localStorage`。

访客登录后，`migrateGuestDataToUser()` 把访客笔记合并进账号库，**确认写入成功后**才清除访客数据；失败时两边都保持原样，可以重试。

每篇笔记最多保留最近 20 个历史版本（`MAX_VERSIONS`），每次更新都会把更新前的状态存为一个版本。

### 3.2 加密规则

| 数据                                        | 访客                               | 登录用户              |
| ------------------------------------------- | ---------------------------------- | --------------------- |
| 笔记记录                                    | 明文                               | 字段级加密（见 4.2）  |
| 冲突记录、同步基线、语义搜索 embedding 缓存 | 明文                               | 用笔记库密钥整体 seal |
| WebDAV / OneDrive 配置                      | 密码、令牌、同步密钥用设备密钥加密 | 整份配置 seal         |
| AI 设置（`/models`）                        | API Key 用设备密钥加密             | 整份设置 seal         |

- **seal**：用笔记库自己的数据密钥（DEK）加密任意 JSON 值（`QCDb.seal` / `unseal`），存储形如 `{ "__sealed": "<密文>" }`。拿不到服务端下发的密钥就读不出来。
- **设备密钥**：一段随机值，存在同一浏览器的 `localStorage` 里。它只能防止秘密以原文出现在存储中，挡不住能读取这个浏览器存储的人。访客的笔记本身就是明文，所以访客数据只做到这一步。
- 登录用户的这些数据只认 seal 格式，读到未 seal 的值一律当作不存在。
- 登录用户的设备未解锁时，上述数据的读写都会失败，**不会退回较弱的加密或明文**。

## 4. 密钥与设备

### 4.1 QCRuntime

`qcruntime/` 在 Worker 里管理 IndexedDB 和 AES-GCM 加密，主线程通过 RPC 调用；浏览器不支持 Worker 时，在主线程执行同一套代码。它只提供存储能力，不关心笔记的结构。API 见 [qcruntime/README.md](../qcruntime/README.md)。

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

- **KEK**（每个用户一把）由后端随机生成，用 `VAULT_MASTER_KEY` 加密后存进 `user_vault_keys` 表。
- **DEK**（每个浏览器的每个笔记库一把）在浏览器本地生成，用 KEK 包裹后存在该库的元数据库里，**从不发往服务器**。KEK 也只在内存中使用，不落盘。
- **打开笔记库的顺序**：读取设备会话令牌 → `/api/device/session/validate` → `/api/vault/key` 换取 KEK → 解包 DEK。任何一步失败（离线、令牌过期、KEK 解不开 DEK）都会把库标记为**锁定**（`notesDbLocked`），控制台提示“设备未解锁”，而不是显示一个空列表。锁定后，每隔 `NOTES_DB_RETRY_MS`（10 秒）的下一次读取会重新尝试；控制台在锁定期间定时重试、联网时立即重试，解锁后不用刷新页面。
- **加密的字段**：标题、正文、分类、标签、文字着色、引用的标题（`links`）、版本历史、情感分析结果。明文保留的只有 id、时间戳、删除标记、笔记颜色、`backlinks`（笔记 id 列表）和 `ownerId`。**新增携带用户内容的字段时，必须在 `noteStoreSchema` 里标为 `secret`**，`test/encryption-at-rest.test.ts` 会检查存储中是否出现明文。
- **明文字段加密**：schema 新增 secret 字段后，打开库时 Worker 会把仍是明文的这些字段一次性加密。
- **无法解密的记录**：某条记录的加密字段解不开时，Worker 去掉它的 secret 字段并标记 `_undecryptable`。`NoteStorage` 读取时跳过这些记录（计数在 `undecryptableCount`），它们不会被显示、修改、删除或同步，原始数据留在本机以便日后恢复。

**威胁模型**：只拿到服务器数据库（即使连同 `VAULT_MASTER_KEY`）解不开笔记，因为 DEK 和笔记都只在浏览器里；只拿到浏览器存储也解不开，因为缺 KEK。但服务端能解出每个用户的 KEK，所以这是**服务端托管密钥，不是端到端加密**：能同时拿到服务端密钥和某个浏览器存储的一方，可以解密那台设备上的笔记。完整的分析见 [SECURITY.md](SECURITY.md#能解密笔记需要什么)。

### 4.3 单账号单会话与设备会话令牌

- **一个账号同一时间只有一个有效的登录会话。** 每次登录，NextAuth 的 `jwt` 回调生成新的会话 ID（`sid`，写进登录令牌），并通过 `POST /api/ugc/session/register`（服务间令牌）登记到 `users.active_session_id`。令牌里的 `sid` 不是登记的那个，这个会话就作废：后端在解析会话时拒绝它（`server/session.ts`），NextAuth 的 `jwt` 回调也会定期向 `/api/ugc/session/status` 确认并清掉 Cookie。登记失败时这次登录失败，不会出现“新会话被拒、旧会话仍有效”。
- **生效延迟**：本进程里，新登录登记后立即生效；多实例部署时，其它后端实例按 30 秒的缓存拒绝旧会话；前端最多 5 分钟后清掉被顶掉的会话 Cookie（期间它的后端请求已经被拒绝）。
- **升级过渡**：账号还没按新方式登录过（`active_session_id` 为空）时，没有 `sid` 的旧登录令牌不拦截；账号登记过会话之后，没有 `sid` 的令牌也会失效。
- **设备会话令牌**是 HS256 JWT，绑定用户和登录会话 ID，有效期 12 小时，签名密钥为 `DEVICE_SESSION_SECRET`（未设置时用 `NEXTAUTH_SECRET`）。令牌存在 `sessionStorage`，关闭浏览器即失效；换一次登录，旧会话签发的令牌就换不到 KEK。
- 浏览器指纹验证已移除，`users.device_fingerprints` 列不再读写（旧库里的这一列保留在原表中，没有删除）。同一登录会话可以在多个标签页使用，不限制标签页数量。

每台设备有自己的 DEK，笔记不会自动出现在另一台设备上；跨设备需要 WebDAV / OneDrive 同步。

## 5. 搜索

```
输入 → 解析语法 → Lunr 全文搜索 →（开启时）语义补充 → 合并 → 列表 / 图谱
```

### 5.1 全文搜索

`indexer.ts` 用 Lunr 为 `title`、`content` 建索引，同时计算词频向量（`vector.ts`，中文按字切分）和情感分析。笔记集合（id + `updatedAt`）没变时复用**内存中**的索引，任何保存都会让它失效；索引不写入持久存储。

语法（`parseSearchQuery`）：`title:`、`content:`、`tag:`、`category:`、`date:` 字段过滤，`AND / OR / NOT` 组合，以及日期范围。标签、分类、日期过滤在 Lunr 之外处理。

控制台在搜索之后再叠加分类筛选和标签筛选（点笔记卡片上的标签，多个标签需同时满足），最后排序。

### 5.2 语义搜索

- 控制台上的开关，偏好存在 `localStorage`，**默认关闭**。
- 开启后 `embeddings.worker.ts` 加载 `Xenova/paraphrase-multilingual-MiniLM-L12-v2`（多语言），模型只在首次开启时下载，进度通过 `onEmbeddingProgress` 回传。
- embedding 按笔记缓存（记录 `updatedAt`，只重算变化的笔记）；缓存按用户隔离，登录用户的缓存是 seal 过的。
- 查询向量与笔记向量做余弦相似度（阈值 0.5），关键词没命中的语义结果追加在列表末尾。
- 推理完全在本地。CSP 因此需要 `blob:` 和 `'wasm-unsafe-eval'`，原因见 [SECURITY.md](SECURITY.md#内容安全策略)。

## 6. 同步

WebDAV 和 OneDrive 都把**全部笔记**（包括回收站）存成远端的一个文件。填写了同步加密密钥时，文件内容是 `base64(salt‖iv‖AES-GCM 密文)`，密钥用 PBKDF2（SHA-256，250,000 次）派生；**没填就是明文 JSON**。

填了密钥后，遇到明文的远端文件（开启加密之前写的）仍会读取，并在这次同步里加密上传，即使合并没有改动任何笔记。同步基线记录远端上次是不是密文（`SyncBase.encrypted`）：一旦是密文，之后再遇到明文就中止同步。否则任何能写远端的人都可以换上一份明文，绕过 AES-GCM 的完整性校验，往本地注入笔记。确实要用本机笔记覆盖远端时，用“覆盖上传”。

### 6.1 三方合并

`storage/syncEngine.ts` 以**同步基线**为依据逐条合并。基线是上次同步成功时双方一致的状态，每条笔记记录一个摘要（`noteSyncHash`，只覆盖标题、正文、分类、标签、颜色、着色、删除标记，不含时间戳和派生字段）。

| 本地 vs 基线 | 远端 vs 基线 | 结果             |
| ------------ | ------------ | ---------------- |
| 未变         | 改了         | 取远端           |
| 改了         | 未变         | 取本地           |
| 改了         | 改了         | 冲突，按策略处理 |
| 未变         | 删除         | 两边删除         |
| 改了         | 删除         | 保留本地的修改   |
| 新增         | —            | 两边都加上       |

- 首次同步（没有基线）时取并集，不删除任何东西。
- 基线按“提供方 + 用户 + 远端文件”保存（`remoteId`），换了远端文件就重新开始。
- 不依赖设备时钟，删除能双向传播，不需要墓碑记录。
- **冲突策略**：WebDAV 可选 `manual`（默认，进入冲突列表由用户选择）、`prefer-local`、`prefer-remote`；OneDrive 用 `newest`（`updatedAt` 较新的一方）。自动解决时，输的一方存进赢家的版本历史。
- 有未解决冲突的笔记在同步时原样跳过，其余笔记照常同步。

### 6.2 一次同步

`NoteStorage.runSync()`：

1. 下载远端文件（`cache: 'no-store'`，见下文）。文件存在但**解不开或解析失败**时中止，绝不覆盖读不懂的远端。
2. 在写锁内做三方合并，保存本地结果，记录新的冲突。
3. 远端需要更新时**条件上传**：WebDAV 用 `If-Match`（新文件用 `If-None-Match: *`），服务器回 412 说明期间被别的设备改过；服务器不给 ETag 或只给弱 ETag（`W/"…"`，`If-Match` 永远匹配不上）时，上传前再下载一次比对。OneDrive 下载前先读文件元数据里的 `eTag`，上传前再读一次比对，并带上 `If-Match`（Graph 只在上传会话里写明支持它，所以前面的比对不能省）。
4. 冲突时从第 1 步重试，最多 3 次；成功后记录新基线。

所有同步请求都带 `cache: 'no-store'`。很多 WebDAV 服务器只给 `Last-Modified`、不给 `Cache-Control`，浏览器会按启发式规则直接拿缓存的旧文件应答 GET 和 HEAD；上传前的比对用的也是同一份旧文件，结果显示“没变”，于是覆盖掉别的设备刚上传的修改。

### 6.3 入口

| 界面操作                        | 实现                                                                    |
| ------------------------------- | ----------------------------------------------------------------------- |
| WebDAV“立即同步”、定时自动同步  | `syncWithWebDAVAsync`：双向合并                                         |
| WebDAV“更多操作 → 仅下载合并”   | `pullFromWebDAVAsync`：只合并到本机，不上传                             |
| WebDAV“更多操作 → 覆盖上传”     | `pushToWebDAVAsync`：用本机笔记覆盖远端，丢弃远端独有的修改，需二次确认 |
| OneDrive“立即同步 / 保存并同步” | `syncWithOneDriveAsync`：双向合并；配置有改动时先保存                   |

WebDAV 的自动同步设置（开关、间隔、冲突策略）在“保存配置”后交给 `webdavSyncManager` 生效。OneDrive 目前需要用户手动粘贴 Microsoft Graph 访问令牌，没有内置的微软账号登录流程。

## 7. 前端

### 7.1 页面

| 页面                                  | 作用                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------- |
| `index`                               | 首页：全屏首屏 + 功能、隐私、开始使用三个介绍区块                           |
| `dashboard`                           | 控制台：列表 / 日历 / 时间线 / 图谱视图、筛选、设备验证、同步，接收网页剪藏 |
| `models`                              | AI 模型接入（需登录且设备已解锁）                                           |
| `profile`                             | 编辑个人资料、推送订阅、管理公开笔记（仅本人）                              |
| `u/[userId]`、`u/[userId]/n/[noteId]` | 公开的个人主页和公开笔记阅读页                                              |
| `leaderboard`、`diejie`               | 排行榜与叠界迷宫                                                            |
| `admin`、`signin`                     | 管理后台（需管理员角色）、登录页；这两页服务端渲染，其余是静态页            |
| `privacy`、`terms`、`contact`         | 法律与支持页面；隐私政策和使用条款共用 `LegalPage` 布局                     |

### 7.2 应用外壳与初始化

`pages/_app.tsx`：

- 只有直接读写笔记存储的页面（`STORAGE_ROUTES`：`/dashboard`、`/models`）需要等存储就绪。这些页面先显示 `AppLoader`，同时动态加载 `lib/storage` 并调用 `enableIndexedDB()`；其他页面立即渲染，不受影响。
- 加载存储模块失败时，`AppLoader` 显示原因和“重新加载”，而不是一直转圈；超过 8 秒（`SLOW_INIT_MS`）未就绪时，提示可能的原因并提供重新加载。`enableIndexedDB()` 失败时存储退回 `localStorage`，页面照常可用。
- 主题：读取 `localStorage.theme` 和系统偏好，切换 `<html>` 上的 `dark` 类，并写入 `data-theme`。`AppLoader` 在首次绘制时还没有 `dark` 类，所以先按系统偏好显示深浅色，`data-theme="light"` 时不再跟随系统。
- 只在**生产环境**注册 Service Worker，见第 9 节。

### 7.3 控制台

| 组件                         | 职责                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Sidebar`                    | 搜索框（`/` 聚焦、`Esc` 清空）、语义搜索开关、排序、带计数的分类、统计；移动端排序 / 分类收进“筛选”      |
| `DashboardToolbar`           | 视图切换和“新建笔记”；回收站、冲突、标签管理、云端同步、导入导出、清空（需输入“清空”确认）收在“更多”菜单 |
| `NoteList`                   | 笔记卡片；点标签切换标签筛选；空状态区分“还没有笔记”和“没有匹配”                                         |
| `NoteEditor`                 | Markdown 编辑与预览、KaTeX、双链、文字着色、版本历史、发布 / 取消发布；有未保存的更改时关闭前确认        |
| `Calendar`、`Timeline`       | 按最后修改日期的热力图（点日期列出当天笔记）；按月、按天分组的时间线                                     |
| `KnowledgeGraph`             | 节点是笔记、边是 `[[双链]]`；节点多时按重要度做 LOD 裁剪，力导向布局绘制到 Canvas，布局稳定后停止动画    |
| `TagManager`                 | 标签云与列表、重命名、删除、按“带有所选标签的笔记”批量增删标签                                           |
| `Conflicts`、`Trash`         | 同步冲突逐条选择；回收站                                                                                 |
| `WebDAVSync`、`OneDriveSync` | 同步设置面板；结果在面板内提示                                                                           |

编辑器打开时记录内容快照，以此判断有没有未保存的更改；标签输入框保留原始文本，只在解析出的标签变化时回写，所以能正常输入逗号。

### 7.4 网页剪藏

```
扩展：提取整页 / 选中文本 / 文章正文（≤ 100,000 字符）
  → JSON → base64url → 打开 <应用>/dashboard#qcnote-clip=...   （hash 不发往服务器）
控制台读取并清除 hash → clipImport.ts 用 zod 校验
  → 等待会话就绪（登录用户需完成设备验证）
  → ClipImportDialog 预览 → 用户确认后才保存
```

任何链接都能带这个 hash，所以它被当作不可信输入。

## 8. 后端

### 8.1 路由

`server/index.ts` 是入口，路由在 `server/routes/`：

| 文件             | 路由                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `core.ts`        | `GET /api/health`、`GET /api/sitemap.xml`                                                                                                     |
| `device.ts`      | `POST /api/device/session/create`、`/api/device/session/validate`、`/api/vault/key`                                                           |
| `ugc.ts`         | 用户资料与公开笔记，见 8.2                                                                                                                    |
| `leaderboard.ts` | `GET /api/ugc/leaderboard/:type`、`/api/ugc/leaderboard/maze`；`POST /api/ugc/maze/start`、`/api/ugc/maze/submit`（服务端出题、回放走法计分） |
| `push.ts`        | `/api/push/subscribe`、`/unsubscribe`、`/broadcast`、`GET /api/push/stats`                                                                    |
| `admin.ts`       | `/api/admin/users`、`/roles`、`/set-admin`、`POST /api/admin/users/:userId/public-suspension`                                                 |

其他文件：`ugc-service.ts`（资料、设备、金库密钥、排行榜）、`push-service.ts`（VAPID，见 [VAPID_SETUP.md](VAPID_SETUP.md)）、`public-notes.ts`（公开笔记校验）、`session.ts`（从 NextAuth JWT Cookie 解析用户）、`check-admin.ts` / `set-admin.ts`。`postinstall.js` 可通过 `ADMIN_SET_EMAIL` 引导管理员。

用户资料：用户名 1–100 个字符，简介最多 1000 个字符，头像为 http(s) 地址或空字符串（空表示清除头像，前端显示首字母）。

迷宫排行榜：分数为 `1,000,000 − (步数 × 1000 + 秒数)`，即步数少者优先、步数相同比用时；按 UTC+8 的自然日分榜。

### 8.2 公开笔记

公开笔记是用户主动发布到服务器的一份**明文快照**，展示在个人主页。

- **数据**：`public_notes` 表，`(user_id, local_note_id)` 唯一；`id` 是独立的随机值，公开链接不暴露本地笔记 ID。只保存标题、正文、标签、文字着色。`source_updated_at` 记录发布时本地笔记的 `updatedAt`，控制台据此提示“有更新”。
- **限制**（`server/public-notes.ts`）：标题 ≤ 200 字符，正文 ≤ 100KB，标签 ≤ 20 个，每人最多 100 篇。
- **接口**：

  | 方法与路径                                          | 说明                                        | 权限       |
  | --------------------------------------------------- | ------------------------------------------- | ---------- |
  | `PUT /api/ugc/notes/public/:localNoteId`            | 发布 / 更新                                 | 登录       |
  | `POST /api/ugc/notes/public/:localNoteId/unpublish` | 取消发布，删除副本                          | 登录       |
  | `POST /api/ugc/notes/public/unpublish-all`          | 全部取消（清空所有笔记时用）                | 登录       |
  | `GET /api/ugc/notes/public`                         | 我已发布的笔记                              | 登录       |
  | `GET /api/ugc/public/user/:userId/notes`            | 某用户的公开笔记列表                        | 匿名，限流 |
  | `GET /api/ugc/public/notes/:id`                     | 单篇公开笔记                                | 匿名，限流 |
  | `POST /api/admin/public-notes/:id/remove`           | 管理员下架（删除副本）                      | 管理员     |
  | `POST /api/admin/users/:userId/public-suspension`   | 关闭 / 恢复某用户的主页和公开笔记（不删除） | 管理员     |

  取消发布用 POST，因为前端代理只放行 GET / POST / PUT。

- **关闭主页与公开笔记**：管理员可以在管理员面板的“管理用户”里关闭某个用户的个人主页和公开笔记。关闭**不删除任何数据**，`public_notes` 原样保留，作为证据；它记录在 `public_suspensions` 表（原因、操作人、关闭时间），解除即删除该行。关闭期间：
  - 主页、公开笔记列表、单篇公开笔记对外一律返回 `403`（`code: profile_closed`），前端显示“该主页已被关闭”；
  - 作者本人发布、更新发布、取消发布、全部取消发布一律返回 `403`（`code: public_suspended`），控制台和个人资料页的对应按钮置灰并说明原因；本地删除笔记不受影响，也不再询问是否取消发布；
  - `GET /api/ugc/notes/public` 额外返回 `suspension`（关闭时间和原因，不含操作人）。

  注销账号会级联删除该用户的全部数据，包括被保留的公开笔记。

- **与本地删除的关系**：删除本地笔记不会自动取消发布；控制台在“删除”“永久删除”“清空所有笔记”涉及已公开笔记时会询问，取消发布失败则中止删除。备份不含发布状态，导入的笔记不会自动公开。
- **安全**：服务端逐项校验着色范围并丢弃不安全的颜色，渲染端使用 `rehype-sanitize`；两个公开页面带 `noindex`，在客户端渲染。

### 8.3 数据库与缓存

- **PostgreSQL**：用户资料与当前有效的登录会话 ID（`users`）、角色（`user_roles`）、推送订阅（`push_subscriptions`）、金库密钥（`user_vault_keys`）、公开笔记（`public_notes`）、主页关闭记录（`public_suspensions`）、迷宫成绩（`maze_submissions`）。表都由后端在启动或首次使用时自动创建（`server/postgres-client.ts`）。
- **Redis**：用户资料缓存（`user:{userId}:profile`）和排行榜（`leaderboard:{type}`、`leaderboard:maze:{day}`）。会话由 NextAuth 的 JWT Cookie 承载，不存 Redis。
- 生产环境缺少 `DATABASE_URL`、`REDIS_URL` 或 `VAULT_MASTER_KEY` 时后端拒绝启动；开发环境回退到内存 mock 和仅供开发的默认密钥。

### 8.4 认证

`next-auth` 负责 Google / GitHub / Discord OAuth 和会话，Cookie 配置见 [SECURITY.md](SECURITY.md#cookie)。Fastify 后端用同一个 `NEXTAUTH_SECRET` 解析会话 Cookie。授权基于角色（`user` / `admin`），后端用 `requireAdmin` 保护管理接口。

## 9. PWA 与离线

| 文件                          | 作用                                                                       |
| ----------------------------- | -------------------------------------------------------------------------- |
| `public/manifest.webmanifest` | 名称、图标（含 maskable）、`standalone`，起始页 `/`，快捷入口 `/dashboard` |
| `public/service-worker.js`    | 缓存策略和推送                                                             |
| `public/offline.html`         | 既没网络也没缓存时的兜底页                                                 |

`_app.tsx` 只在**生产环境**注册 Service Worker；开发环境会注销已有的 SW（开发模式的 chunk 没有内容哈希，缓存会拿到旧代码）。

缓存策略（只处理同源 GET）：

| 请求                                | 策略                                                    |
| ----------------------------------- | ------------------------------------------------------- |
| `/_next/static/*`                   | cache-first（文件名带内容哈希）                         |
| 页面导航                            | network-first，离线时用缓存页面，再退到 `/offline.html` |
| `/images/*`                         | stale-while-revalidate                                  |
| `/api/`、`/admin`、`/signin`、`/u/` | 不缓存                                                  |

- 笔记在 IndexedDB 里，不经过 Service Worker；PWA 补的是“应用外壳也能离线打开”。页面访问过一次才会被缓存。
- 登录用户离线时拿不到 KEK，笔记库会处于锁定状态，恢复联网后自动解锁；离线读写完整可用的是访客模式。
- 修改缓存策略时递增 `CACHE_VERSION`；`next.config.mjs` 给 `/service-worker.js` 设了 `no-cache`。
- 点击推送通知会聚焦或打开 `/dashboard`。

## 10. 性能

- 路由级代码分割；`PushNotificationPrompt` 用 `next/dynamic` 按需加载；存储层（含 Lunr）只在 `/dashboard`、`/models` 加载；语义搜索的模型和 Worker 只在开启后加载。
- 搜索索引在内存中缓存，笔记不变时复用；embedding 持久缓存，只重算变化的笔记。
- 加解密在 Worker 中进行，不阻塞界面。
- 知识图谱按设备像素比绘制，布局稳定约 180 帧后停止动画，之后只在悬停、点击、尺寸或主题变化时重绘。
- 后端：PostgreSQL 连接池、Redis 缓存资料、`@fastify/rate-limit` 限流。

## 11. 测试与持续集成

- **单元测试**（Vitest + jsdom + `fake-indexeddb`，`test/`）：存储完整性（`storage-integrity`）、静态加密（`encryption-at-rest`：写入带标记的内容后导出全部 IndexedDB 和 `localStorage`，确认找不到标记）、同步引擎（`syncEngine`：合并规则表 + 两台设备对接内存 WebDAV 服务器）、剪藏解析、公开笔记、推送、安全加固、限流等。`vitest.config.ts` 目前排除了 `Calendar`、`KnowledgeGraph`、`NoteList` 三个过时的组件测试。
- **E2E**（Playwright + axe-core，`e2e/`）：首页、控制台主要流程，以及首页和控制台没有 critical 级的无障碍问题。
- **CI**（`.github/workflows/ci.yml`）：前后端 `npm audit`（高危）、lint、`tsc --noEmit`、单元测试、生产构建；E2E 是独立任务。
- **Lighthouse CI**（`lighthouse.yml`）：性能低于 0.9 报错，无障碍低于 0.9 警告。
- **公共依赖版本一致**：CI 里运行 `syncpack lint`（配置在 `.syncpackrc.json`），前后端共用依赖版本不一致就失败；本地用 `npm run deps:fix` 自动修正。Dependabot 用 `group-by: dependency-name` 跨目录分组，把同名依赖在前后端的升级合并成一个 PR。
- 提交前 husky 运行 lint-staged（ESLint + Prettier）。

## 12. 技术栈

以 `package.json` 和 `server/package.json` 为准：Node.js ≥ 20.9（CI 用 24）、Next.js 16（Pages Router，Turbopack）、React 19、TypeScript 5、Tailwind CSS 4、Lunr 2、KaTeX、`@huggingface/transformers` 4、next-auth 4、zod 4、Fastify 5。

## 13. 已知限制

- 金库密钥由服务端托管，不是端到端加密。
- 每个账号同时只能登记一台设备。
- 登录用户离线时无法解锁笔记库。
- OneDrive 需要手动粘贴访问令牌。
- 同步文件不填加密密钥时是明文。
- 主题在 JS 运行后才设置，深色模式用户首次加载页面时会短暂看到浅色（CSP 不允许内联脚本，需要单独的阻塞脚本才能消除）。

可能的方向：应用内安装入口与 Service Worker 更新提示、后台同步（Background Sync）、端到端加密、多设备登记、OneDrive OAuth、协作编辑。
