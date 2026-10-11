# QCNOTE

**本地优先、隐私优先的个人笔记应用。**

笔记只存在你的浏览器里，写作、搜索、双链和知识图谱都在本地完成，离线也能用。登录后笔记在本机加密保存；同步、个人主页、推送等后端功能都是可选的。可以作为应用安装到桌面或手机主屏幕。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520.9-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

在线体验：<https://qcnote.com>

## 功能

| 写作                            | 查找与浏览                                       | 数据与隐私                                     |
| ------------------------------- | ------------------------------------------------ | ---------------------------------------------- |
| Markdown + KaTeX 公式，实时预览 | 全文搜索，支持 `title:`、`tag:` 等字段与逻辑组合 | 无需注册即可使用，笔记保存在本机               |
| `[[双向链接]]` 与自动反向链接   | 本地运行的语义搜索（可选）                       | 登录后笔记在本机加密                           |
| 标签、分类、文字着色            | 列表、日历、时间线、知识图谱四种视图             | WebDAV / OneDrive 三方合并同步，可加密同步文件 |
| 版本历史，可对比与恢复          | 按标签、分类筛选，多种排序                       | 一键导出 / 导入 JSON 备份                      |

另外还有：个人主页与公开笔记、AI 生成笔记（接入任意 OpenAI 兼容接口）、Web Push 推送、叠界迷宫排行榜、网页剪藏扩展、深色模式、PWA 离线。

详细用法见 **[使用指南](docs/USER_GUIDE.md)**。

## 快速开始

需要 Node.js 20.9+ 和 npm。

```bash
git clone https://github.com/NENWA618/QCNOTE.git
cd QCNOTE
npm install
npm run dev
```

打开 <http://localhost:3000>，不用任何配置就能以访客身份写笔记。

登录、加密存储、个人主页、推送等功能需要启动 `server/` 下的后端（PostgreSQL + Redis），配置方法见 **[部署与配置](docs/DEPLOYMENT.md)**。

## 数据存在哪里

| 你是                 | 笔记存在哪里           | 是否加密                                 |
| -------------------- | ---------------------- | ---------------------------------------- |
| 访客                 | 当前浏览器             | 否                                       |
| 登录用户             | 当前浏览器             | 是，标题、正文、标签、版本历史等都是密文 |
| 发布到个人主页的笔记 | 服务器                 | 否，公开可见                             |
| 同步文件             | 你的 WebDAV / OneDrive | 填了同步加密密钥才加密                   |

登录用户的加密密钥由服务器为账号托管，所以这**不是端到端加密**。笔记不会自动跨设备，需要自己配置同步。详细说明见[使用指南](docs/USER_GUIDE.md#数据存在哪里)和[安全](docs/SECURITY.md)。

## 开发

```bash
npm run dev           # 开发服务器
npm run build         # 生产构建
npm run start         # 启动生产服务器
npm run lint          # ESLint
npm run format        # Prettier
npm test              # 单元测试（Vitest）
npm run test:e2e      # 端到端测试（Playwright）
npm run start-server  # 从仓库根目录启动后端
npm run check-admin   # 查询账号的管理员状态
```

```
QCNOTE/
├── pages/          页面与 API 代理路由
├── components/     React 组件
├── lib/            业务逻辑：存储、同步、加密、搜索、hooks
├── qcruntime/      浏览器存储运行时（IndexedDB + Worker + AES-GCM）
├── server/         Fastify 后端（独立的 package.json）
├── styles/         全局样式（Tailwind CSS 4）
├── extensions/     网页剪藏扩展
├── public/         静态资源、manifest、Service Worker
├── scripts/        数据库 SQL、管理员查询、备份
├── test/  e2e/     单元测试 / 端到端测试
└── docs/           文档
```

改存储相关代码前，请先读 [ARCHITECTURE.md 第 3 节](docs/ARCHITECTURE.md#3-笔记存储)，尤其是：

- 笔记的读写只走 `NoteStorage`；会写回的路径用 `loadNotesAsync()`，不要用 `getDataAsync()`
- 新增携带用户内容的笔记字段，要在 `noteStoreSchema` 里标为 `secret`，`test/encryption-at-rest.test.ts` 会检查存储中是否出现明文

提交前 husky 会运行 lint-staged。CI 依次执行 `npm audit`、lint、类型检查、单元测试和构建，另有独立的 E2E 任务。

## 文档

| 文档                                 | 适合谁     | 内容                                                   |
| ------------------------------------ | ---------- | ------------------------------------------------------ |
| [使用指南](docs/USER_GUIDE.md)       | 使用者     | 写笔记、查找、整理、同步、数据存放、快捷键、常见问题   |
| [部署与配置](docs/DEPLOYMENT.md)     | 部署者     | 本地开发、环境变量、Vercel / Render / Docker、上线检查 |
| [架构](docs/ARCHITECTURE.md)         | 开发者     | 存储与加密、同步、前端、后端接口、PWA、测试            |
| [安全](docs/SECURITY.md)             | 部署与审计 | 安全边界、密钥、Cookie、CSRF、CSP、Service Worker      |
| [推送通知](docs/VAPID_SETUP.md)      | 部署者     | VAPID 密钥生成与验证                                   |
| [QCRuntime](qcruntime/README.md)     | 开发者     | 浏览器存储运行时 API                                   |
| [网页剪藏扩展](extensions/README.md) | 使用与开发 | 安装、使用、安全、数据格式                             |

### Claude 技能

仓库自带一个 Claude 技能（[SKILL.md](.claude/skills/qcnote-new-note/SKILL.md)），让 Claude 在你自己的 Chrome 里操作 QCNOTE 控制台新建或追加笔记，并核对保存结果。需要安装并登录 [Claude in Chrome 扩展](https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn)；因为笔记在你 Chrome 的本地存储里，所以必须用 Claude in Chrome，而不是内置浏览器。技能不会执行清空、删除、回收站等破坏性操作，也不碰同步设置。

## 贡献

1. Fork 仓库并创建特性分支
2. 为新功能补充测试，并更新相关文档
3. 提交前运行 `npm test` 和 `npm run lint`
4. 发起 Pull Request

问题和建议请提交到 [GitHub Issues](https://github.com/NENWA618/QCNOTE/issues)；安全问题请发邮件，见 [SECURITY.md](docs/SECURITY.md#报告安全问题)。

## 许可证

[MIT](LICENSE)

## 联系

- 邮箱：yours@girl.cat
- GitHub：[@NENWA618](https://github.com/NENWA618)
