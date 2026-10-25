import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';

const EMAIL = 'yours@girl.cat';
const REPO_URL = 'https://github.com/NENWA618/QCNOTE';

const panelClass =
  'rounded-2xl border border-primary-light/40 bg-white/95 dark:border-dark-border dark:bg-dark-surface';

const FEEDBACK_WAYS = [
  {
    icon: '🐛',
    title: 'Bug 报告',
    text: '发现应用中的问题？请在 GitHub Issues 中详细描述问题和重现步骤。',
    href: `${REPO_URL}/issues/new`,
    action: '提交 Issue',
  },
  {
    icon: '💬',
    title: '功能建议',
    text: '有新想法或功能建议？欢迎在 GitHub Issues 中提出和讨论。',
    href: `${REPO_URL}/issues`,
    action: '查看 Issues',
  },
  {
    icon: '❓',
    title: '问题咨询',
    text: '遇到使用问题？可以直接发邮件，或在 GitHub Issues 中提问。',
    href: `mailto:${EMAIL}`,
    action: '发邮件提问',
  },
];

function CopyEmailButton() {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setState('copied');
    } catch {
      setState('failed');
    }
  };

  return (
    <button type="button" onClick={copy} className="btn btn-secondary" aria-live="polite">
      {state === 'copied' ? '✓ 已复制' : state === 'failed' ? '复制失败' : '复制邮箱'}
    </button>
  );
}

const Contact: React.FC = () => {
  const [qrOpen, setQrOpen] = useState(false);

  // 放大查看时：Esc 关闭，锁住背景滚动
  useEffect(() => {
    if (!qrOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQrOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [qrOpen]);

  return (
    <>
      <Head>
        <title>联系我们 - QCNOTE</title>
        <meta
          name="description"
          content="联系 QCNOTE 团队。反馈建议、问题报告、合作洽谈等。我们期待听到你的声音！"
        />
      </Head>

      <Layout footerLayout="full">
        <div className="mx-auto max-w-4xl">
          {/* 标题 */}
          <section className="py-6 text-center sm:py-12">
            <h1 className="text-3xl font-bold text-ink sm:text-5xl dark:text-dark-text">
              📧 联系我们
            </h1>
            <p className="mt-3 text-base text-text-light sm:mt-4 sm:text-xl">
              我们期待听到你的声音！反馈、建议、问题都欢迎。
            </p>
          </section>

          {/* 联系方式 */}
          <section aria-label="联系方式" className="grid gap-4 sm:gap-6 md:grid-cols-2">
            <div className={`${panelClass} flex flex-col p-5 sm:p-6`}>
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-light text-xl dark:bg-accent-pink/15"
                >
                  📧
                </span>
                <h2 className="text-xl font-bold text-ink dark:text-dark-text">邮件反馈</h2>
              </div>
              <p className="mt-3 text-text-light">
                有任何问题、建议或合作想法？直接发邮件告诉我们。
              </p>
              <p className="mt-3 rounded-xl bg-primary-light/50 px-3 py-2 font-mono text-sm break-all text-ink dark:bg-dark-surface-light dark:text-dark-text">
                {EMAIL}
              </p>
              <div className="mt-auto grid grid-cols-2 gap-3 pt-5">
                <a href={`mailto:${EMAIL}`} className="btn btn-primary">
                  发送邮件
                </a>
                <CopyEmailButton />
              </div>
            </div>

            <div className={`${panelClass} flex flex-col p-5 sm:p-6`}>
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-light text-xl dark:bg-accent-pink/15"
                >
                  🐙
                </span>
                <h2 className="text-xl font-bold text-ink dark:text-dark-text">GitHub</h2>
              </div>
              <p className="mt-3 text-text-light">查看源代码、提交 Issue、贡献代码。</p>
              <p className="mt-3 rounded-xl bg-primary-light/50 px-3 py-2 font-mono text-sm break-all text-ink dark:bg-dark-surface-light dark:text-dark-text">
                NENWA618/QCNOTE
              </p>
              <div className="mt-auto grid grid-cols-2 gap-3 pt-5">
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                >
                  访问仓库
                </a>
                <a
                  href={`${REPO_URL}/issues/new`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                >
                  提交 Issue
                </a>
              </div>
            </div>
          </section>

          {/* 反馈方式 */}
          <section className="mt-10 sm:mt-12" aria-labelledby="feedback-heading">
            <h2
              id="feedback-heading"
              className="mb-4 text-xl font-bold text-ink sm:text-2xl dark:text-dark-text"
            >
              💡 反馈方式
            </h2>
            <ul className="grid gap-3 sm:gap-4 md:grid-cols-3">
              {FEEDBACK_WAYS.map((way) => {
                const external = way.href.startsWith('http');
                return (
                  <li key={way.title}>
                    <a
                      href={way.href}
                      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      className={`${panelClass} group flex h-full flex-col p-5 transition-colors hover:border-accent-pink/60`}
                    >
                      <h3 className="font-bold text-ink-pink">
                        <span aria-hidden="true">{way.icon} </span>
                        {way.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-text-light">{way.text}</p>
                      <span className="mt-auto pt-4 text-sm font-medium text-ink-pink group-hover:underline">
                        {way.action} →
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* TNG 支持 */}
          <section
            className={`${panelClass} mt-10 overflow-hidden sm:mt-12`}
            aria-labelledby="support-heading"
          >
            <div className="grid items-center gap-6 p-5 sm:p-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              <div className="text-center md:text-left">
                <h2
                  id="support-heading"
                  className="text-xl font-bold text-ink sm:text-2xl dark:text-dark-text"
                >
                  ☕ Buy Me a Coffee / TNG
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setQrOpen(true)}
                aria-label="放大查看 TNG 收款二维码"
                className="block w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-transform hover:scale-[1.01] dark:border-dark-border"
              >
                <Image
                  src="/tngqr.png"
                  alt="TNG 收款二维码"
                  width={1536}
                  height={1024}
                  sizes="(min-width: 768px) 28rem, 100vw"
                  className="h-auto w-full"
                />
              </button>
            </div>
          </section>
        </div>

        {/* 二维码放大查看 */}
        {qrOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="TNG 收款二维码"
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/80 p-4"
            onClick={() => setQrOpen(false)}
          >
            <Image
              src="/tngqr.png"
              alt="TNG 收款二维码"
              width={1536}
              height={1024}
              sizes="100vw"
              loading="eager"
              className="h-auto max-h-[80vh] w-auto max-w-full rounded-xl bg-white"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              autoFocus
              onClick={() => setQrOpen(false)}
              className="btn btn-secondary"
            >
              关闭
            </button>
          </div>
        )}
      </Layout>
    </>
  );
};

export default Contact;
