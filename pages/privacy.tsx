import Head from 'next/head';
import Link from 'next/link';
import React from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';

export default function Privacy() {
  return (
    <>
      <Head>
        <title>隐私政策 - NOTE</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta charSet="utf-8" />
      </Head>

      <Header />

      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl md:text-4xl font-bold text-primary-dark mb-4">隐私政策</h1>

        <div className="card">
          <p className="text-text-light leading-relaxed mb-4">
            NOTE 非常重视你的隐私。为了让你清楚了解我们如何处理数据，以下是我们对隐私的承诺和说明。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">1. 本地存储为优先</h2>
          <p className="text-text-light mb-4">
            NOTE 将笔记保存在你的浏览器本地（IndexedDB）。默认情况下我们不会将任何笔记、标签或元数据上报或存储到服务器。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">2. 导入与导出</h2>
          <p className="text-text-light mb-4">
            你可以自行导出所有笔记为 JSON 文件并在需要时导入。导出时请妥善保管导出的文件，因为其中包含你的完整笔记内容。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">3. 第三方资源</h2>
          <p className="text-text-light mb-4">
            NOTE 使用开源前端库（例如 React、Tailwind 等）。在默认配置下，NOTE 不会与第三方服务共享你的笔记内容。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">4. 本地备份建议</h2>
          <p className="text-text-light mb-4">
            为避免误删或浏览器数据丢失，建议定期使用“导出”功能进行本地备份或将备份文件保存到你信任的存储介质。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">5. 联系我们</h2>
          <p className="text-text-light mb-4">
            如有隐私方面的疑问或请求，请访问我们的 <Link href="/contact" className="text-accent-pink hover:underline">联系页</Link> 获取支持。
          </p>

          <p className="text-text-light text-sm mt-6">最后更新：2026 年 2 月 26 日</p>
        </div>
      </main>

      <Footer />
    </>
  );
}
