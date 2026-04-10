import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import React from 'react';
import Footer from '../components/Footer';

const Contact: React.FC = () => {
  return (
    <>
      <Head>
        <title>支持我们 - QCNOTE</title>
      </Head>

      <header>
        <nav className="max-w-6xl mx-auto flex justify-between items-center px-8 py-4">
          <Link
            href="/"
            className="flex gap-3 items-center text-2xl font-bold text-primary-dark hover:text-accent-pink transition-colors"
          >
            <Image
              src="/images/icons/note_icon.png"
              alt="QCNOTE logo"
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
              <Link
                href="/"
                className="text-primary-dark font-medium no-underline transition-colors hover:text-accent-pink"
              >
                首页
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard"
                className="text-primary-dark font-medium no-underline transition-colors hover:text-accent-pink"
              >
                笔记
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      <div className="container">
        <section className="text-center py-12">
          <h1 className="text-5xl font-bold text-primary-dark mb-4">💰 支持 QCNOTE</h1>
          <p className="text-xl text-text-light">感谢你对 QCNOTE 的支持和信任</p>
        </section>

        <section className="my-12">
          <div className="max-w-3xl mx-auto">
            <div className="card text-center mb-12">
              <h2 className="text-primary-dark mb-8 text-3xl font-bold">🎁 支持我们的方式</h2>
              <p className="text-text-light mb-8 text-lg leading-relaxed">
                如果 QCNOTE 对你有帮助，欢迎通过以下方式支持我们！你的支持是我们继续创新的动力。
              </p>

              <div className="flex flex-col items-center gap-8">
                <div>
                  <h3 className="text-primary-dark font-bold mb-6 text-2xl">扫一扫支持我们</h3>
                  <Image
                    src="/QR.png"
                    alt="收款码"
                    width={400}
                    height={400}
                    quality={75}
                    loading="lazy"
                    className="max-w-sm w-full rounded-2xl shadow-dark border-4 border-primary-light transition-all hover:scale-105 cursor-pointer"
                    onClick={() => window.open('/QR.png', '_blank')}
                  />
                  <p className="text-text-light text-lg mt-6">❤️ 你的支持是我们继续创新的动力！</p>
                </div>
              </div>
            </div>

            <div className="card">
              <h2 style={{ color: 'var(--primary-dark)', marginBottom: '1.5rem' }}>
                🎯 为什么支持 QCNOTE？
              </h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1.5rem',
                }}
              >
                <div>
                  <h4 style={{ color: 'var(--accent-pink)', marginBottom: '0.8rem' }}>
                    ✨ 简洁优雅
                  </h4>
                  <p style={{ color: 'var(--text-light)', lineHeight: 1.6 }}>
                    QCNOTE 提供简洁而优雅的笔记体验，让记录变成享受。
                  </p>
                </div>
                <div>
                  <h4 style={{ color: 'var(--accent-pink)', marginBottom: '0.8rem' }}>
                    🔐 完全隐私
                  </h4>
                  <p style={{ color: 'var(--text-light)', lineHeight: 1.6 }}>
                    100% 本地存储，不收集任何数据，保护你的隐私。
                  </p>
                </div>
                <div>
                  <h4 style={{ color: 'var(--accent-pink)', marginBottom: '0.8rem' }}>
                    ⚡ 轻量快速
                  </h4>
                  <p style={{ color: 'var(--text-light)', lineHeight: 1.6 }}>
                    零依赖，纯 JavaScript，快速加载，流畅运行。
                  </p>
                </div>
                <div>
                  <h4 style={{ color: 'var(--accent-pink)', marginBottom: '0.8rem' }}>
                    🎨 美观设计
                  </h4>
                  <p style={{ color: 'var(--text-light)', lineHeight: 1.6 }}>
                    精心设计的 UI，柔和的色彩，完整的动画效果。
                  </p>
                </div>
                <div>
                  <h4 style={{ color: 'var(--accent-pink)', marginBottom: '0.8rem' }}>
                    📱 完全响应
                  </h4>
                  <p style={{ color: 'var(--text-light)', lineHeight: 1.6 }}>
                    适配所有设备，无论在手机、平板还是电脑上完美显示。
                  </p>
                </div>
                <div>
                  <h4 style={{ color: 'var(--accent-pink)', marginBottom: '0.8rem' }}>
                    🌟 持续更新
                  </h4>
                  <p style={{ color: 'var(--text-light)', lineHeight: 1.6 }}>
                    我们不断改进和添加新功能，感谢你的支持！
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="my-12 text-center">
          <div
            className="card"
            style={{
              background:
                'linear-gradient(135deg, rgba(220, 150, 180, 0.1), rgba(176, 168, 192, 0.1))',
            }}
          >
            <h2 className="text-primary-dark mb-4 text-3xl font-bold">❤️ 感谢你的支持</h2>
            <p className="text-text-light text-lg leading-relaxed">
              无论是通过扫码支持、提交反馈还是在 GitHub 上给我们一个
              Star，你的每一个行动都对我们有重要意义。
            </p>
          </div>
        </section>

        <section className="my-12 text-center">
          <Link href="/" className="btn btn-primary mx-2">
            ← 返回首页
          </Link>
          <Link href="/dashboard" className="btn btn-secondary mx-2">
            前往笔记 →
          </Link>
        </section>
      </div>

      <Footer
        layout="full"
        customLinks={[
          { label: '首页', href: '/' },
          { label: '笔记', href: '/dashboard' },
        ]}
      />
    </>
  );
};

export default Contact;
