# 🛠️ 开发者文档

QCNOTE 的技术实现和开发指南。

---

## 📚 文档导航

### 快速开始
- [环境搭建](setup.md) - 开发环境配置
- [项目结构](architecture.md) - 代码组织说明
- [API 概览](api-overview.md) - 接口使用指南

### 核心模块
- [前端架构](frontend.md) - React/Next.js 实现
- [后端服务](backend.md) - Node.js/Fastify 服务
- [数据存储](storage.md) - IndexedDB 和同步机制
- [AI 集成](ai-integration.md) - OpenAI API 使用

### 开发工具
- [构建工具](build-tools.md) - Webpack/Vite 配置
- [测试策略](testing.md) - 单元测试和 E2E 测试
- [代码规范](coding-standards.md) - ESLint/Prettier 配置

### 部署运维
- [部署指南](deployment.md) - Docker 和云服务
- [监控告警](monitoring.md) - 性能监控和日志
- [安全加固](security.md) - 安全最佳实践

### 贡献指南
- [贡献流程](contributing.md) - 如何参与项目
- [代码审查](code-review.md) - 审查标准和流程
- [发布流程](release-process.md) - 版本发布管理

---

## 🚀 快速开始

### 环境要求
- Node.js 18+
- npm 或 yarn
- Git
- Docker (可选)

### 本地开发
```bash
# 克隆项目
git clone https://github.com/your-org/qcnote.git
cd qcnote

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 启动后端服务
cd server
npm install
npm run dev
```

### 项目结构
```
qcnote/
├── components/          # React 组件
├── pages/              # Next.js 页面
├── lib/                # 工具库和业务逻辑
├── server/             # 后端服务
├── styles/             # 样式文件
├── test/               # 测试文件
├── docs/               # 文档
└── public/             # 静态资源
```

---

## 🔧 核心技术栈

### 前端
- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript 5.0
- **样式**: Tailwind CSS 3.0
- **状态管理**: React Context + Zustand
- **UI 组件**: Radix UI + 自建组件库

### 后端
- **运行时**: Node.js 18+
- **框架**: Fastify
- **数据库**: PostgreSQL (可选)
- **缓存**: Redis (可选)
- **队列**: BullMQ

### 数据存储
- **本地**: IndexedDB
- **同步**: WebDAV, OneDrive, iCloud
- **搜索**: Lunr.js + 向量搜索
- **备份**: 自动备份到云存储

### AI 集成
- **提供商**: OpenAI API
- **功能**: 文本生成、情感分析、标签生成
- **缓存**: 本地缓存减少 API 调用

---

## 📖 API 文档

### REST API
- `GET /api/notes` - 获取笔记列表
- `POST /api/notes` - 创建新笔记
- `PUT /api/notes/:id` - 更新笔记
- `DELETE /api/notes/:id` - 删除笔记

### WebSocket
- 实时同步笔记更改
- 协作编辑支持
- 状态同步

### SDK
```typescript
import { QCNoteClient } from '@qcnote/sdk'

const client = new QCNoteClient({
  apiKey: 'your-api-key',
  baseURL: 'https://api.qcnote.app'
})

// 创建笔记
const note = await client.notes.create({
  title: '我的笔记',
  content: '# Hello World',
  tags: ['示例']
})
```

---

## 🧪 测试策略

### 单元测试
```bash
npm run test:unit
```

### 集成测试
```bash
npm run test:integration
```

### E2E 测试
```bash
npm run test:e2e
```

### 测试覆盖率
```bash
npm run test:coverage
```

---

## 🚀 部署

### 开发环境
```bash
npm run build
npm run start
```

### 生产环境
```bash
docker build -t qcnote .
docker run -p 3000:3000 qcnote
```

### 云部署
- Vercel (前端)
- Railway/Heroku (后端)
- AWS/GCP/Azure (基础设施)

---

## 🤝 贡献

我们欢迎所有形式的贡献！

### 开发流程
1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

### 代码规范
- 使用 TypeScript 严格模式
- 遵循 ESLint 配置
- 编写有意义的提交信息
- 添加适当的测试

### 问题报告
- 使用 GitHub Issues
- 提供详细的复现步骤
- 包含环境信息和错误日志

---

## 📞 支持

- **文档**: [docs.qcnote.app](https://docs.qcnote.app)
- **社区**: [GitHub Discussions](https://github.com/your-org/qcnote/discussions)
- **邮箱**: dev@qcnote.app

---

*让我们一起构建更好的笔记应用！* 🚀