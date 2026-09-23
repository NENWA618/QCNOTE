# QCNOTE 运行时说明

`qcruntime/` 是 QCNOTE 的浏览器运行时引擎，负责在浏览器环境中安全地管理客户端存储与加密数据。它不是普通业务组件，而是提供：

- Worker 沙箱数据库访问
- IndexedDB 存储层
- 字段级 AES-GCM 加密/解密
- 元数据与密钥管理
- 兼容旧盐值迁移

## 核心文件

| 文件                       | 作用                                                       |
| -------------------------- | ---------------------------------------------------------- |
| `qcnote-runtime.ts`        | 运行时入口：Worker 启动、RPC 调用、数据库打开、诊断接口    |
| `qcnote-runtime.worker.ts` | Worker 实现：IndexedDB 操作、加密逻辑、`QCDb` 的 CRUD 方法 |

## 设计目标

1. **隔离敏感操作**：数据库与加密逻辑在 Worker（或不支持 Worker 时的内联进程）中执行，避免阻塞主线程
2. **字段级加密**：只对标记为 `secret` 的字段加密，在保护敏感内容的同时降低性能开销
3. **兼容浏览器存储**：默认使用 IndexedDB，必要时回退并兼容历史盐值
4. **简单 API**：前端只需通过 `QCRuntime.open()` 和 `QCDb` 方法访问数据

## 使用方法

### 打开数据库

```ts
import { QCRuntime, QCStoreSchema } from './qcnote-runtime';

const schemas: QCStoreSchema[] = [
  {
    name: 'notes',
    keyField: 'id',
    keyAuto: false,
    fields: [
      { name: 'id', type: 'str', indexed: true, secret: false },
      { name: 'title', type: 'str', indexed: true, secret: true },
      { name: 'content', type: 'str', indexed: false, secret: true },
      { name: 'tags', type: 'json', indexed: false, secret: false },
    ],
  },
];

const db = await QCRuntime.open('QCNOTE_NOTES_DB_USER_123', schemas, 1, 'user-secret-key');
```

完整签名为 `open(name, schemas, version = 1, secret?, sessionToken?, kekBytes?)`；后两个可选参数供登录用户的金库密钥（KEK）流程使用，纯本地/访客场景可省略。

### 数据操作

```ts
await db.put('notes', { id: 'note-1', title: '测试', content: '内容', tags: ['tag1'] });
const note = await db.getById('notes', 'note-1');
const list = await db.find('notes', { where: { field: 'tags', op: 'in', value: ['tag1'] } });
await db.deleteById('notes', 'note-1');
await db.close();
```

## 关键特性

### AES-GCM 字段加密

- 对 schema 中 `secret: true` 的字段用 AES-GCM 加密，加密值格式为 `base64(iv) + '.' + base64(ciphertext)`
- 密钥由 PBKDF2（SHA-256，250,000 次迭代）从用户提供的 secret 派生
- 加密密钥可以被 Worker 持久保存，用于同一设备上的自动解密

### Worker RPC 架构

`qcnote-runtime.ts` 与 Worker 之间通过 RPC 通信：

| 请求                 | 作用                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| `open`               | 打开数据库并创建 `QCDb` 实例                                         |
| `drop`               | 删除数据库及其元数据                                                 |
| `dbMethod`           | 执行 `put/get/find/count/deleteById/delete/clear/purgeExpired/close` |
| `status`             | 检查加密状态                                                         |
| `migrateLegacySalts` | 迁移旧盐值到新元数据库                                               |

若浏览器不支持 Web Worker，运行时会用内联的 `handleWorkerRequest()` 直接执行同一套逻辑，行为对调用方透明。

### 元数据库和盐值管理

- 独立的元数据库 `__qcnote_meta__` 保存盐值和持久化的 `cryptoKey`，不与业务数据混合
- 运行时启动时会自动检查旧版 `localStorage` 中的盐值，并迁移到元数据库
- 访客数据库（名称以 `_GUEST` 结尾）被识别为明文或未知加密状态

### 运行时诊断接口

运行时会在 `window.QCNOTE_RUNTIME_DEBUG` 上暴露诊断方法：

| 方法                               | 作用                                               |
| ---------------------------------- | -------------------------------------------------- |
| `inspect(name)`                    | 检查数据库是否拥有 cryptoKey、盐值以及加密通道状态 |
| `listSuspiciousLocalStorageKeys()` | 列出可能泄露密钥或盐值的 localStorage 键           |
| `getStoredSalt(name)`              | 读取本地存储的旧盐值                               |
| `isEncryptedFieldValue(value)`     | 判断字符串是否符合加密字段格式                     |

## 结构概览

**`qcnote-runtime.ts`**

- 定义 `QCFieldSchema` 和 `QCStoreSchema`
- 管理 Worker 连接与请求队列
- 提供 `QCDb` 封装类，前端直接调用数据库方法
- 提供加密诊断和旧盐迁移工具

**`qcnote-runtime.worker.ts`**

- 负责实际 IndexedDB 操作和数据库升级
- 实现 `QCDb` 类：`put()` 写入并对 secret 字段加密；`getById()` / `get()` / `find()` 读取并解密；`deleteById()` / `delete()` / `clear()` 删除；`purgeExpired()` 删除 TTL 过期记录
- 用 `evalWhere()` 执行条件查询，支持的运算符：`=`、`!=`、`<`、`<=`、`>`、`>=`、`~=`（字符串包含）、`between`、`in`
- 管理 `QCDb` 实例生命周期

## 设计细节

**字段级加密**：仅对 schema 中 `secret: true` 的字段加密，敏感内容受保护的同时，非敏感字段仍可按索引查询，兼顾性能与安全。

**TTL 支持**：`QCStoreSchema` 支持 `ttl` 字段（如 `"7d"`、`"1h"`、`"30m"`），写入时自动添加 `_expires` 元字段，`purgeExpired()` 可定期清理过期记录。

**兼容性处理**：不支持 Worker 的浏览器直接走内联执行路径；旧版 localStorage 中的加密盐值会被兼容读取，避免升级后丢失数据。

## 注意事项

- 运行时仅提供浏览器端存储能力，不负责业务层笔记结构或 UI 逻辑
- `secret` 字段加密依赖正确的 secret 值；密钥一旦丢失，相关字段无法恢复
- 访客数据库默认不强制加密，登录后迁移到用户数据库时需谨慎处理

## 结论

`qcruntime/` 是 QCNOTE 安全存储与浏览器运行时的核心，把复杂的 IndexedDB 和加密逻辑封装成一致的 API，并用 Worker 隔离执行，让应用在提供丰富功能的同时保持本地数据保护和可维护性。
