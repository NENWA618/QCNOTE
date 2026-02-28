# 部署与配置指南

## 快速开始（本地开发）

### 前提
- Node.js 18+
- npm / yarn
- （可选）Docker（用于本地 Redis）

### 安装与运行

1. **安装前端依赖**
```bash
npm install
```

2. **生成 VAPID keys（用于推送）**
```bash
npx web-push generate-vapid-keys --json
# 输出内容形如：
# {"publicKey":"BMxxxx...","privateKey":"Kpyyyy..."}
```
保存两个 key，后续需要。

3. **启动前端（开发）**
```bash
npm run dev
# 访问 http://localhost:3000
```

4. **启动后端（可选，用于推送和高级对话）**

首先在 `server/` 目录安装依赖：
```bash
cd server
npm install
```

启动本地 Redis（如果需要）：
```bash
# Windows/PowerShell with Docker
docker run -p 6379:6379 -d redis

# 或使用 WSL：
wsl -d <distro> redis-server
```

设置环境变量并启动服务器：
```bash
$env:REDIS_URL='redis://127.0.0.1:6379'
$env:VAPID_PUBLIC='<上面生成的 publicKey>'
$env:VAPID_PRIVATE='<上面生成的 privateKey>'
npm run start
```

后端默认监听 `http://localhost:4000`。

5. **配置前端连接后端**

在前端项目根创建 `.env.local` 或在启动时注入环境变量：
```
NEXT_PUBLIC_CHARACTER_SERVER_URL=http://localhost:4000
NEXT_PUBLIC_VAPID_PUBLIC=<publicKey>
```

重启前端开发服务器使环境变量生效。

---

## 生产部署（Vercel + Render）

### 前端（Vercel）

1. 在 Vercel 中导入你的 GitHub 仓库。

2. 设置环境变量（Project Settings → Environment Variables）：
   - `NEXT_PUBLIC_CHARACTER_SERVER_URL` = 你的后端 URL（e.g., `https://your-backend.onrender.com`）
   - `NEXT_PUBLIC_VAPID_PUBLIC` = VAPID 公钥

3. 部署。

### 后端（Render）

1. **创建 Web Service**
   - 连接 GitHub 仓库
   - Root Directory: `server`
   - Build Command: `npm install`
   - Start Command: `node index.js`（或 `npm run start`）

2. **创建 Redis（Key Value）**
   - Render Dashboard → + New → Key Value
   - 选择区域和内存大小（Starter 以上有持久化）
   - 创建后复制内部 Connection URL

3. **添加后端环境变量**（Web Service Settings → Environment）
   - `REDIS_URL` = <Key Value 实例的内部 URL>
   - `VAPID_PUBLIC` = <你的 VAPID 公钥>
   - `VAPID_PRIVATE` = <你的 VAPID 私钥>
   - （可选）`PORT` = `4000`

4. **可选：单独 Background Worker**
   如果需要把队列处理分离到单独的 worker 进程：
   - 创建另一个 Web Service
   - Start Command: `node server/worker.js`
   - 也要设置环境变量（尤其是 `REDIS_URL`）

5. 部署完成后，在服务日志搜索 `[Worker] started` 或 `[Queue] Initialized` 验证启动状态。

### 测试通知推送

完成部署后，访问前端应用：
1. 打开看板娘聊天窗口
2. 浏览器会请求 Notification 权限，点击允许
3. 向诺特说：`"提醒我在 2026-03-05 14:00 做 测试"`
4. 若成功，会收到确认消息"已为你设置提醒"
5. 到达指定时间，前端的 service worker 会接收 push 并显示系统通知

---

## 养成系统与进度同步

- **本地存储**：角色等级、XP、好感度全部存储在浏览器 IndexedDB 中，每次打开看板娘时加载与展示。
- **经验获得**：
  - 与诺特聊天：+5 XP
  - 设置提醒：+20 XP
  - 其它互动可扩展
- **好感衰减**：每日 -1，可通过互动恢复。
- **目前本地-only**：如需跨设备同步，需扩展至服务器存储（可选）。

---

## 故障排除

### 推送不工作
- 确保浏览器允许了 Notification 权限
- 检查后端日志中的 `[Worker]` 或 `[Push]` 行
- 确认 `VAPID_PUBLIC` 与 `VAPID_PRIVATE` 已正确设置在后端环境变量
- 若是 Render，检查 Key Value Redis 实例状态是否为 Running

### 后端无法连接 Redis
- 检查 `REDIS_URL` 格式（应为 `redis://...` 或 `rediss://...`）
- 若使用 Render 内部 URL，确保服务在同一区域
- 检查后端日志中的连接错误信息

### 看板娘对话无响应
- 检查前端环境变量 `NEXT_PUBLIC_CHARACTER_SERVER_URL` 是否指向正确的后端地址
- 若后端不可用，看板娘会降级到本地回复（可能简化）
- 检查浏览器控制台是否有网络错误

---

## 环境变量速查表

| 变量 | 用途 | 必须？ | 平台 |
|------|------|--------|------|
| `REDIS_URL` | Redis 连接字符串 | 可选（无时降级） | Render 后端 |
| `VAPID_PUBLIC` | Web Push 公钥 | 是 | Render 后端 + Vercel 前端 |
| `VAPID_PRIVATE` | Web Push 私钥 | 是 | Render 后端 |
| `NEXT_PUBLIC_CHARACTER_SERVER_URL` | 后端 API 地址 | 否（本地对话降级） | Vercel 前端 |
| `NEXT_PUBLIC_VAPID_PUBLIC` | 前端的 Push 公钥 | 是 | Vercel 前端 |

---

## 下一步改进

- [ ] 多设备同步：把进度存到服务器并跨端同步
- [ ] 更多互动触发：笔记完成度、标签里程碑、季节事件
- [ ] 数据可视化：每月活动统计、时间线展示
- [ ] 国际化与辅助功能：多语言、深色模式、a11y 改进
