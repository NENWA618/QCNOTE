import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import React from 'react';
import Footer from '../components/Footer';

export default function Home() {
  return (
    <>
      <Head>
        {/* Primary Meta Tags */}
        <title>QCNOTE - AI驱动的个人笔记管理平台</title>
        <meta name="title" content="QCNOTE - AI驱动的个人笔记管理平台" />
        <meta name="description" content="跨设备同步、智能分类、离线优先的全功能笔记应用。使用AI助手快速整理和分析你的笔记。安全的个人知识库管理。" />
        <meta name="keywords" content="笔记应用,知识管理,AI助手,个人日记,笔记管理,跨平台,离线优先" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta charSet="utf-8" />
        <meta name="theme-color" content="#c8b8c8" />
        <link rel="icon" href="/images/icons/note_icon.png" />

        {/* Open Graph Meta Tags */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://qcnote.example.com/" />
        <meta property="og:title" content="QCNOTE - 个人笔记管理平台" />
        <meta property="og:description" content="智能、安全、跨平台的笔记应用。AI助手帮你快速整理和分析笔记。" />
        <meta property="og:image" content="https://qcnote.example.com/images/icons/note_icon.png" />
        <meta property="og:site_name" content="QCNOTE" />
        <meta property="og:locale" content="zh_CN" />

        {/* Twitter Card Meta Tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content="https://qcnote.example.com/" />
        <meta name="twitter:title" content="QCNOTE - 个人笔记管理平台" />
        <meta name="twitter:description" content="智能、安全、跨平台的笔记应用" />
        <meta name="twitter:image" content="https://qcnote.example.com/images/icons/note_icon.png" />

        {/* Additional SEO Tags */}
        <link rel="canonical" href="https://qcnote.example.com/" />
        <link rel="alternate" hrefLang="zh" href="https://qcnote.example.com/" />
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
              'description': 'AI驱动的个人笔记管理平台',
              'url': 'https://qcnote.example.com',
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
              'url': 'https://qcnote.example.com',
              'logo': 'https://qcnote.example.com/images/icons/note_icon.png',
              'description': '智能笔记应用平台',
              'contact': {
                '@type': 'ContactPoint',
                'contactType': 'Customer Support',
                'url': 'https://qcnote.example.com/contact'
              }
            })
          }}
        />
      </Head>

      <header>
        <nav className="max-w-6xl mx-auto flex justify-between items-center px-8 py-4">
          <Link
            href="/"
            className="flex gap-3 items-center text-2xl font-bold text-primary-dark hover:text-accent-pink transition-colors hover:scale-105"
          >
            <Image
              src="/images/icons/note_icon.png"
              alt="QCNOTE"
              width={48}
              height={48}
              quality={75}
              className="rounded-lg shadow-light"
              priority
            />
            <span>QCNOTE</span>
          </Link>
          <ul className="flex gap-8 list-none">
            <li>
              <a
                href="#features"
                className="text-primary-dark font-medium no-underline transition-colors hover:text-accent-pink"
              >
                功能
              </a>
            </li>
            <li>
              <Link
                href="/dashboard"
                className="text-primary-dark font-medium no-underline transition-colors hover:text-accent-pink"
              >
                开始使用
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      <div className="container">
        <section className="text-center py-12 md:py-20">
          <div className="mb-8 inline-block">
            <div className="w-14 h-14 md:w-16 md:h-16 mx-auto mb-6 bg-gradient-to-br from-accent-pink to-accent-purple rounded-2xl flex items-center justify-center shadow-medium transform hover:scale-110 transition-transform">
              <span className="text-3xl md:text-4xl emoji">📝</span>
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary-dark mb-4 md:mb-6">
            QCNOTE
          </h1>
          <p className="text-lg md:text-xl lg:text-2xl text-text-light mb-6 md:mb-8">
            用心记录，思考每一刻
          </p>
          <Link href="/dashboard" className="btn btn-primary">
            ✨ 开始记录
          </Link>
        </section>

        <section id="features" className="mt-12 md:mt-16">
          <h2 className="text-center text-primary-dark mb-8 md:mb-12 text-2xl md:text-4xl font-bold">
            ✨ 核心功能
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
            <div className="card">
              <h3 className="text-accent-pink text-4xl mb-2">📝</h3>
              <h4 className="text-primary-dark mb-4 text-lg font-semibold">轻量化编辑</h4>
              <p className="text-text-light m-0">
                简洁的编辑界面，让你专注于内容本身，无需复杂的操作。
              </p>
            </div>

            <div className="card" style={{ background: 'rgba(220, 150, 180, 0.08)' }}>
              <h3 className="text-accent-pink text-4xl mb-2">🏷️</h3>
              <h4 className="text-primary-dark mb-4 text-lg font-semibold">智能分类</h4>
              <p className="text-text-light m-0">按分类和标签组织笔记，快速找到你需要的内容。</p>
            </div>

            <div className="card">
              <h3 className="text-accent-pink text-4xl mb-2">🔍</h3>
              <h4 className="text-primary-dark mb-4 text-lg font-semibold">全文搜索</h4>
              <p className="text-text-light m-0">强大的搜索功能，瞬间定位任何笔记或关键字。</p>
            </div>

            <div className="card" style={{ background: 'rgba(176, 168, 192, 0.08)' }}>
              <h3 className="text-accent-pink text-4xl mb-2">❤️</h3>
              <h4 className="text-primary-dark mb-4 text-lg font-semibold">收藏管理</h4>
              <p className="text-text-light m-0">标记重要笔记，随时查看你最关心的内容。</p>
            </div>

            <div className="card">
              <h3 className="text-accent-pink text-4xl mb-2">💾</h3>
              <h4 className="text-primary-dark mb-4 text-lg font-semibold">自动保存</h4>
              <p className="text-text-light m-0">无需手动保存，实时保存你的笔记到本地。</p>
            </div>

            <div className="card" style={{ background: 'rgba(220, 150, 180, 0.06)' }}>
              <h3 className="text-accent-pink text-4xl mb-2">📊</h3>
              <h4 className="text-primary-dark mb-4 text-lg font-semibold">数据统计</h4>
              <p className="text-text-light m-0">可视化统计笔记数据，了解你的写作习惯。</p>
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
                <h3 className="text-accent-pink mb-2 font-semibold">2️⃣ 组织分类</h3>
                <p className="text-text-light">为笔记选择分类和添加标签，方便后续查找。</p>
              </div>
              <div>
                <h3 className="text-accent-pink mb-2 font-semibold">3️⃣ 搜索查阅</h3>
                <p className="text-text-light">
                  使用搜索功能查找笔记。快捷键{' '}
                  <code className="bg-primary-light px-2 py-1 rounded text-sm font-mono">
                    Ctrl+K
                  </code>
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="mt-12 md:mt-16">
          <div className="card">
            <h2 className="text-primary-dark mb-6 text-2xl md:text-3xl font-bold">❓ 关于 QCNOTE</h2>
            <p className="text-text-light leading-relaxed">
              QCNOTE
              是一个简洁而优雅的个人笔记应用。我们相信，记录是思考的开始，而思考是成长的源动力。无论你是在记录日常的点滴，还是在思考人生的意义，QCNOTE
              都为你提供一个安静而温暖的空间。
            </p>
            <p className="text-text-light leading-relaxed mt-4">
              <strong>设计理念：</strong>
              柔和、温暖、高级。我们坚信，记录应该是一种享受，而不是负担。
            </p>
            <p className="text-text-light leading-relaxed mt-4">
              <strong>隐私保护：</strong>
              你的所有笔记都存储在你的浏览器本地，我们不收集任何数据。你的隐私是我们最高的优先级。
            </p>
          </div>
        </section>

        <section id="faq" className="mt-12 md:mt-16">
          <h2 className="text-center text-primary-dark mb-8 md:mb-12 text-2xl md:text-4xl font-bold">
            ❓ 常见问题
          </h2>
          <div className="max-w-2xl mx-auto">
            <div className="card mb-4">
              <h3 className="text-primary-dark mb-4 font-bold">我的笔记会被云备份吗？</h3>
              <p className="text-text-light">
                目前，笔记完全存储在你的浏览器本地。为了防止数据丢失，我们提供了导出功能，你可以随时下载备份。
              </p>
            </div>
            <div className="card mb-4">
              <h3 className="text-primary-dark mb-4 font-bold">能否支持Markdown？</h3>
              <p className="text-text-light">
                已完全支持！你可以在笔记中使用 Markdown 语法（包括表格、代码块、粗体等）。编辑时可在&quot;编辑&quot;和&quot;预览&quot;之间切换，实时查看渲染效果。
              </p>
            </div>
            <div className="card">
              <h3 className="text-primary-dark mb-4 font-bold">能否在多个设备同步？</h3>
              <p className="text-text-light">
                目前不支持多设备同步。但你可以在一个设备上导出笔记，然后在另一个设备导入。
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
              如果 QCNOTE 帮助了你，欢迎通过支持我们来鼓励我们的创新！
            </p>
            <Link href="/contact" className="btn btn-primary">
              💰 支持我们
            </Link>
          </div>
        </section>
      </div>

      <Footer layout="minimal" />
    </>
  );
}
