# 🎉 QCNOTE - 私有本地优先的个人笔记伙伴

<div align="center">

![QCNOTE Logo](https://via.placeholder.com/200x80/4A90E2/FFFFFF?text=QCNOTE)

**让记录变得简单而优雅**

*本地优先的个人笔记应用，专注隐私与高效记录*

[![版本](https://img.shields.io/badge/版本-1.0.0-blue.svg)](https://github.com/your-org/qcnote/releases)
[![许可证](https://img.shields.io/badge/许可证-MIT-green.svg)](LICENSE)
[![在线体验](https://img.shields.io/badge/在线体验-立即使用-orange.svg)](https://qcnote.com)

[🚀 快速开始](#-快速开始) • [✨ 功能特性](#-核心特性) • [📚 文档中心](#-文档中心) • [🤝 贡献](#-贡献)

</div>

---

## 🌟 为什么选择 QCNOTE？

QCNOTE 不仅仅是一个笔记应用，它是你的**个人知识库助手**。我们相信好的工具应该：

- 🔒 **隐私优先** - 你的数据只属于你自己
- 🎨 **美观易用** - 精心设计的用户体验
- 🚀 **高效强大** - 从简单记录到复杂管理
- 📁 **本地优先** - 离线可用，数据保存在你的设备

---

## ✨ 核心特性

### 📝 智能记录
- **离线优先** - 数据存储在本地，无需网络
- **Markdown 支持** - 完整的 Markdown 语法和预览
- **自动保存** - 每30秒自动保存，永不丢失
- **富媒体** - 支持图片、链接、附件等

### 🔍 强大搜索
- **全文搜索** - 支持中英文混合搜索
- **主题筛选** - 按时间、标签、类型筛选
- **快速定位** - 轻松查找你需要的笔记
- **模糊匹配** - 容错查找，提高检索效率

### 🎨 个性化体验
- **全文搜索** - 支持中英文混合搜索
- **语义搜索** - 理解你的意图而不仅是关键词
- **高级筛选** - 按时间、标签、类型筛选
- **模糊匹配** - 智能纠错和近似匹配

### 🎨 个性化体验
- **Live2D 看板娘** - 可爱的交互式助手
- **暗黑模式** - 护眼的夜间阅读模式
- **响应式设计** - 完美适配手机、平板、电脑
- **自定义主题** - 打造专属视觉风格

### 🔄 数据同步
- **多平台同步** - WebDAV、OneDrive、iCloud
- **端到端加密** - 数据传输安全可靠
- **版本历史** - 查看和恢复笔记历史版本
- **智能备份** - 自动备份，永不丢失

---

## 🚀 快速开始

### 🌐 在线体验
最简单的开始方式！访问 [qcnote.com](https://qcnote.com) 立即开始使用。

### 💻 本地运行
```bash
# 1. 克隆项目
git clone https://github.com/your-org/qcnote.git
cd qcnote

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev

# 4. 打开浏览器访问 http://localhost:3000
```

### 🐳 Docker 部署
```bash
# 使用 Docker Compose 一键启动
docker-compose up -d

# 访问 http://localhost:3000
```

### 📖 详细指南
- [新手入门指南](docs/user-guide/getting-started.md)
- [开发者环境搭建](docs/developer/setup.md)
- [生产环境部署](docs/deployment/index.md)

---

## 📱 功能预览

<table>
<tr>
<td width="50%">

### 主界面
![主界面](https://via.placeholder.com/400x300/4A90E2/FFFFFF?text=优雅的主界面)

*简洁直观的设计，让你专注于内容创作*

</td>
<td width="50%">

### 看板娘助手
![看板娘](https://via.placeholder.com/400x300/50C878/FFFFFF?text=Live2D+看板娘)

*可爱的Live2D看板娘陪伴你记录一切*

</td>
</tr>
<tr>
<td>

### 知识图谱
![知识图谱](https://via.placeholder.com/400x300/FF6B6B/FFFFFF?text=知识图谱可视化)

*可视化笔记关系，发现知识脉络*

</td>
<td>

### 移动端适配
![移动端](https://via.placeholder.com/400x300/9B59B6/FFFFFF?text=完美移动体验)

*随时随地记录想法，无缝同步*

</td>
</tr>
</table>

---

## 🎮 使用演示

### 创建你的第一篇笔记
1. **点击 "开始记录"** - 进入编辑界面
2. **输入标题和内容** - 支持 Markdown 格式
3. **添加标签** - 让笔记更有条理
4. **保存并查看** - 你的笔记已经创建完成！

### 基础使用
1. **打开笔记** - 选择任意笔记开始编辑
2. **输入内容** - 支持 Markdown 格式、实时保存
3. **组织笔记** - 手动管理和分类笔记
4. **同步数据** - 可选链接OneDrive或WebDAV进行同步

### 搜索和发现
1. **输入关键词** - 在搜索框输入内容
2. **查看结果** - 智能排序的相关笔记
3. **使用筛选器** - 按时间、标签等筛选
4. **发现关联** - 查看相关笔记推荐

---

## 🛠️ 技术栈

<div align="center">

### 前端技术
![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38B2AC?style=flat-square&logo=tailwind-css)

### 后端技术
![Node.js](https://img.shields.io/badge/Node.js-18-339933?style=flat-square&logo=node.js)
![Fastify](https://img.shields.io/badge/Fastify-4-000000?style=flat-square&logo=fastify)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14-4169E1?style=flat-square&logo=postgresql)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis)

### 搜索 & 存储
![Lunr.js](https://img.shields.io/badge/Lunr.js-2.3-000000?style=flat-square)
![IndexedDB](https://img.shields.io/badge/IndexedDB-本地存储-FF6B6B?style=flat-square)
![Live2D](https://img.shields.io/badge/Live2D-看板娘-50C878?style=flat-square)

### 部署 & 工具
![Docker](https://img.shields.io/badge/Docker-24-2496ED?style=flat-square&logo=docker)
![Vercel](https://img.shields.io/badge/Vercel-部署-000000?style=flat-square&logo=vercel)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-CI/CD-2088FF?style=flat-square&logo=github-actions)

</div>

---

## 📚 完整的文档结构

QCNOTE 提供了详细的文档，涵盖所有方面的内容。以下是完整的文档导航：

### 📚 📖 用户指南 - [`docs/user-guide/`](docs/user-guide/index.md)
从入门到精通的完整用户指南

- [用户指南首页](docs/user-guide/index.md) - 导航和概览
- [新手入门](docs/user-guide/getting-started.md) - 5分钟快速开始
- [功能特性](docs/user-guide/features.md) - 完整功能说明
- [常见问题](docs/user-guide/faq.md) - FAQ 和故障排查

### 🛠️ 开发者文档 - [`docs/developer/`](docs/developer/index.md)
为开发者和贡献者准备的技术文档

- [开发者文档首页](docs/developer/index.md) - 导航和概览
- [环境搭建](docs/developer/setup.md) - 配置开发环境
- [项目结构](docs/developer/architecture.md) - 了解代码组织

### 🚀 部署指南 - [`docs/deployment/`](docs/deployment/index.md)
从开发到生产的完整部署解决方案

- [部署指南首页](docs/deployment/index.md) - 多种部署方式和对比
- 包含：Vercel、Netlify、Docker、AWS、Google Cloud、Azure、自建服务器等完整部署方案

### 🔒 安全与隐私 - [`docs/security/`](docs/security/index.md)
安全架构、隐私保护和合规信息

- [安全指南首页](docs/security/index.md) - 安全架构和最佳实践
- [安全审计报告](docs/security/SECURITY.md) - 安全审计结果和修复清单

### 📋 其他重要文档
- [系统架构](docs/ARCHITECTURE.md) - QCNOTE 的整体架构设计
- [架构决策](docs/ADR-INDEX.md) - 架构决策记录索引（ADR-001 至 ADR-004）
- [品牌指南](docs/BRANDING.md) - QCNOTE vs NOTE 的命名说明
- [文档中心](docs/README.md) - 文档索引和搜索指南

### 🔧 扩展程序文档 - [`extensions/`](extensions/README.md)
浏览器扩展的安装和使用指南

- [浏览器扩展](extensions/README.md) - Web Clipper 扩展文档（Chrome/Firefox）

---

## 🚀 快速查找

| 我想... | 查看这里 |
|--------|--------|
| 💡 快速开始使用 QCNOTE | [用户指南首页](docs/user-guide/index.md) |
| 🛠️ 在本地运行和开发 | [环境搭建](docs/developer/setup.md) |
| ☁️ 部署到生产环境 | [部署指南](docs/deployment/index.md) |
| 🔒 了解安全和隐私 | [安全指南](docs/security/index.md) |
| 🌐 使用浏览器扩展剪藏网页 | [浏览器扩展](extensions/README.md) |
| 🏗️ 了解系统架构 | [系统架构](docs/ARCHITECTURE.md) |
| ❓ 找不到答案 | [FAQ](docs/user-guide/faq.md) 或 [Issues](https://github.com/NENWA618/NOTE/issues)

---

## 🤝 贡献

QCNOTE 是开源项目，我们欢迎各种形式的贡献！

### 🌟 参与方式
- **🐛 报告问题** - [提交 Bug](https://github.com/your-org/qcnote/issues/new?template=bug_report.md)
- **💡 功能建议** - [提出想法](https://github.com/your-org/qcnote/discussions/categories/feature-requests)
- **📝 文档改进** - 帮助完善文档
- **💻 代码贡献** - 参与开发

### 🚀 开发流程
1. **Fork 项目** 到你的 GitHub
2. **创建分支** `git checkout -b feature/AmazingFeature`
3. **提交更改** `git commit -m 'Add some AmazingFeature'`
4. **推送分支** `git push origin feature/AmazingFeature`
5. **创建 PR** 并描述你的更改

### 🧪 开发环境
```bash
# 安装依赖
npm install

# 运行测试
npm test

# 代码检查
npm run lint

# 构建检查
npm run build
```

### 📋 贡献指南
详细的贡献指南请查看：[贡献文档](docs/developer/contributing.md)

---

## 📄 开源协议

QCNOTE 采用 **MIT License** 开源协议。

```
MIT License - 详见 LICENSE 文件
```

---

## 🙏 致谢

QCNOTE 的开发离不开众多优秀开源项目的支持：

### 核心依赖
- **React & Next.js** - 现代 Web 开发框架
- **Tailwind CSS** - 实用优先的 CSS 框架
- **Lunr.js** - 轻量级搜索引擎
- **Pixi.js & Live2D** - 动画和交互技术

### 社区贡献
特别感谢所有贡献者、测试者和用户的支持！

<a href="https://github.com/your-org/qcnote/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=your-org/qcnote" />
</a>

---

<div align="center">

**🎉 感谢你选择 QCNOTE！**

*让记录变得简单而优雅，我们致力于为你提供最好的笔记体验。*

---

**⭐ 如果这个项目对你有帮助，请给我们一个 Star！**

</div>