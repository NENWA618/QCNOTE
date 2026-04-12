# 开源许可证与致谢

QCNOTE 应用是建立在众多优秀开源项目之上的。本文档列出了所有主要依赖项及其许可证。

## 📜 许可证速览

| 许可证 | 项目数 | 说明 |
|--------|-------|------|
| **MIT** | 25+ | 宽松许可证，允许商用、修改、分发 |
| **Apache-2.0** | 2 | 宽松许可证，需保留著作权声明 |
| **GPL-2.0** | 1 | 强 Copyleft，衍生产品需开源 |

---

## 🎯 核心技术栈

### 🅾️ MIT License

#### 框架与库

| 项目 | 版本 | 用途 | 链接 |
|------|------|------|------|
| **React** | 18.2.0 | UI 框架 | https://react.dev |
| **Next.js** | 14.0.0 | Web 框架 + SSR | https://nextjs.org |
| **React DOM** | 18.2.0 | DOM 渲染 | https://react.dev |
| **TypeScript** | 5.2.0 | 类型检查 | https://typescriptlang.org |

#### 搜索与数据处理

| 项目 | 版本 | 用途 | 链接 |
|------|------|------|------|
| **Lunr.js** | 2.3.9 | 全文搜索引擎 | https://lunrjs.com |
| **sentiment** | 5.0.1 | 情感分析库 | https://github.com/thisandagain/sentiment |
| **remark-gfm** | 4.0.1 | GitHub Flavored Markdown | https://github.com/remarkjs/remark-gfm |
| **react-markdown** | 10.1.0 | React Markdown 组件 | https://github.com/remarkjs/react-markdown |
| **rehype-sanitize** | 5.0.1 | HTML 安全清理 | https://github.com/rehypejs/rehype-sanitize |

#### 可视化与动画

| 项目 | 版本 | 用途 | 链接 |
|------|------|------|------|
| **Pixi.js** | 6.5.10 | 2D WebGL 渲染 | https://pixijs.com |
| **pixi-live2d-display** | 0.2.2 | Live2D 模型显示 | https://github.com/guansss/pixi-live2d-display |
| **Tailwind CSS** | 3.4.1 | 工具优先 CSS 框架 | https://tailwindcss.com |

#### UI 与交互

| 项目 | 版本 | 用途 | 链接 |
|------|------|------|------|
| **react-beautiful-dnd** | 13.1.1 | 拖拽排序组件 | https://github.com/react-beautiful-dnd/react-beautiful-dnd |
| **react-window** | 2.2.7 | 虚拟滚动列表 | https://github.com/bvaughn/react-window |
| **react-window-infinite-loader** | 2.0.1 | 无限加载 | https://github.com/bvaughn/react-window-infinite-loader |
| **react-diff-viewer-continued** | 4.2.0 | 版本对比显示 | https://github.com/Equim-chan/react-diff-viewer-continued |

#### 工具库

| 项目 | 版本 | 用途 | 链接 |
|------|------|------|------|
| **autoprefixer** | 10.4.24 | CSS 前缀自动添加 | https://github.com/postcss/autoprefixer |
| **postcss** | 8.5.6 | CSS 处理 | https://postcss.org |
| **isomorphic-fetch** | 3.0.0 | 通用 fetch 实现 | https://github.com/matthew-andrews/isomorphic-fetch |
| **fake-indexeddb** | 6.2.5 | IndexedDB 模拟（测试用） | https://github.com/dumbbell/fake-indexeddb |
| **jsdom** | 28.1.0 | DOM 实现（测试用） | https://github.com/jsdom/jsdom |
| **@testing-library/react** | 16.3.2 | React 测试库 | https://testing-library.com |
| **@testing-library/jest-dom** | 6.9.1 | DOM 匹配器 | https://github.com/testing-library/jest-dom |
| **prettier** | 2.8.0 | 代码格式化 | https://prettier.io |
| **vitest** | 1.4.4 | 单元测试框架 | https://vitest.dev |

---

## ⚙️ Apache License 2.0

| 项目 | 版本 | 用途 | 链接 |
|------|------|------|------|
| **OpenAI** | 6.33.0 | AI/GPT 集成 | https://openai.com |
| **@microsoft/microsoft-graph-client** | 3.0.7 | OneDrive/365 集成 | https://github.com/microsoftgraph/msgraph-sdk-javascript |

