# 部署与配置

QCNOTE 由两部分组成：

- **前端**：Next.js 应用（仓库根目录）。单独运行时就是一个完整可用的访客模式笔记应用。
- **后端**（可选）：`server/` 下的 Fastify 服务，依赖 PostgreSQL 和 Redis。登录、登录用户的加密存储、个人主页、排行榜、推送、管理后台都靠它。

前端的 `pages/api/*` 会把请求代理到 `BACKEND_URL`。没有配置后端时，这些功能会隐藏或降级，写笔记不受影响。

- [本地开发](#本地开发)
- [环境变量](#环境变量)
- [部署方式](#部署方式)
- [上线前检查](#上线前检查)
- [运维](#运维)

## 本地开发

需要 Node.js 20.9+（CI 用 22）和 npm。

### 只运行前端

```bash
git clone https://github.com/NENWA618/QCNOTE.git
cd QCNOTE
npm install
npm run dev
```

打开 <http://localhost:3000>，不用任何配置就能以访客身份写笔记。

Service Worker（安装为应用、离线、推送）只在生产构建中注册。要测试这些功能，运行 `npm run build && npm run start`。

### 加上后端

1. **前端**：复制 [`.env.example`](../.env.example) 为 `.env.local`，至少填：

   ```bash
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=<openssl rand -base64 32>
   BACKEND_URL=http://localhost:10000
   ```

2. **后端**：`server/` **不读取** `.env.local`，变量要由 shell 或部署平台注入：

   ```bash
   export NEXTAUTH_URL=http://localhost:3000
   export NEXTAUTH_SECRET=<与前端相同>
   export DATABASE_URL=postgresql://user:password@localhost:5432/qcnote
   export REDIS_URL=redis://localhost:6379
   export VAULT_MASTER_KEY=<openssl rand -base64 32>

   cd server && npm install && npm run dev   # 默认端口 10000
   ```

   也可以在仓库根目录运行 `npm run start-server`。

开发环境（`NODE_ENV=development`）下：

- 没设置 `DATABASE_URL`、`REDIS_URL` 时，后端改用内存 mock；没设置 `VAULT_MASTER_KEY` 时用固定的开发密钥并打印警告。
- 没配置任何 OAuth 时，可以用内置的 `test` 账号登录。这个登录方式在其他环境一律拒绝。

## 环境变量

完整说明和示例值见 [`.env.example`](../.env.example)。

### 前端

| 变量                                | 必需         | 说明                                                                                                 |
| ----------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| `NEXTAUTH_URL`                      | 是           | 站点地址，OAuth 回调以它为准                                                                         |
| `NEXTAUTH_SECRET`                   | 生产环境必需 | 签名登录会话。生产环境下缺失、短于 16 个字符或是已知的默认值时，应用拒绝启动                         |
| `BACKEND_URL`                       | 使用后端时   | 后端地址，`pages/api/*` 代理到这里                                                                   |
| `DEVICE_SESSION_SECRET`             | 建议         | 签名设备会话令牌；未设置时回退到 `NEXTAUTH_SECRET`                                                   |
| `FRONTEND_TRUST_PROXY_HOPS`         | 否           | 前端前面有几层反向代理，用于取转发给后端的客户端 IP。Vercel 上默认 1，其他环境默认 0；宁少勿多       |
| `GOOGLE_*`、`GITHUB_*`、`DISCORD_*` | 否           | 各 OAuth 提供方的 `CLIENT_ID` / `CLIENT_SECRET`，回调地址为 `<站点>/api/auth/callback/<提供方>`      |
| `NEXT_PUBLIC_VAPID_PUBLIC`          | 推送         | 推送公钥，**构建时**写入前端代码，修改后要重新构建，见 [VAPID_SETUP.md](VAPID_SETUP.md)              |
| `LOG_ENDPOINT`                      | 否           | 设置后日志额外 POST 到该地址                                                                         |
| `ENABLE_SOURCE_MAPS`                | 否           | 设为 `true` 时生产构建输出浏览器 source map                                                          |
| `TWA_SHA256_CERT_FINGERPRINTS`      | Android App  | 安卓 App 签名证书的 SHA-256 指纹，逗号分隔；用于 `/.well-known/assetlinks.json`，见 [TWA.md](TWA.md) |
| `TWA_PACKAGE_NAME`                  | 否           | 安卓 App 包名，默认 `com.qcnote.app`                                                                 |

### 后端

| 变量                              | 必需         | 说明                                                                                                                         |
| --------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `NEXTAUTH_URL`、`NEXTAUTH_SECRET` | 是           | 与前端**相同**，后端用它解析登录会话 Cookie                                                                                  |
| `DATABASE_URL`                    | 生产环境必需 | PostgreSQL 连接串                                                                                                            |
| `REDIS_URL`                       | 生产环境必需 | Redis 连接串（也可用 `REDIS_CONNECTION_STRING`）                                                                             |
| `VAULT_MASTER_KEY`                | 生产环境必需 | base64 编码的 32 字节（`openssl rand -base64 32`），加密每个用户的金库密钥。**丢失或更换后，所有登录用户都无法解锁已有笔记** |
| `DEVICE_SESSION_SECRET`           | 建议         | 与前端相同；未设置时回退到 `NEXTAUTH_SECRET`                                                                                 |
| `PORT`、`HOST`                    | 否           | 监听端口（默认 10000，也可用 `REDIRECT_PORT`）和地址（默认 `0.0.0.0`）                                                       |
| `TRUST_PROXY_HOPS`                | 否           | 后端前面有几层反向代理，用于按 IP 限流。默认 0；宁少勿多，设多了会采信伪造的 IP                                              |
| `VAPID_PUBLIC`、`VAPID_PRIVATE`   | 推送         | 两者都设置才启用推送                                                                                                         |
| `ADMIN_SET_EMAIL`                 | 否           | 安装时把该邮箱的账号提升为管理员；同时也被用作推送的联系邮箱（历史遗留的命名重叠）                                           |
| `ADMIN_CHECK_EMAIL`               | 否           | 安装时检查该邮箱账号的角色                                                                                                   |

生产环境缺少 `DATABASE_URL`、`REDIS_URL` 或 `VAULT_MASTER_KEY` 时，后端拒绝启动。三个密钥（`NEXTAUTH_SECRET`、`DEVICE_SESSION_SECRET`、`VAULT_MASTER_KEY`）请各自独立生成。

## 部署方式

### Vercel + Render（推荐）

- **前端 → Vercel**：连接 GitHub 仓库，配置前端环境变量即可自动部署。
- **后端 → Render**：使用仓库里的 [`render.yaml`](../render.yaml)，它会部署后端并创建 Redis 和 PostgreSQL（`rootDir: server`，`TRUST_PROXY_HOPS=2` 对应 Cloudflare + Render 负载均衡两层代理）。在 Render 上补齐标记为 `sync: false` 的环境变量；`NODE_VERSION`、`NODE_ENV`、`PORT` 和代理跳数已在配置中设置。PostgreSQL IP allow list 当前允许所有地址（`0.0.0.0/0`）；如果不需要公网访问，应在 Render 中收紧该列表。

### Docker Compose

```bash
docker-compose up -d
```

启动三个服务：

| 服务     | 说明                                                                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app`    | 前端，映射到宿主机 3000 端口                                                                                                                                                |
| `server` | 后端，**只在 compose 内网**暴露 10000 端口，不对公网开放；用 `server/Dockerfile` 构建，构建上下文是仓库根目录（`server/tsconfig.server.json` 继承根目录的 `tsconfig.json`） |
| `redis`  | Redis 7，开启 AOF 和密码，不映射宿主机端口                                                                                                                                  |

**不包含 PostgreSQL**，`DATABASE_URL` 请指向你自己的实例。启动前必须设置 `NEXTAUTH_URL`、`NEXTAUTH_SECRET`、`DATABASE_URL`、`VAULT_MASTER_KEY`、`REDIS_PASSWORD`；`DEVICE_SESSION_SECRET`、`VAPID_PUBLIC` / `VAPID_PRIVATE` 可选。

### 自托管

```bash
npm run build && npm run start   # 前端
cd server && npm install && npm start   # 后端，另行运行
```

站点必须使用 HTTPS（`localhost` 除外），否则 Service Worker、推送和 `__Secure-` / `__Host-` 前缀的 Cookie 都无法工作。

### 数据库

后端在启动或首次使用时会自动建表（`server/postgres-client.ts`）。`scripts/` 下的 SQL 只是等价脚本，供手动建表或排查时参考：

| 文件                                      | 内容       |
| ----------------------------------------- | ---------- |
| `001-create-push-subscriptions-table.sql` | 推送订阅表 |
| `002-create-user-vault-keys-table.sql`    | 金库密钥表 |

## 上线前检查

- [ ] 全站 HTTPS，所有子域名也支持 HTTPS（HSTS 开启了 `includeSubDomains` 和 `preload`）
- [ ] `NODE_ENV=production`。**绝不能**在生产环境设为 `development`，否则任何人都能用 `test` 账号登录
- [ ] `NEXTAUTH_SECRET`、`DEVICE_SESSION_SECRET`、`VAULT_MASTER_KEY` 都是独立生成的强随机值
- [ ] `VAULT_MASTER_KEY` 已与数据库备份**分开**妥善备份（目前没有轮换机制）
- [ ] 前后端的 `NEXTAUTH_SECRET` 一致；推送的公钥前后端一致
- [ ] `TRUST_PROXY_HOPS` 与实际代理层数一致
- [ ] 内容安全策略（CSP）与实际使用的外部域名一致

完整的安全配置和原因见 [SECURITY.md](SECURITY.md)。

## 运维

### 管理员

- 部署时设置 `ADMIN_SET_EMAIL`，`postinstall` 会把该邮箱对应的账号（需先登录过一次）提升为管理员。
- 已有管理员可以在 `/admin` 用邮箱把其他账号设为管理员，或修改用户角色。
- `npm run check-admin`（仓库根目录）或 `cd server && npm run check-admin` 查询账号的角色。

### 推送

见 [VAPID_SETUP.md](VAPID_SETUP.md)。

### 健康检查与日志

- 后端：`GET /api/health`
- 日志：前端 `lib/logger.ts`，设置 `LOG_ENDPOINT` 可转发
- `scripts/backup.sh`：备份 PostgreSQL（`pg_dump`）和 Redis（RDB 快照）到 `/backups`，保留 30 天；读取 `POSTGRES_HOST` / `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` 和 `REDIS_HOST` / `REDIS_PORT`。备份里不含 `VAULT_MASTER_KEY`，请另行保管
