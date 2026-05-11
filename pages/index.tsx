import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import React from 'react';
import Layout from '../components/Layout';

export default function Home() {
  return (
    <>
      <Head>
        {/* Primary Meta Tags */}
        <title>QCNOTE - 私有本地优先的个人笔记平台</title>
        <meta name="title" content="QCNOTE - 私有本地优先的个人笔记平台" />
        <meta name="description" content="本地优先、隐私优先的个人笔记应用，支持Markdown、搜索、分类和离线保存。安全的个人知识库管理系统。" />
        <meta name="keywords" content="笔记应用,知识管理,个人日记,笔记管理,跨平台,离线优先" />

        {/* Open Graph Meta Tags */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://qcnote.com/" />
        <meta property="og:title" content="QCNOTE - 个人笔记管理平台" />
        <meta property="og:description" content="智能、安全、跨平台的笔记应用。专注于本地存储与隐私保护，让你安心记录每一刻。" />
        <meta property="og:image" content="https://qcnote.com/images/icons/note_icon.png" />
        <meta property="og:site_name" content="QCNOTE" />
        <meta property="og:locale" content="zh_CN" />

        {/* Twitter Card Meta Tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content="https://qcnote.com/" />
        <meta name="twitter:title" content="QCNOTE - 个人笔记管理平台" />
        <meta name="twitter:description" content="智能、安全、跨平台的笔记应用。专注于本地数据与离线体验。" />
        <meta name="twitter:image" content="https://qcnote.com/images/icons/note_icon.png" />

        {/* Additional SEO Tags */}
        <link rel="canonical" href="https://qcnote.com/" />
        <link rel="alternate" hrefLang="zh" href="https://qcnote.com/" />
        <meta name="author" content="QCNOTE Team" />
        <meta name="copyright" content="© 2025-2026 QCNOTE. All rights reserved." />

        {/* Structured Data (JSON-LD) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              'name': 'QCNOTE',
              'description': '本地优先的个人笔记管理平台，强调隐私与易用性。',
              'url': 'https://qcnote.com',
              'applicationCategory': 'ProductivityApplication',
              'offers': {
                '@type': 'Offer',
                'price': '0',
                'priceCurrency': 'CNY'
              },
              'aggregateRating': {
                '@type': 'AggregateRating',
                'ratingValue': '4.8',
                'ratingCount': '1000'
              }
            })
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              'name': 'QCNOTE',
              'url': 'https://qcnote.com',
              'logo': 'https://qcnote.com/images/icons/note_icon.png',
              'description': '智能笔记应用平台',
              'contact': {
                '@type': 'ContactPoint',
                'contactType': 'Customer Support',
                'url': 'https://qcnote.com/contact'
              }
            })
          }}
        />
      </Head>

      <Layout footerLayout="minimal">
        <section className="hero-panel text-center py-16 md:py-24">
          <div className="mb-8 inline-block">
            <div className="w-14 h-14 md:w-16 md:h-16 mx-auto mb-6 bg-gradient-to-br from-accent-pink to-accent-purple rounded-2xl flex items-center justify-center shadow-medium transform hover:scale-110 transition-transform">
              <Image
                src="/images/icons/note_icon.png"
                alt="QCNOTE note icon"
                width={64}
                height={64}
                quality={90}
                className="drop-shadow-lg"
              />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary-dark mb-4 md:mb-6">
            QCNOTE
          </h1>
          <p className="text-lg md:text-xl lg:text-2xl text-text-light mb-6 md:mb-8">
            用心记录，思考每一刻
          </p>
          <Link href="/dashboard" className="btn btn-primary">
            开始记录
          </Link>
        </section>

        <section id="features" className="mt-12 md:mt-16">
          <h2 className="text-center text-primary-dark mb-8 md:mb-12 text-2xl md:text-4xl font-bold">
            🌟 核心功能
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            <div className="card group animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-accent-pink to-accent-purple rounded-xl flex items-center justify-center mr-4 shadow-medium">
                  <span className="text-2xl">📝</span>
                </div>
                <h4 className="text-primary-dark text-lg font-semibold group-hover:text-accent-pink transition-colors">Markdown 编辑</h4>
              </div>
              <p className="text-text-light leading-relaxed">
                完整的 Markdown 支持，包括表格、代码块、链接等。实时预览，让内容组织更清晰。
              </p>
            </div>

            <div className="card group" style={{ background: 'rgba(220, 150, 180, 0.08)' }}>
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-accent-pink to-accent-purple rounded-xl flex items-center justify-center mr-4 shadow-medium">
                  <span className="text-2xl">🧮</span>
                </div>
                <h4 className="text-primary-dark text-lg font-semibold group-hover:text-accent-pink transition-colors">LaTeX 公式</h4>
              </div>
              <p className="text-text-light leading-relaxed">
                支持数学公式渲染，行内公式 <code>$...$</code> 和块级公式 <code>$$...$$</code>。
              </p>
            </div>

            <div className="card group">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-accent-pink to-accent-purple rounded-xl flex items-center justify-center mr-4 shadow-medium">
                  <span className="text-2xl">🔗</span>
                </div>
                <h4 className="text-primary-dark text-lg font-semibold group-hover:text-accent-pink transition-colors">双链支持</h4>
              </div>
              <p className="text-text-light leading-relaxed">
                使用 <code>[[笔记标题]]</code> 创建双向链接，自动生成反向链接和关联关系。
              </p>
            </div>

            <div className="card group" style={{ background: 'rgba(176, 168, 192, 0.08)' }}>
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-accent-pink to-accent-purple rounded-xl flex items-center justify-center mr-4 shadow-medium">
                  <span className="text-2xl">📊</span>
                </div>
                <h4 className="text-primary-dark text-lg font-semibold group-hover:text-accent-pink transition-colors">知识图谱</h4>
              </div>
              <p className="text-text-light leading-relaxed">
                可视化呈现笔记之间的联系。蓝线表示反向链接，紫线表示主动引用。
              </p>
            </div>

            <div className="card group">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-accent-pink to-accent-purple rounded-xl flex items-center justify-center mr-4 shadow-medium">
                  <span className="text-2xl">🔍</span>
                </div>
                <h4 className="text-primary-dark text-lg font-semibold group-hover:text-accent-pink transition-colors">智能搜索</h4>
              </div>
              <p className="text-text-light leading-relaxed">
                全文搜索 + 语义搜索 + 模糊匹配。瞬间定位任何笔记或关键字。
              </p>
            </div>

            <div className="card group" style={{ background: 'rgba(220, 150, 180, 0.06)' }}>
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-accent-pink to-accent-purple rounded-xl flex items-center justify-center mr-4 shadow-medium">
                  <span className="text-2xl">⏰</span>
                </div>
                <h4 className="text-primary-dark text-lg font-semibold group-hover:text-accent-pink transition-colors">版本历史</h4>
              </div>
              <p className="text-text-light leading-relaxed">
                完整的版本控制。对比历史版本，一键恢复任意版本。
              </p>
            </div>

            <div className="card group">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-accent-pink to-accent-purple rounded-xl flex items-center justify-center mr-4 shadow-medium">
                  <span className="text-2xl">📱</span>
                </div>
                <h4 className="text-primary-dark text-lg font-semibold group-hover:text-accent-pink transition-colors">云端同步</h4>
              </div>
              <p className="text-text-light leading-relaxed">
                支持 WebDAV 和 OneDrive 同步。跨设备无缝工作。
              </p>
            </div>

            <div className="card group" style={{ background: 'rgba(220, 150, 180, 0.08)' }}>
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-accent-pink to-accent-purple rounded-xl flex items-center justify-center mr-4 shadow-medium">
                  <span className="text-2xl">💬</span>
                </div>
                <h4 className="text-primary-dark text-lg font-semibold group-hover:text-accent-pink transition-colors">社区论坛</h4>
              </div>
              <p className="text-text-light leading-relaxed">
                分享笔记、讨论话题、互相学习。关注用户、查看排行榜。
              </p>
            </div>

            <div className="card group">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-accent-pink to-accent-purple rounded-xl flex items-center justify-center mr-4 shadow-medium">
                  <span className="text-2xl">🎨</span>
                </div>
                <h4 className="text-primary-dark text-lg font-semibold group-hover:text-accent-pink transition-colors">深色模式</h4>
              </div>
              <p className="text-text-light leading-relaxed">
                完美的浅色和深色主题切换。护眼设计，全天舒适体验。
              </p>
            </div>
          </div>
        </section>

        <section id="guide" className="mt-12 md:mt-16">
          <div className="card">
            <h2 className="text-primary-dark mb-6 text-2xl md:text-3xl font-bold">📖 快速开始</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
              <div>
                <h3 className="text-accent-pink mb-2 font-semibold">1️⃣ 创建笔记</h3>
                <p className="text-text-light">
                  点击“新建笔记”按钮，开始写下你的想法。支持快捷键{' '}
                  <code className="bg-primary-light px-2 py-1 rounded text-sm font-mono">
                    Ctrl+N
                  </code>
                </p>
              </div>
              <div>
                <h3 className="text-accent-pink mb-2 font-semibold">2️⃣ 灵活编写</h3>
                <p className="text-text-light">
                  使用 Markdown 格式、LaTeX 公式、双链引用。内容自动保存到本地。
                </p>
              </div>
              <div>
                <h3 className="text-accent-pink mb-2 font-semibold">3️⃣ 智能搜索</h3>
                <p className="text-text-light">
                  使用搜索功能查找笔记。快捷键{' '}
                  <code className="bg-primary-light px-2 py-1 rounded text-sm font-mono">
                    Ctrl+K
                  </code>
                </p>
              </div>
              <div>
                <h3 className="text-accent-pink mb-2 font-semibold">4️⃣ 组织管理</h3>
                <p className="text-text-light">
                  为笔记添加标签、分类。查看知识图谱，直观了解笔记关系。
                </p>
              </div>
              <div>
                <h3 className="text-accent-pink mb-2 font-semibold">5️⃣ 版本控制</h3>
                <p className="text-text-light">
                  查看笔记的修改历史，对比不同版本，一键恢复历史版本。
                </p>
              </div>
              <div>
                <h3 className="text-accent-pink mb-2 font-semibold">6️⃣ 云端同步</h3>
                <p className="text-text-light">
                  配置 WebDAV 或 OneDrive 同步，实现多设备协同工作。
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="mt-12 md:mt-16">
          <div className="card">
            <h2 className="text-primary-dark mb-6 text-2xl md:text-3xl font-bold">💎 关于 QCNOTE</h2>
            <p className="text-text-light leading-relaxed">
              QCNOTE 是一个现代化的个人笔记应用，致力于提供**隐私优先、离线优先**的记录体验。我们相信，记录是思考的开始，而思考是成长的源动力。
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <div>
                <h3 className="text-accent-pink mb-2 font-semibold">🔒 隐私保护</h3>
                <p className="text-text-light">
                  你的所有笔记都存储在你的本地设备上，我们不收集任何个人数据。你的隐私是我们最高的优先级。
                </p>
              </div>
              <div>
                <h3 className="text-accent-pink mb-2 font-semibold">🚀 离线优先</h3>
                <p className="text-text-light">
                  无需网络连接，QCNOTE 完整功能都能离线工作。网络连接只是用于可选的云端同步。
                </p>
              </div>
              <div>
                <h3 className="text-accent-pink mb-2 font-semibold">🎨 美观设计</h3>
                <p className="text-text-light">
                  精心设计的 UI，柔和的配色，流畅的动画。浅色和深色双模式护眼设计。
                </p>
              </div>
              <div>
                <h3 className="text-accent-pink mb-2 font-semibold">⚡ 高性能</h3>
                <p className="text-text-light">
                  轻量级应用，极速加载，流畅运行。优化的搜索和渲染性能。
                </p>
              </div>
              <div>
                <h3 className="text-accent-pink mb-2 font-semibold">📱 全平台</h3>
                <p className="text-text-light">
                  完美支持桌面、平板和手机。响应式设计，无缝适配任何屏幕尺寸。
                </p>
              </div>
              <div>
                <h3 className="text-accent-pink mb-2 font-semibold">🔄 持续更新</h3>
                <p className="text-text-light">
                  不断改进和添加新功能。拥抱新技术，为用户提供最佳体验。
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="mt-12 md:mt-16">
          <h2 className="text-center text-primary-dark mb-8 md:mb-12 text-2xl md:text-4xl font-bold">
            ❓ 常见问题
          </h2>
          <div className="max-w-2xl mx-auto">
            <div className="card mb-4">
              <h3 className="text-primary-dark mb-4 font-bold">我的笔记数据安全吗？</h3>
              <p className="text-text-light">
                完全安全。所有笔记存储在你的本地设备上，我们不收集任何数据。可选的云端同步由你完全掌控（WebDAV/OneDrive）。
              </p>
            </div>
            <div className="card mb-4">
              <h3 className="text-primary-dark mb-4 font-bold">支持 Markdown 和数学公式吗？</h3>
              <p className="text-text-light">
                完全支持！支持完整的 Markdown 语法、LaTeX 数学公式、双链引用 [[标题]]。编辑时可实时预览。
              </p>
            </div>
            <div className="card mb-4">
              <h3 className="text-primary-dark mb-4 font-bold">能在多个设备同步吗？</h3>
              <p className="text-text-light">
                支持！通过 WebDAV 或 OneDrive 进行云端同步。配置好后可实现自动同步，也支持手动导入导出。
              </p>
            </div>
            <div className="card mb-4">
              <h3 className="text-primary-dark mb-4 font-bold">什么是双链和知识图谱？</h3>
              <p className="text-text-light">
                双链是指使用 [[笔记标题]] 创建的笔记间的相互引用。知识图谱则可视化显示笔记的关系网络，帮你看清思想脉络。
              </p>
            </div>
            <div className="card">
              <h3 className="text-primary-dark mb-4 font-bold">如何恢复删除的笔记？</h3>
              <p className="text-text-light">
                删除的笔记会进入回收站。在回收站中可以查看、恢复或彻底删除。还支持完整的版本历史，可恢复任意历史版本。
              </p>
            </div>
          </div>
        </section>

        <section className="mt-16 mb-16 text-center">
          <div
            className="card"
            style={{
              background:
                'linear-gradient(135deg, rgba(220, 150, 180, 0.1), rgba(176, 168, 192, 0.1))',
            }}
          >
            <h2 className="text-primary-dark mb-6 text-3xl font-bold">💝 喜欢 QCNOTE 吗？</h2>
            <p className="text-text-light mb-8 text-lg leading-relaxed">
              如果 QCNOTE 帮助了你，欢迎通过支持我们来鼓励我们的创新。
            </p>
            <Link href="/contact" className="btn btn-primary">
              💰 支持我们
            </Link>
          </div>
        </section>
      </Layout>
    </>
  );
}
