# 🚀 UGC 系统快速开始指南

## ⚡ 30 分钟快速上线

### 第1步：前端配置 (Vercel)

#### 1.1 安装依赖
```bash
npm install
```

#### 1.2 配置环境变量
在 Vercel Dashboard 中添加以下环境变量：

```
NEXTAUTH_URL=https://www.qcnote.com
NEXTAUTH_SECRET=<使用 `openssl rand -base64 32` 生成>
BACKEND_URL=https://your-render-app.onrender.com
GOOGLE_CLIENT_ID=<从 Google Console 获取>
GOOGLE_CLIENT_SECRET=<从 Google Console 获取>
GITHUB_CLIENT_ID=<从 GitHub 获取>
GITHUB_CLIENT_SECRET=<从 GitHub 获取>
DISCORD_CLIENT_ID=<从 Discord 获取>
DISCORD_CLIENT_SECRET=<从 Discord 获取>
```

#### 1.3 本地测试
```bash
npm run dev
# 访问 http://localhost:3000
```

---

### 第2步：后端配置 (Render)

#### 2.1 在 Render dashboard 中
已有 QCNOTE-server 项目，需要添加环境变量：

```
REDIS_URL=redis://red-d6hklllm5p6s73blh7i0:6379
NODE_ENV=production
```

#### 2.2 部署
```bash
git push  # Render 会自动部署
```

验证后端：
```
https://your-render-app.onrender.com/api/health
```

---

### 第3步：核心 API 端点

#### 用户认证
- ✅ `POST /api/auth/signin` - 登录
- ✅ `GET /api/auth/session` - 获取会话

#### 用户管理
- `POST /api/ugc/user/init` - 初始化用户资料
- `GET /api/ugc/user/{userId}` - 获取用户资料
- `PUT /api/ugc/user/{userId}` - 更新用户资料

#### 虚拟空间
- `GET /api/ugc/space/{userId}` - 获取虚拟空间
- `PUT /api/ugc/space/{userId}` - 更新虚拟空间
- `POST /api/ugc/space/{userId}/decoration` - 添加装饰品

#### 社区功能
- `POST /api/ugc/community/publish` - 发布笔记到社区
- `GET /api/ugc/community/note/{communityId}` - 获取社区笔记
- `POST /api/ugc/community/like/{communityId}` - 点赞
- `GET /api/ugc/recommendations/{userId}` - 获取推荐

#### 排行榜
- `GET /api/ugc/leaderboard/creative` - 创意排行
- `GET /api/ugc/leaderboard/activity` - 活跃度排行
- `GET /api/ugc/leaderboard/influence` - 影响力排行

---

### 第4步：前端页面

访问以下 URL 测试功能：

```
https://www.qcnote.com/ugc/space        # 虚拟空间
https://www.qcnote.com/ugc/community    # 社区浏览
https://www.qcnote.com/ugc/leaderboard  # 排行榜
```

---

## 📊 推荐算法说明

### 多维度推荐分数计算

```
总分 = 
  热度分(25%) + 
  内容相似度(35%) + 
  作者影响力(15%) + 
  新鲜度(15%) + 
  多样性探索(10%)

热度分 = (👍×1.2 + 💬×0.8 + 🔗×1.5 + 👁️×0.1) / 10

内容相似度 = (标签匹配 + 文本相关度 + 分类相关) / 3

作者影响力 = 10 + ln(粉丝+1)×5 + ln(作品+1)×3

新鲜度 = 1 / (1 + 日期差/7)

多样性 = 新类别 ? 100 : 50
```

### 防止信息茧房

- **15% 探索率**：自动推荐用户从未接触过的内容
- **重排策略**：每次推荐时随机打乱一部分结果

---

## 💾 Redis 数据结构

```
# 用户数据
user:{userId}:profile -> 用户资料 JSON
user:{userId}:credit -> 虚拟货币（整数）
user:{userId}:space -> 虚拟空间配置

# 社区数据
community:note:{communityId} -> 社区笔记 JSON
community:likes:{communityId} -> 点赞用户集合
community:trending:24h -> 热点排行(ZSET)

# 排行榜
leaderboard:creative -> 创意排行榜
leaderboard:activity -> 活跃度排行榜
leaderboard:influence -> 影响力排行榜

# 个人推荐流
feed:{userId} -> 推荐列表(过期1小时)
```

---

## 🛠️ 常见问题

### Q: 如何生成 NEXTAUTH_SECRET?
```bash
openssl rand -base64 32
```

### Q: 如何本地测试 OAuth?
在 `.env.local` 中使用测试密钥，详见 `.env.example`

### Q: Redis 连接失败?
!. 检查环境变量名称是否正确：`REDIS_URL`
2. 检查 Redis URL 格式：`redis://user:pass@host:port`
3. 确认 Render Redis 项目是运行状态

### Q: 如何重置用户数据?
```bash
redis-cli FLUSHDB  # 清空所有数据（仅开发环境）
```

---

## 📈 后续功能路线

- [ ] PostgreSQL 持久化层
- [ ] 创意挑战系统
- [ ] 学习热力图可视化
- [ ] 故事链接系统
- [ ] 虚拟社区地图
- [ ] 消息评论系统
- [ ] 用户推荐关注

---

## 🎯 核心数据流

```
用户登录
  ↓
初始化用户资料 + 虚拟空间
  ↓
浏览社区（触发推荐算法）
  ↓
点赞/分享笔记
  ↓
赚取虚拟货币 → 解锁装饰品
  ↓
虚拟空间装饰化
  ↓
成就系统 → 排行榜更新
```

---

祝您部署顺利！有任何问题欢迎反馈 🚀
