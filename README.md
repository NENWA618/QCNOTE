# QCNOTE - 个人笔记平台

一个现代化、隐私优先的个人笔记应用，采用离线优先架构，具有强大的搜索功能、知识管理和社区功能。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-16.2.12-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2.0-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3.1-61dafb?logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3.4.1-38b2ac?logo=tailwindcss)](https://tailwindcss.com/)

## ✨ 核心功能

### 笔记管理

- **📝 Markdown 编辑器**: 支持富文本编辑，实时预览
- **🧮 LaTeX 数学公式**: 支持行内公式 `$...$` 和块级公式 `$$...$$`
- **🔗 双链支持**: 使用 `[[笔记标题]]` 创建双向链接，自动生成反向链接
- **📋 块状编辑**: 将笔记组织为灵活的块结构
- **🏷️ 标签和分类**: 灵活的标签管理和多维度分类
- **📌 版本历史**: 完整的版本控制和冲突解决机制

### 搜索与发现

- **🔍 全文搜索**: 基于 Lunr.js 的秒级全文搜索
- **🤖 语义搜索**: 向量相似度搜索，理解内容含义
- **📊 知识图谱**: 可视化呈现笔记之间的联系
  - 🔵 蓝线 = 被引用的反向链接
  - 🟣 紫线 = 主动引用他人笔记
- **📅 多维视图**: 日历视图、时间线视图、列表视图

### 隐私与同步

- **📝 离线优先**: 完全支持离线工作，所有数据存储在本地
- **🔒 隐私保护**: 个人数据默认不上传，完全掌控权
- **🔐 客户端加密存储**: 登录后可启用本地 AES-GCM 加密，对敏感字段进行字段级保护
- **👤 账号隔离**: 不同登录账号的数据按命名空间隔离存储，避免账号间数据混淆
- **☁️ 云端同步**: 支持 WebDAV 和 OneDrive 跨设备同步，可选本地加密后再同步
- **🔄 冲突解决**: 自动检测并帮助解决同步冲突
- **📦 导入导出**: 支持多种格式的数据导入导出

### 社区功能

- **💬 论坛系统**: 创建帖子、评论讨论、分类浏览
- **🏆 排行榜**: 用户活跃度和成就排行
- **⭐ 推荐系统**: 智能推荐相关内容和用户
- **👤 用户系统**: OAuth 认证、用户资料、粉丝关注
- **🎮 虚拟人物**: Live2D 虚拟角色互动增强体验

### 智能分析

- **💭 情感分析**: 自动分析笔记内容的情感倾向
- **📈 统计信息**: 笔记数量、更新频率、内容长度等统计
- **🎯 关键词提取**: 自动提取和追踪主要话题

### 用户体验

- **🎨 深色模式**: 全站深色模式支持
- **📱 响应式设计**: 完美适配桌面、平板、手机
- **♿ 无障碍支持**: WCAG 标准的无障碍设计
- **⚡ 快速加载**: 优化的性能和流畅的交互

## 🚀 快速开始

### 系统要求

- Node.js 18+
- npm 或 yarn

### 本地开发

1. 克隆仓库：

```bash
git clone https://github.com/NENWA618/QCNOTE.git
cd QCNOTE
```

2. 安装依赖：

```bash
npm install
```

3. 启动开发服务器：

```bash
npm run dev
```

4. 打开浏览器访问 [http://localhost:3000](http://localhost:3000)

### Docker 快速部署

```bash
docker-compose up -d
```

访问 [http://localhost:3000](http://localhost:3000)

### 环境配置（可选）

对于完整功能（论坛、推荐系统等），需要配置：

```bash
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:3000
# 后端数据库配置
DATABASE_URL=postgresql://user:password@localhost:5432/qcnote
# Redis 配置
REDIS_URL=redis://localhost:6379
```

## 📖 使用指南

### 创建和编辑笔记

1. **新建笔记**: 点击 "新建笔记" 或按 `Ctrl+N`
2. **Markdown 支持**: 支持标准 Markdown 语法
3. **数学公式**:
   - 行内公式：`$E=mc^2$`
   - 块级公式：`$$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$$`
4. **创建双链**: `[[相关笔记标题]]` 即可创建链接
5. **自动保存**: 编辑内容会自动保存到本地

### 搜索和浏览

- **全文搜索**: 使用顶部搜索框进行全文搜索
- **语义搜索**: 支持按含义相似度搜索
- **标签筛选**: 按标签、分类或日期筛选
- **知识图谱**: 查看笔记关系网络
- **多维视图**: 在日历、时间线、列表视图间切换

### 同步和备份

1. **WebDAV 同步**:
   - 打开设置 → 同步设置
   - 填入 WebDAV 服务器地址
   - 点击"连接"并授权

2. **OneDrive 同步**:
   - 打开设置 → OneDrive 同步
   - 登录微软账户
   - 选择同步文件夹

3. **版本历史**:
   - 右侧面板查看历史版本
   - 对比不同版本的差异
   - 恢复到任意历史版本

### 社区功能

- **论坛讨论**: 在论坛中分享笔记和讨论
- **粉丝关注**: 关注感兴趣的用户
- **排行榜**: 查看用户排行和成就

## 🏗️ 架构概览

QCNOTE 采用浏览器优先的本地存储架构，核心功能在客户端运行，后端服务作为可选扩展。

### 前端与运行时

- **Next.js 16.2.12**: 构建页面与路由
- **React 18.3.1**: UI 组件与交互
- **TypeScript 5.2.0**: 类型安全
- **Tailwind CSS 3.4.1**: 响应式样式
- **QCNOTE 运行时（qcruntime/）**: 浏览器端 IndexedDB + AES-GCM 字段级加密
- **IndexedDB / localStorage**: 本地优先存储，支持离线工作

### 搜索与智能

- **Lunr.js**: 本地全文搜索引擎
- **向量搜索**: 基于 bag-of-words 的语义相似度搜索
- **Sentiment.js**: 笔记情感分析
- **react-markdown / remark / rehype**: Markdown 与公式渲染

### 可选后端

- **Fastify**: 可选后端服务
- **PostgreSQL**: 论坛与用户数据存储
- **Redis**: 缓存与会话
- **NextAuth**: OAuth 登录
- **OneDrive 集成**: Microsoft Graph 支持

详见 [ARCHITECTURE.md](docs/ARCHITECTURE.md)

## 💻 开发指南

### 可用命令

```bash
npm run dev      # 启动开发服务器
npm run build    # 生产构建
npm run start    # 启动生产服务器
npm run lint     # 代码检查
npm test         # 运行单元测试
npm run test:e2e # 运行 E2E 测试
```

### 项目结构

```
QCNOTE/
├── components/          # React 组件
│   ├── NoteEditor.tsx   # 笔记编辑器
│   ├── NoteList.tsx     # 笔记列表
│   ├── KnowledgeGraph.tsx # 知识图谱
│   └── ...
├── lib/                # 业务逻辑
│   ├── storage.ts       # 数据持久化层
│   ├── indexer.ts       # 搜索索引
│   ├── vector.ts        # 向量搜索
│   └── ...
├── pages/              # Next.js 页面
│   ├── index.tsx       # 首页
│   ├── dashboard.tsx   # 仪表盘
│   ├── forum.tsx       # 论坛
│   └── api/            # API 路由
├── qcruntime/          # 浏览器运行时与加密存储
├── styles/             # 全局样式
├── public/             # 静态资源
├── server/             # 后端服务
│   ├── forum-service.ts    # 论坛业务逻辑
│   ├── recommendation-service.ts # 推荐系统
│   └── ...
├── docs/               # 文档
└── docker-compose.yml  # Docker 编排文件
```

### 开发流程

1. 创建特性分支：`git checkout -b feature/your-feature`
2. 编写代码并测试：`npm test`
3. 提交代码：`git commit -m 'Add your feature'`
4. 推送分支：`git push origin feature/your-feature`
5. 提交 Pull Request

## 🧪 测试

QCNOTE 使用多层次的测试策略：

```bash
# 单元测试
npm test

# 端到端测试
npm run test:e2e

# 代码检查
npm run lint
```

## 📦 依赖管理

### 核心依赖

- `react` 18.3.1 - UI 框架
- `next` 16.2.12 - 服务器框架
- `typescript` 5.2.0 - 类型系统
- `tailwindcss` 3.4.1 - 样式框架
- `lunr` 2.3.9 - 搜索引擎

### 可选依赖

- `@microsoft/microsoft-graph-client` - OneDrive 同步
- `redis` - 缓存服务
- `pg` - PostgreSQL 驱动

## 🚀 部署

### Vercel 部署

最简单的部署方式，自动从 GitHub 部署：

```bash
# 推送到 GitHub
git push origin main

# 在 Vercel 上连接仓库即可自动部署
```

### Docker 部署

```bash
# 构建镜像
docker build -t qcnote .

# 运行容器
docker run -p 3000:3000 qcnote
```

### 自托管

1. 克隆仓库到服务器
2. 安装依赖：`npm install`
3. 构建：`npm run build`
4. 启动：`npm run start`

## 🤝 贡献指南

我们欢迎任何形式的贡献！

### 贡献步骤

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 贡献指南

- 遵循现有代码风格
- 为新功能添加测试
- 更新相关文档
- 确保所有测试通过

## 🐛 问题反馈

如发现问题，请在 [GitHub Issues](https://github.com/NENWA618/QCNOTE/issues) 上反馈

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

感谢以下开源项目和社区的支持：

- [Next.js](https://nextjs.org/)
- [React](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Lunr.js](https://lunrjs.com/)
- [Fastify](https://www.fastify.io/)
- 和所有其他贡献者

## 📧 联系方式

- **邮箱**: i24026878@student.newinti.edu.my
- **GitHub**: [@NENWA618](https://github.com/NENWA618)
- **问题反馈**: [Issues](https://github.com/NENWA618/QCNOTE/issues)
- **讨论**: [Discussions](https://github.com/NENWA618/QCNOTE/discussions)

---

**⭐ 如果这个项目对您有帮助，请给个 star！**
