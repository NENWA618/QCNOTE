import Head from 'next/head';
import Link from 'next/link';
import React from 'react';
import Layout from '../components/Layout';

export default function Privacy() {
  return (
    <>
      <Head>
        <title>隐私政策 - QCNOTE</title>
        <meta
          name="description"
          content="QCNOTE 的隐私政策。了解我们如何保护您的个人数据和笔记内容，强调本地存储和隐私优先的设计理念。"
        />
      </Head>

      <Layout>
        <main className="max-w-4xl mx-auto px-6 py-12">
          <h1 className="text-3xl md:text-4xl font-bold text-primary-dark mb-4">隐私政策</h1>

          <div className="card">
            <p className="text-text-light leading-relaxed mb-4">
              QCNOTE
              以“本地优先、隐私优先”为核心设计理念。我们努力将你的个人数据保持在本地设备上，仅在你主动授权的前提下才与外部服务交互。
            </p>

            <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">1. 本地优先存储</h2>
            <p className="text-text-light mb-4">
              QCNOTE 默认将笔记、设置、标签和搜索索引保存在浏览器本地存储中。如果浏览器支持
              IndexedDB，系统会优先使用它；否则会回退到
              localStorage。这样可确保你在离线状态下也能继续创建和编辑笔记。
            </p>

            <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">2. 客户端加密</h2>
            <p className="text-text-light mb-4">
              QCNOTE 支持在浏览器端对敏感笔记字段启用 AES-GCM
              加密。当前登录用户的数据按账号命名空间隔离保存，若启用加密或提供手动密钥，系统会在本地派生或管理加密密钥。
            </p>
            <p className="text-text-light mb-4">
              QCNOTE 不会将你的密码或明文笔记发送到服务端。请注意，如果浏览器环境不支持
              IndexedDB，系统可能会回退到 localStorage 并以明文形式保存数据。
            </p>

            <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">3. 可选云同步</h2>
            <p className="text-text-light mb-4">
              WebDAV 和 OneDrive 同步均为可选功能，必须由你手动配置后才会启用。QCNOTE
              不会自动启动云同步。
            </p>
            <p className="text-text-light mb-4">
              云端同步数据的隐私和安全由你所选同步服务提供商负责。若启用了加密，笔记数据会在本地加密后再传输到远程存储。
            </p>

            <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">4. 不收集个人数据</h2>
            <p className="text-text-light mb-4">
              QCNOTE
              不主动收集你的笔记内容、账号密码或私人信息。默认情况下不启用第三方分析、广告或追踪功能。
            </p>

            <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">5. 导入与导出</h2>
            <p className="text-text-light mb-4">
              你可以导出笔记为 JSON
              文件以便备份或迁移。导出文件包含完整笔记内容，请妥善保管，并建议存储在受信任的设备或加密存储中。
            </p>

            <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">6. 第三方库与依赖</h2>
            <p className="text-text-light mb-4">
              QCNOTE 使用开源前端库（如 React、Tailwind、KaTeX
              等）来构建界面和功能。这些库仅用于本地渲染和运行，不会自动共享你的笔记内容。
            </p>

            <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">7. 联系我们</h2>
            <p className="text-text-light mb-4">
              如有隐私问题、数据请求或建议，请通过我们的{' '}
              <Link href="/contact" className="text-accent-pink hover:underline">
                联系页
              </Link>{' '}
              与我们取得联系。
            </p>

            <p className="text-text-light text-sm mt-6">最后更新：2026 年 5 月 21 日</p>
          </div>
        </main>
      </Layout>
    </>
  );
}
