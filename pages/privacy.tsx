import Head from 'next/head';
import Link from 'next/link';
import React from 'react';
import Layout from '../components/Layout';

export default function Privacy() {
  return (
    <>
      <Head>
        <title>隐私政策 - QCNOTE</title>
        <meta name="description" content="QCNOTE 的隐私政策。了解我们如何保护您的个人数据和笔记内容，强调本地存储和隐私优先的设计理念。" />
      </Head>

      <Layout>
          <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl md:text-4xl font-bold text-primary-dark mb-4">隐私政策</h1>

        <div className="card">
          <p className="text-text-light leading-relaxed mb-4">
            QCNOTE 致力于保护你的隐私并提供安全的本地笔记体验。以下内容说明我们如何处理你的数据，以及你作为用户的权利。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">1. 本地存储优先</h2>
          <p className="text-text-light mb-4">
            QCNOTE 默认将笔记内容、标签、分类、设置和搜索索引存储在你的浏览器本地（IndexedDB）。在未主动启用同步功能前，笔记数据不会上传到任何远程服务器。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">2. 可选同步</h2>
          <p className="text-text-light mb-4">
            如果你选择启用 WebDAV 或 OneDrive，同步行为仅在你完成配置后才会发生。我们不会在未经你授权的情况下自动开启云同步。
          </p>
          <p className="text-text-light mb-4">
            开启同步后，笔记数据按你的配置同步至你指定的存储位置。请注意，这些远程存储服务的隐私政策由相应服务提供商负责。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">3. 不收集个人数据</h2>
          <p className="text-text-light mb-4">
            QCNOTE 不会主动采集你的笔记内容、账号密码或私人信息。默认情况下我们也不启用任何第三方分析、广告或追踪功能。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">4. 导入与导出</h2>
          <p className="text-text-light mb-4">
            你可以自行导出笔记为 JSON 文件并在需要时导入。导出文件包含完整笔记内容，请妥善保管。建议将备份文件存储在你信任的设备或加密存储中。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">5. 第三方依赖</h2>
          <p className="text-text-light mb-4">
            QCNOTE 使用开源前端库（如 React、Tailwind、KaTeX 等）。这些库仅用于本地渲染和运行，不会自动共享你的笔记内容。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">6. 联系我们</h2>
          <p className="text-text-light mb-4">
            如有隐私问题、数据请求或建议，请通过我们的 <Link href="/contact" className="text-accent-pink hover:underline">联系页</Link> 与我们取得联系。
          </p>

          <p className="text-text-light text-sm mt-6">最后更新：2026 年 5 月 7 日</p>
        </div>
      </main>
      </Layout>
    </>
  );
}
