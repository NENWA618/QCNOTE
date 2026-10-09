# QCRuntime

QCNOTE 的浏览器存储运行时：在 Worker 里管理 IndexedDB，并对指定字段做 AES-GCM 加密。它不关心笔记结构，也不涉及界面，笔记相关的规则都在 `lib/storage.ts`。

在整体架构中的位置、密钥从哪里来，见 [docs/ARCHITECTURE.md 第 4 节](../docs/ARCHITECTURE.md#4-运行时与密钥)。

## 文件

| 文件                       | 作用                                                                  |
| -------------------------- | --------------------------------------------------------------------- |
| `qcnote-runtime.ts`        | 主线程入口：启动 Worker、RPC、`QCRuntime.open` / `drop`、`QCDb`、诊断 |
| `qcnote-runtime.worker.ts` | Worker 实现：IndexedDB 操作、密钥管理、加解密、查询、TTL、数据迁移    |

## 打开数据库

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

const db = await QCRuntime.open(
  'QCNOTE_NOTES_DB_<userId>',
  schemas,
  1,
  undefined,
  sessionToken,
  kekBytes,
);
```

签名：`open(name, schemas, version = 1, secret?, sessionToken?, kekBytes?)`。用哪把密钥由库名和参数决定：

| 情况                                      | 行为                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| 库名以 `_GUEST` 结尾                      | 不加密，不需要任何密钥                                                              |
| 传入 `kekBytes` + `sessionToken`          | **金库方案**（应用实际使用的路径）：用 KEK 解包本库的 DEK，没有则生成一把并包裹保存 |
| 只有 `sessionToken`，本库已有旧版本地密钥 | 用旧密钥打开（离线时还没迁移到金库方案的库），不会生成新密钥                        |
| 传入 `secret` + `sessionToken`            | 旧的口令方案（v1），应用不再使用，只为测试 v1 → 金库迁移而保留；不校验口令是否正确  |
| 以上都不满足                              | 抛错，且不会打开任何 IndexedDB 连接                                                 |

所有抛错都发生在打开 IndexedDB 连接之前，避免留下未关闭的连接卡住之后的 `open` / `deleteDatabase`。

字段类型：`str`、`num`、`bool`、`json`、`bin`、`date`。

## QCDb

```ts
await db.put('notes', { id: 'n1', title: '标题', tags: ['a'] });
await db.bulkWrite('notes', [note1, note2], ['n3']); // 一个事务内 put 两条、删一条
const one = await db.getById('notes', 'n1');
const list = await db.find('notes', { where: { field: 'id', op: 'in', value: ['n1', 'n2'] } });

const sealed = await db.seal({ any: 'json' }); // 用本库的 DEK 加密任意 JSON 值
const value = await db.unseal(sealed);

await db.close();
```

| 方法                                     | 说明                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `put`、`getById`、`get`、`find`、`count` | 写入时加密 secret 字段，读取时解密                                    |
| `bulkWrite(store, puts, deleteKeys)`     | 所有 put 和 delete 在**一个**读写事务里完成，要么全部生效要么全不生效 |
| `deleteById`、`delete`、`clear`          | 删除                                                                  |
| `seal(value)`、`unseal(sealed)`          | 用本库密钥加密 / 解密任意 JSON 值；库没有密钥（访客库）时抛错         |
| `purgeExpired`                           | 清理过期记录（见 TTL）                                                |
| `close`                                  | 关闭连接                                                              |

删除整个库及其元数据库：`QCRuntime.drop(name)`。

### 条件查询

`where` 支持 `=`、`!=`、`<`、`<=`、`>`、`>=`、`~=`（字符串包含）、`between`、`in`，可用 `{ and: [...] }`、`{ or: [...] }`、`{ not: ... }` 组合；另有 `limit` 和 `sort`。

`where` 和 `sort` 作用在**存储中的原始记录**上，先筛选、排序，再解密返回。所以 secret 字段存的是密文，**不能用作查询或排序条件**，给它建索引也没有意义；需要按内容筛选时，取出全部记录后在调用方过滤（`NoteStorage` 就是这样做的）。

### TTL

`QCStoreSchema.ttl`（如 `"7d"`、`"1h"`、`"30m"`）会在写入时给记录加上 `_expires`；调用 `purgeExpired()` 清理过期记录。

## 加密

- 只加密 `secret: true` 的字段，值可以是任意 JSON（字符串、数组、对象、数字）。密文格式：`base64(12 字节 IV) + '.' + base64(密文 + 16 字节 GCM 标签)`。
- `isEncryptedFieldValue()` 只认上述精确格式，避免把 `readme.md` 这类普通文本误判为密文。
- **无法解密的记录**：secret 字段是密文却解不开时，整条记录会去掉所有 secret 字段，并带上 `_undecryptable: true`（常量 `UNDECRYPTABLE_MARKER`）返回。调用方应跳过这些记录且不要写回，否则密文会被当成正文显示、同步，甚至被二次加密。
- **明文字段迁移**：schema 新增了 secret 字段，或旧版本没加密过某些 JSON 值时，打开库会把这些明文一次性加密。迁移时的 secret 字段集合记录在元数据里，集合不变就不会重复扫描。
- **金库迁移**：v1 库拿到 KEK 后会把所有记录从旧密钥重新加密到 DEK。迁移分三步（读出 → 无事务时加解密 → 新事务写回），因为 Chrome 会在 SubtleCrypto 等待期间自动提交空闲事务。迁移可中断、可重跑；两把密钥都解不开的记录保持原样。

**DEK 或 KEK 丢失后，secret 字段无法恢复。**

## 元数据库

每个库有一个对应的元数据库 `<库名>__qcnote_meta__`，保存：

| 键                  | 内容                                              |
| ------------------- | ------------------------------------------------- |
| `wrappedDEK`        | 被 KEK 包裹的 DEK（`base64(iv).base64(wrapped)`） |
| `encryptionVersion` | `1` 旧方案，`2` 金库方案                          |
| `secretFields`      | 上次完成明文字段迁移时的 secret 字段集合          |
| `salt`              | v1 方案的 PBKDF2 盐值                             |
| `cryptoKey`         | v1 方案在本机持久化的密钥（迁移完成后不再使用）   |

更早版本把盐值存在 `localStorage`（`qcnote:<库名>:salt`），打开时会迁移进元数据库并清理 `localStorage` 里的旧密钥相关键。

## Worker 与 RPC

| 请求                 | 作用                                       |
| -------------------- | ------------------------------------------ |
| `open`               | 打开数据库，返回 `QCDb` 的句柄 id          |
| `drop`               | 删除数据库及其元数据库                     |
| `dbMethod`           | 调用 `QCDb` 上的方法                       |
| `status`             | 查询加密状态（诊断用）                     |
| `migrateLegacySalts` | 把 `localStorage` 里的旧盐值迁移进元数据库 |

浏览器不支持 Web Worker 时，运行时在主线程动态导入 Worker 模块，用 `handleWorkerRequest()` 执行同一套逻辑，对调用方透明。

## 诊断

`window.QCNOTE_RUNTIME_DEBUG` 上有几个排查用的方法：

| 方法                               | 作用                                                                  |
| ---------------------------------- | --------------------------------------------------------------------- |
| `inspect(name)`                    | 库是否有密钥、盐值、加密方案版本（`encryptionVersion`）、是否为访客库 |
| `listSuspiciousLocalStorageKeys()` | 列出名字像密钥或盐值的 `localStorage` 键                              |
| `getStoredSalt(name)`              | 读取 `localStorage` 里的旧盐值                                        |
| `isEncryptedFieldValue(value)`     | 判断字符串是否是加密字段格式                                          |
