# Android App（TWA）

QCNOTE 的安卓 App 是一个 [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity)：用 Chrome 全屏打开 `https://www.qcnote.com`，没有自己的界面代码。网站更新后 App 自动是最新的，只有改图标、名称、颜色、包配置时才需要重新发版。

- 包名：`com.qcnote.app`（上架后不能改）
- Android 工程：[`twa/`](../twa)，由 [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) 根据 `twa/twa-manifest.json` 生成
- 站点验证：`/.well-known/assetlinks.json`，由 `pages/api/assetlinks.ts` 根据环境变量生成

## 一次性准备

1. 安装 **64 位** JDK 17。Windows 上不要让 Bubblewrap 自动下载 JDK：它下的是 32 位版本（`release` 文件里 `OS_ARCH="x86"`），最多只能分配约 1.2GB 内存，而 Gradle 要 1.5GB，构建时会报 `Could not reserve enough space for 1572864KB object heap`。

   ```powershell
   winget install EclipseAdoptium.Temurin.17.JDK
   ```

   默认装在 `C:\Program Files\Eclipse Adoptium\jdk-17.<版本>-hotspot\`。

2. 安装 Bubblewrap：

   ```bash
   npm install -g @bubblewrap/cli
   ```

3. 第一次运行 `bubblewrap` 时：
   - 问是否自动安装 JDK → 选**否**，填上一步的 JDK 目录（见下面关于空格的说明）。
   - 问是否自动安装 Android SDK → 选**是**。

   **JDK 路径不能有空格**：Bubblewrap 签名时调用 `java.exe` 不加引号，`C:\Program Files\...` 会报 `'C:\Program' is not recognized`。用 8.3 短路径代替，在 PowerShell 里查：

   ```powershell
   (New-Object -ComObject Scripting.FileSystemObject).GetFolder('C:\Program Files\Eclipse Adoptium\jdk-17.<版本>-hotspot').ShortPath
   ```

   得到类似 `C:\PROGRA~1\ECLIPS~1\JDK-17~1.101` 的路径，填这个。

   这些设置保存在 `~/.bubblewrap/config.json`（`jdkPath`、`androidSdkPath`），之后可以直接改这个文件。之前已经让它下过 32 位 JDK 的，把 `jdkPath` 改成 64 位 JDK 的目录即可（JSON 里反斜杠写两个）。

4. **在 Claude 桌面应用的终端里**运行时，先执行：

   ```powershell
   Remove-Item Env:NoDefaultCurrentDirectoryInExePath
   ```

   这个终端默认设了 `NoDefaultCurrentDirectoryInExePath=1`，`cmd` 不会在当前目录找程序，`bubblewrap build` 会报 `'gradlew.bat' is not recognized`。只影响当前终端窗口；用普通的 PowerShell 不需要这一步。

## 生成工程和签名密钥

```bash
cd twa
bubblewrap update --skipVersionUpgrade
```

`--skipVersionUpgrade` 让第一次生成保持 1.0.0（versionCode 1）；不加的话它会问新版本号并把 versionCode 加 1。它会根据 `twa-manifest.json` 生成 Gradle 工程。然后生成**上传密钥**。

`keytool` 在 JDK 的 `bin\` 里，一般不在 PATH 上。PowerShell 里先从 Bubblewrap 的配置取出它的路径，再用 `&` 运行（每开一个新终端都要重新执行第一行）：

```powershell
$keytool = Join-Path (Get-Content ~/.bubblewrap/config.json | ConvertFrom-Json).jdkPath 'bin\keytool.exe'
& $keytool -genkeypair -v -keystore android.keystore -alias qcnote -keyalg RSA -keysize 2048 -validity 10000
```

密码至少 6 位，建议 12 位以上，记到密码管理器里。PKCS12 格式下密钥库密码和密钥密码是同一个，`bubblewrap build` 问两次时都填它。姓名、组织等信息可以直接回车跳过。

> `android.keystore` 已在 `twa/.gitignore` 里，**不要提交**，但一定要备份。启用 Play App Signing 后丢了还能在 Play Console 申请重置上传密钥，但会很麻烦。

## 构建

```bash
bubblewrap build
```

输入两次密钥密码（同一个）后得到：

- `app-release-bundle.aab`：上传到 Google Play
- `app-release-signed.apk`：直接装到手机测试

## 配置指纹

Android 只有在站点的 `assetlinks.json` 里找到签名证书指纹时，才会去掉顶部的地址栏。上架 Google Play 需要**两个**指纹：

1. **上传密钥**（自己装 APK 测试时用）：

   ```powershell
   & $keytool -list -v -keystore android.keystore -alias qcnote
   ```

   `$keytool` 的设置见上面「生成工程和签名密钥」。

   复制 `SHA256:` 后面那串。

2. **Play App Signing 密钥**（用户从 Play 商店装的版本用）：第一次上传 `.aab` 后，在 Play Console →「测试和发布」→「设置」→「应用完整性」→「应用签名」里复制「应用签名密钥证书」的 SHA-256。

在 Vercel 上把两个都填进环境变量，逗号分隔，然后重新部署：

```
TWA_SHA256_CERT_FINGERPRINTS=AA:BB:...:FF,11:22:...:99
```

格式不对（比如误填了 SHA-1）时接口会直接报错，而不是返回一个 Android 静默忽略的文件。

验证：打开 <https://www.qcnote.com/.well-known/assetlinks.json>，再用 Google 的 [Statement List Tester](https://developers.google.com/digital-asset-links/tools/generator) 检查。手机上已经装过的 App 要卸载重装才会重新验证。

## 发新版

`bubblewrap update` 会自动把 `appVersionCode` 加 1，并问新的 versionName（比如 `1.0.1`），不用手动改 `twa-manifest.json`：

```bash
cd twa
bubblewrap update
bubblewrap build
```

## 注意

- 网站 `manifest.webmanifest` 的图标、颜色变了，App 不会自动跟着变，要同步改 `twa-manifest.json` 后重新发版。
- `enableNotifications` 开着：网页推送会以 App 自己的通知显示（Android 13+ 第一次会弹系统权限请求）。
- 没装 Chrome（或其他支持 TWA 的浏览器）的设备会回退到 Custom Tabs 打开，能用但有地址栏。
