# QCNOTE 网页剪藏扩展

把网页内容剪藏到 QCNOTE 的浏览器扩展，支持 Chrome / Chromium（Manifest V3）和 Firefox（Manifest V2）。

## 工作原理

QCNOTE 的笔记只存在浏览器本地，服务器上没有可写的笔记库，所以扩展不会把内容发到服务器，而是：

1. 在网页里提取内容（整页 / 选中文本 / 文章正文）
2. 打开 `<应用地址>/dashboard#qcnote-clip=<base64url(JSON)>`
3. 仪表盘读取 hash（**hash 不会发往服务器**）并立即从地址栏清除，弹出确认框显示标题、来源和预览
4. 用户点"保存为笔记"后，才写入当前账号（或访客）的本地笔记库；登录用户的笔记照常加密保存

任何链接都能带这个 hash，所以应用把它当作不可信输入：

- 用 zod 严格校验：标题 1–300 字符，正文 ≤ 100,000 字符，来源只接受 http(s) 且 ≤ 2048 字符，分类 ≤ 50 字符，标签最多 20 个
- 必须经用户确认才保存
- 登录用户要等设备验证完成后才显示确认框，避免笔记写进访客库

解析逻辑在 [lib/clipImport.ts](../lib/clipImport.ts)，确认框在 [components/ClipImportDialog.tsx](../components/ClipImportDialog.tsx)。

## 安装（开发版）

**Chrome / Chromium**

1. 打开 `chrome://extensions/`，开启右上角"开发者模式"
2. 点"加载已解压的扩展程序"，选择 `extensions/chrome`

**Firefox**

1. 打开 `about:debugging` → "此 Firefox"
2. 点"加载临时附加组件"，选择 `extensions/firefox/manifest.json`（重启浏览器后失效）

## 使用

1. 点击工具栏图标，在弹窗底部填写 QCNOTE 应用地址（默认 `http://localhost:3000`，只接受 http(s)）并保存，地址存在 `chrome.storage.sync`
2. 打开要剪藏的网页，选择：

   | 按钮         | 内容                                                                                                                     | 标题前缀    | 标签                     |
   | ------------ | ------------------------------------------------------------------------------------------------------------------------ | ----------- | ------------------------ |
   | 剪藏整页     | 页面可见文本                                                                                                             | `网页剪藏:` | 网页剪藏、域名           |
   | 剪藏选中内容 | 当前选中的文本                                                                                                           | `选中文本:` | 网页剪藏、选中文本、域名 |
   | 剪藏文章     | 依次尝试 `article`、`[role="main"]`、`.post-content`、`.entry-content`、`.article-content`、`.content`，都没有则退回整页 | `文章剪藏:` | 网页剪藏、文章、域名     |

3. 扩展打开（或新开）QCNOTE 标签页，确认后保存

## 数据格式

```typescript
interface ClipData {
  title: string; // 带上表中的前缀
  content: string; // 纯文本，开头是 "来源: <url>"；超过 100,000 字符会截断
  url: string; // 来源页面，仅 http(s)
  category?: string; // "网页剪藏"
  tags?: string[];
  clippedAt?: string; // ISO 8601
}
```

## 目录结构

```
extensions/
├── chrome/            Manifest V3（permissions: activeTab, storage, scripting）
│   ├── manifest.json
│   ├── popup.html     弹窗：三个剪藏按钮 + 应用地址设置
│   ├── popup.js       提取内容并打开应用页
│   ├── background.js  首次安装时写入默认应用地址
│   └── icons/
├── firefox/           Manifest V2（permissions: activeTab, storage），文件同上
└── README.md
```

`popup.js` 和 `background.js` 在两个目录里内容相同：Chrome 用 `chrome.scripting.executeScript`，Firefox 用 `chrome.tabs.executeScript`，在运行时自动判断。**修改后请同步两份。**

扩展不需要应用域名的 host 权限，也不会向网页注入常驻的内容脚本。

## 已知限制

- 没有快捷键，没有打包和上架流程（根目录的 `npm run build` 只构建 Next.js 应用）
- 图标是应用图标缩放而来，没有专门的 16 / 48 / 128 版本
- 只剪藏纯文本，不保留格式；不支持 PDF 和 Safari
- 每次剪藏都会打开应用页并需要手动确认，不支持后台静默保存或批量剪藏
- 应用侧的流程（解析、确认、保存）只在开发服务器上验证过；扩展弹窗本身和 Firefox 版尚未在真实浏览器里实测

## 调试

- Chrome：`chrome://extensions/` → 扩展的"检查视图"，或右键工具栏图标 →"检查弹出内容"
- Firefox：`about:debugging` → 扩展 →"检查"
- 不装扩展也能测试应用侧：打开 `http://localhost:3000/dashboard#qcnote-clip=<base64url>`，编码方法见 `test/clipImport.test.ts`

## 许可证

MIT，见 [LICENSE](../LICENSE)
