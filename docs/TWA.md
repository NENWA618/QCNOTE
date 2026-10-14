# Android App（TWA）

QCNOTE 的安卓 App 是一个 [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity)：用 Chrome 全屏打开 `https://www.qcnote.com`，没有自己的界面代码。网站更新后 App 自动是最新的，只有改图标、名称、颜色、包配置时才需要重新发版。

- 包名：`com.qcnote.app`（上架后不能改）
- Android 工程：[`twa/`](../twa)，由 [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) 根据 `twa/twa-manifest.json` 生成
- 站点验证：`/.well-known/assetlinks.json`，由 `pages/api/assetlinks.ts` 根据环境变量生成

## 一次性准备

```bash
npm install -g @bubblewrap/cli
```

第一次运行 `bubblewrap` 时会问要不要自动下载 JDK 和 Android SDK，都选是。

## 生成工程和签名密钥

```bash
cd twa
bubblewrap update
```

它会根据 `twa-manifest.json` 生成 Gradle 工程。然后生成**上传密钥**（密码自己定，记到密码管理器里）：

```bash
keytool -genkeypair -v -keystore android.keystore -alias qcnote -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` 在 Bubblewrap 下载的 JDK 的 `bin/` 里（路径见 `~/.bubblewrap/config.json`）。

> `android.keystore` 已在 `twa/.gitignore` 里，**不要提交**，但一定要备份。启用 Play App Signing 后丢了还能在 Play Console 申请重置上传密钥，但会很麻烦。

## 构建

```bash
bubblewrap build
```

输入两次密钥密码后得到：

- `app-release-bundle.aab`：上传到 Google Play
- `app-release-signed.apk`：直接装到手机测试

## 配置指纹

Android 只有在站点的 `assetlinks.json` 里找到签名证书指纹时，才会去掉顶部的地址栏。上架 Google Play 需要**两个**指纹：

1. **上传密钥**（自己装 APK 测试时用）：

   ```bash
   keytool -list -v -keystore android.keystore -alias qcnote
   ```

   复制 `SHA256:` 后面那串。

2. **Play App Signing 密钥**（用户从 Play 商店装的版本用）：第一次上传 `.aab` 后，在 Play Console →「测试和发布」→「设置」→「应用完整性」→「应用签名」里复制「应用签名密钥证书」的 SHA-256。

在 Vercel 上把两个都填进环境变量，逗号分隔，然后重新部署：

```
TWA_SHA256_CERT_FINGERPRINTS=AA:BB:...:FF,11:22:...:99
```

格式不对（比如误填了 SHA-1）时接口会直接报错，而不是返回一个 Android 静默忽略的文件。

验证：打开 <https://www.qcnote.com/.well-known/assetlinks.json>，再用 Google 的 [Statement List Tester](https://developers.google.com/digital-asset-links/tools/generator) 检查。手机上已经装过的 App 要卸载重装才会重新验证。

## 发新版

改 `twa-manifest.json` 里的 `appVersionCode`（每次 +1）和 `appVersionName`，然后：

```bash
cd twa
bubblewrap update
bubblewrap build
```

## 注意

- 网站 `manifest.webmanifest` 的图标、颜色变了，App 不会自动跟着变，要同步改 `twa-manifest.json` 后重新发版。
- `enableNotifications` 开着：网页推送会以 App 自己的通知显示（Android 13+ 第一次会弹系统权限请求）。
- 没装 Chrome（或其他支持 TWA 的浏览器）的设备会回退到 Custom Tabs 打开，能用但有地址栏。
