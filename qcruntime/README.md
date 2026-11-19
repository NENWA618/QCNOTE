# QCRuntime

QCNOTE 的浏览器存储运行时：在 Web Worker 里管理 IndexedDB，并对指定字段做 AES-GCM 加密。

它只提供“带加密的键值 / 记录存储”，**不关心笔记的结构，也不涉及界面**。笔记相关的规则（哪些字段加密、怎样读改写、命名空间）都在 `lib/storage.ts` 的 `NoteStorage` 里。它在整体架构中的位置、密钥从哪里来，见 [docs/ARCHITECTURE.md 第 4 节](../docs/ARCHITECTURE.md#4-密钥与设备)。

| 文件                       | 作用                                                                  |
| -------------------------- | --------------------------------------------------------------------- |
| `qcnote-runtime.ts`        | 主线程入口：启动 Worker、RPC、`QCRuntime.open` / `drop`、`QCDb`、诊断 |
| `qcnote-runtime.worker.ts` | Worker 实现：IndexedDB 操作、密钥管理、加解密、查询、TTL              |

## 快速上手

```ts
import { QCRuntime, type QCStoreSchema } from './qcnote-runtime';

const schemas: QCStoreSchema[] = [
  {
    name: 'notes',
    keyField: 'id',
    keyAuto: false,
    fields: [
      { name: 'id', type: 'str', indexed: true, secret: false },
      { name: 'title', type: 'str', indexed: false, secret: true },
      { name: 'tags', type: 'json', indexed: false, secret: true },
    ],
  },
];

const db = await QCRuntime.open('QCNOTE_NOTES_DB_<userId>', schemas, 1, sessionToken, kekBytes);

await db.put('notes', { id: 'n1', title: '标题', tags: ['a'] });
const note = await db.getById('notes', 'n1'); // secret 字段已解密
await db.close();
```

字段类型：`str`、`num`、`bool`、`json`、`bin`、`date`。

## 打开数据库与选择密钥

签名：`QCRuntime.open(name, schemas, version = 1, sessionToken?, kekBytes?)`。

用哪把密钥由库名和传入的参数决定：

| 情况                             | 行为                                                                 |
| -------------------------------- | -------------------------------------------------------------------- |
| 库名以 `_GUEST` 结尾             | 访客库：不加密，不需要任何密钥                                       |
| 传入 `kekBytes` + `sessionToken` | **金库方案**：用 KEK 解包本库的 DEK；还没有 DEK 时生成一把并包裹保存 |
| 以上都不满足                     | 抛错，且不会打开任何 IndexedDB 连接                                  |

所有抛错都发生在打开 IndexedDB 连接**之前**，避免留下未关闭的连接，卡住之后的 `open` / `deleteDatabase`。

删除整个库及其元数据库：`QCRuntime.drop(name)`。

## QCDb

| 方法                                     | 说明                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `put`、`getById`、`get`、`find`、`count` | 写入时加密 secret 字段，读取时解密                                      |
| `bulkWrite(store, puts, deleteKeys)`     | 所有 put 和 delete 在**一个**读写事务里完成，要么全部生效，要么全不生效 |
| `deleteById`、`delete`、`clear`          | 删除                                                                    |
| `seal(value)`、`unseal(sealed)`          | 用本库的 DEK 加密 / 解密任意 JSON 值；库没有密钥（访客库）时抛错        |
| `purgeExpired()`                         | 清理过期记录，见 [TTL](#ttl)                                            |
| `close()`                                | 关闭连接                                                                |

```ts
await db.bulkWrite('notes', [note1, note2], ['n3']); // 一个事务内 put 两条、删一条
const list = await db.find('notes', { where: { field: 'id', op: 'in', value: ['n1', 'n2'] } });

const sealed = await db.seal({ any: 'json' });
const value = await db.unseal(sealed);
```

### 条件查询

`where` 支持 `=`、`!=`、`<`、`<=`、`>`、`>=`、`~=`（字符串包含）、`between`、`in`，可以用 `{ and: [...] }`、`{ or: [...] }`、`{ not: ... }` 组合；另有 `limit` 和 `sort`。

`where` 和 `sort` 作用在**存储中的原始记录**上：先筛选、排序，再解密返回。因此 secret 字段存的是密文，**不能用作查询或排序条件**，给它建索引也没有意义。需要按内容筛选时，取出全部记录后在调用方过滤（`NoteStorage` 就是这样做的）。

### TTL

在 `QCStoreSchema.ttl` 上设置有效期（如 `"7d"`、`"1h"`、`"30m"`），写入时会给记录加上 `_expires`；调用 `purgeExpired()` 清理过期记录。

## 加密

- 只加密 `secret: true` 的字段，值可以是任意 JSON（字符串、数组、对象、数字）。
- 密文格式：`base64(12 字节 IV) + '.' + base64(密文 + 16 字节 GCM 标签)`。`isEncryptedFieldValue()` 只认这个精确格式，避免把 `readme.md` 这类普通文本误判为密文。
- **无法解密的记录**：secret 字段是密文却解不开时，整条记录会去掉所有 secret 字段，带上 `_undecryptable: true`（常量 `UNDECRYPTABLE_MARKER`）返回。调用方应跳过这些记录，**不要写回**，否则密文会被当成正文显示、同步，甚至被二次加密。
- **明文字段加密**：schema 新增了 secret 字段时，打开库会把这些字段里的明文一次性加密。完成时的 secret 字段集合记录在元数据里，集合不变就不会重复扫描。过程分三步：读出 → 在事务外加密 → 开新事务写回，因为 Chrome 会在等待 SubtleCrypto 期间自动提交空闲的事务。

**DEK 或 KEK 丢失后，secret 字段无法恢复。**

## 元数据库

每个库有一个对应的元数据库 `<库名>__qcnote_meta__`：

| 键             | 内容                                              |
| -------------- | ------------------------------------------------- |
| `wrappedDEK`   | 被 KEK 包裹的 DEK（`base64(iv).base64(wrapped)`） |
| `secretFields` | 上次完成明文字段加密时的 secret 字段集合          |

## Worker 与 RPC

主线程通过以下请求与 Worker 通信：

| 请求       | 作用                              |
| ---------- | --------------------------------- |
| `open`     | 打开数据库，返回 `QCDb` 的句柄 id |
| `drop`     | 删除数据库及其元数据库            |
| `dbMethod` | 调用 `QCDb` 上的方法              |
| `status`   | 查询加密状态（诊断用）            |

浏览器不支持 Web Worker 时，运行时会在主线程动态导入 Worker 模块，用 `handleWorkerRequest()` 执行同一套逻辑，对调用方透明。

## 诊断

`window.QCNOTE_RUNTIME_DEBUG` 上有几个排查用的方法：

| 方法                               | 作用                                     |
| ---------------------------------- | ---------------------------------------- |
| `inspect(name)`                    | 库是否有密钥、是否为访客库               |
| `listSuspiciousLocalStorageKeys()` | 列出名字像密钥或盐值的 `localStorage` 键 |
| `isEncryptedFieldValue(value)`     | 判断字符串是否是加密字段的格式           |
