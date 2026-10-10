import Head from 'next/head';
import HeroSection from '../components/HeroSection';
import Layout from '../components/Layout';

export default function Home() {
  return (
    <>
      <Head>
        {/* Primary Meta Tags */}
        <title>QCNOTE - 私有本地优先的个人笔记平台</title>
        <meta name="title" content="QCNOTE - 私有本地优先的个人笔记平台" />
        <meta
          name="description"
          content="本地优先、隐私优先的个人笔记应用，支持Markdown、搜索、分类和离线保存。安全的个人知识库管理系统。"
        />
        <meta name="keywords" content="笔记应用,知识管理,个人日记,笔记管理,跨平台,离线优先" />

        {/* Open Graph Meta Tags */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://qcnote.com/" />
        <meta property="og:title" content="QCNOTE - 个人笔记管理平台" />
        <meta
          property="og:description"
          content="智能、安全、跨平台的笔记应用。专注于本地存储与隐私保护，让你安心记录每一刻。"
        />
        <meta property="og:image" content="https://qcnote.com/images/icons/note_icon.png" />
        <meta property="og:site_name" content="QCNOTE" />
        <meta property="og:locale" content="zh_CN" />

        {/* Twitter Card Meta Tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content="https://qcnote.com/" />
        <meta name="twitter:title" content="QCNOTE - 个人笔记管理平台" />
        <meta
          name="twitter:description"
          content="智能、安全、跨平台的笔记应用。专注于本地数据与离线体验。"
        />
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
              name: 'QCNOTE',
              description: '本地优先的个人笔记管理平台，强调隐私与易用性。',
              url: 'https://qcnote.com',
              applicationCategory: 'ProductivityApplication',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'CNY',
              },
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'QCNOTE',
              url: 'https://qcnote.com',
              logo: 'https://qcnote.com/images/icons/note_icon.png',
              description: '智能笔记应用平台',
              contact: {
                '@type': 'ContactPoint',
                contactType: 'Customer Support',
                url: 'https://qcnote.com/contact',
              },
            }),
          }}
        />
      </Head>

      <Layout footerLayout="minimal" fullBleed>
        <HeroSection />
      </Layout>
    </>
  );
}