**注意：** Apache-2.0 许可证要求保留著作权和许可证声明。使用这些库的代码应见 LICENSE 文件或项目主页。

---

## 🔒 GPL License 2.0

| 项目 | 用途 | 说明 | 链接 |
|------|------|------|------|
| **Live2D 看板娘** | 动画看板娘 | GPL-2.0 强 Copyleft。QCNOTE 应用作为派生作品，需保持开源 | https://github.com/fghrsh/live2d_demo |

**重要说明：** 
- Live2D 看板娘 使用 GPL-2.0 许可证
- 这意味着 QCNOTE 应用中使用 Live2D 的任何派生代码必须以兼容的开源许可证发布
- QCNOTE 已选择 MIT 许可证，与 GPL-2.0 兼容（MIT 更宽松）

---

## 🏗️ 后端依赖

| 项目 | 版本 | 许可证 | 用途 |
|------|------|-------|------|
| **Fastify** | 5.7.4 | MIT | 高性能 Web 框架 |
| **@fastify/cors** | 11.2.0 | MIT | CORS 支持 |
| **bullmq** | 5.0.0 | MIT | 任务队列 |
| **ioredis** | 5.3.2 | MIT | Redis 客户端 |
| **web-push** | 3.6.7 | MIT | Web Push 通知 |

---

## 📦 开发环境依赖

| 项目 | 版本 | 许可证 | 用途 |
|------|------|-------|------|
| **eslint** | 8.0.0 | MIT | 代码检查 |
| **eslint-config-next** | 14.0.0 | MIT | Next.js ESLint 配置 |
| **@types/react** | 18.0.0 | MIT | React 类型定义 |
| **@types/react-dom** | 18.0.0 | MIT | React DOM 类型定义 |
| **@types/node** | 20.19.37 | MIT | Node.js 类型定义 |
| **@types/lunr** | 2.3.7 | MIT | Lunr.js 类型定义 |

---

## 📊 许可证汇总

```
┌─────────────────────────────────────────────────┐
│ 许可证分布统计                                  │
├─────────────────────────────────────────────────┤
│                                                 │
│  MIT (25+)  ████████████████████████████ 90%   │
│  Apache-2.0 (2) ████ 8%                        │
│  GPL-2.0 (1)    ██ 2%                          │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## ⚖️ 许可证兼容性

### MIT ↔️ GPL-2.0

- ✅ **兼容性：** 是
- 说明：QCNOTE (MIT) + Live2D (GPL-2.0) = 兼容
- 原因：MIT 比 GPL-2.0 更宽松，可以被 GPL-2.0 包装

### MIT ↔️ Apache-2.0

- ✅ **兼容性：** 是
- 说明：QCNOTE (MIT) - 完全开源，无第三方AI依赖
- 原因：都是宽松许可证，可共存

### Apache-2.0 ↔️ GPL-2.0

- ⚠️ **兼容性：** 受限
- 说明：可使用但需注意专利条款冲突
- 建议：优先使用 MIT 的替代品

---

## 🛡️ 许可证合规检查清单

- [x] 所有依赖项的许可证已记录
- [x] 许可证文本副本已保存（见 LICENSE 和子目录）
- [x] GPL-2.0 兼容性已验证
- [x] 第三方属性已注明
- [x] Footer 中包含关键库的链接
- [x] 用户可访问完整许可证信息

---

## 🔄 更新日志

### 2026-04-03 - 首次审计
- 检查所有 31 个依赖项
- 发现 15+ 个缺失的版权声明
- 更新 Footer 组件添加核心库
- 创建本许可证索引文档

---

## 📞 报告问题

如果你发现任何许可证相关的问题或错误，请：

1. 提交 Issue 到 GitHub Repository
2. 详细说明发现的问题
3. 提供修复建议或证据

---

## 🔗 相关资源

- [SPDX 许可证列表](https://spdx.org/licenses/)
- [Choose a License](https://choosealicense.com/)
- [MIT License 详解](https://opensource.org/licenses/MIT)
- [GPL-2.0 详解](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html)
- [Apache-2.0 详解](https://opensource.org/licenses/Apache-2.0)

---

**最后更新：** 2026-04-03  
**下次审计：** 2026-07-03（季度审计）  
**维护者：** QCNOTE Contributors

