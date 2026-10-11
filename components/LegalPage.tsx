import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from './Layout';

export interface LegalSection {
  /** 锚点 id，用于目录跳转和分享链接（如 /privacy#sync） */
  id: string;
  title: string;
  body: React.ReactNode;
}

interface LegalPageProps {
  title: string;
  description: string;
  /** 例如“2026 年 5 月 21 日” */
  updated: string;
  intro: React.ReactNode;
  sections: LegalSection[];
  /** 另一份法律文档，显示在标题下方和文末 */
  related: { href: string; label: string };
}

// header 是 sticky 且约 5rem 高：跳转后标题不能被它挡住，滚动监听也要把这段让出来
const HEADER_OFFSET = 96;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 当前滚动到的章节：取顶部已越过 header 下沿的最后一节 */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => {
      let current: string | null = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - HEADER_OFFSET - 8 <= 0) current = id;
      }
      // 滚到底时最后几节可能永远到不了顶部，直接算作最后一节
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        current = ids[ids.length - 1] ?? current;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ids]);

  return active;
}

function useScrolledPast(threshold: number) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return past;
}

function scrollToSection(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  history.replaceState(null, '', `#${id}`);
}

export default function LegalPage({
  title,
  description,
  updated,
  intro,
  sections,
  related,
}: LegalPageProps) {
  const [ids] = useState(() => sections.map((s) => s.id));
  const active = useActiveSection(ids);
  const showBackToTop = useScrolledPast(600);

  const toc = (onNavigate?: (link: HTMLAnchorElement) => void) => (
    <ol className="space-y-0.5 text-sm">
      {sections.map((s, i) => {
        const isActive = active === s.id;
        return (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              onClick={(e) => {
                // 先收起移动端目录再滚动：否则目录收起导致内容上移，落点会偏
                onNavigate?.(e.currentTarget);
                scrollToSection(e, s.id);
              }}
              aria-current={isActive ? 'location' : undefined}
              className={`flex gap-2 rounded-lg border-l-2 px-3 py-1.5 transition-colors ${
                isActive
                  ? 'border-accent-pink bg-primary-light/60 font-medium text-ink-pink dark:bg-accent-pink/10'
                  : 'border-transparent text-text-light hover:bg-primary-light/40 hover:text-ink dark:hover:bg-dark-surface-light dark:hover:text-dark-text'
              }`}
            >
              <span className="tabular-nums opacity-70">{i + 1}.</span>
              <span>{s.title}</span>
            </a>
          </li>
        );
      })}
    </ol>
  );

  return (
    <>
      <Head>
        <title>{`${title} - QCNOTE`}</title>
        <meta name="description" content={description} />
      </Head>

      <Layout>
        <article className="mx-auto max-w-6xl">
          <div className="mb-6 sm:mb-8">
            <p className="text-sm font-medium text-ink-pink">法律信息</p>
            <h1 className="mt-1 text-2xl font-bold text-ink sm:text-4xl dark:text-dark-text">
              {title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-text-light">
              <span>最后更新：{updated}</span>
              <span aria-hidden="true" className="hidden sm:inline">
                ·
              </span>
              <Link href={related.href} className="text-ink-pink hover:underline">
                查看{related.label} →
              </Link>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
            {/* 桌面端：吸顶目录 */}
            <nav aria-label="目录" className="hidden lg:block">
              <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-4">
                <p className="mb-2 px-3 text-xs font-semibold tracking-wider text-text-light">
                  目录
                </p>
                {toc()}
              </div>
            </nav>

            <div className="min-w-0">
              {/* 移动端：可折叠目录 */}
              <details className="group mb-4 rounded-2xl border border-primary-light/40 bg-white/95 lg:hidden dark:border-dark-border dark:bg-dark-surface">
                <summary className="flex min-h-[2.75rem] cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-ink dark:text-dark-text [&::-webkit-details-marker]:hidden">
                  <span>目录 · {sections.length} 节</span>
                  <span
                    aria-hidden="true"
                    className="text-text-light transition-transform group-open:rotate-180"
                  >
                    ▾
                  </span>
                </summary>
                <div className="border-t border-gray-100 px-1 py-2 dark:border-dark-border">
                  {toc((link) => {
                    // 不用 document.activeElement：iOS Safari 点链接不会让它获得焦点
                    const details = link.closest('details');
                    if (details) details.open = false;
                  })}
                </div>
              </details>

              <div className="rounded-2xl border border-primary-light/40 bg-white/95 px-5 py-6 sm:px-10 sm:py-10 dark:border-dark-border dark:bg-dark-surface">
                <div className="max-w-[68ch] text-[15px] leading-7 text-gray-700 sm:text-base sm:leading-8 dark:text-dark-text">
                  <div className="space-y-4 border-b border-gray-100 pb-6 text-ink dark:border-dark-border dark:text-dark-text">
                    {intro}
                  </div>

                  {sections.map((s, i) => (
                    <section
                      key={s.id}
                      id={s.id}
                      aria-labelledby={`${s.id}-title`}
                      className="scroll-mt-24 border-b border-gray-100 py-6 last:border-b-0 last:pb-0 dark:border-dark-border"
                    >
                      <h2
                        id={`${s.id}-title`}
                        className="group mb-3 flex items-baseline gap-3 text-lg font-semibold text-ink sm:text-xl dark:text-dark-text"
                      >
                        <span
                          aria-hidden="true"
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-full bg-primary-light text-sm tabular-nums text-ink-pink dark:bg-accent-pink/15"
                        >
                          {i + 1}
                        </span>
                        <span>{s.title}</span>
                        <a
                          href={`#${s.id}`}
                          onClick={(e) => scrollToSection(e, s.id)}
                          aria-label={`${s.title} 的链接`}
                          className="text-base font-normal text-text-light opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          #
                        </a>
                      </h2>
                      <div className="space-y-3">{s.body}</div>
                    </section>
                  ))}
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Link
                  href="/contact"
                  className="rounded-2xl border border-primary-light/40 bg-white/95 p-4 transition-colors hover:border-accent-pink/60 dark:border-dark-border dark:bg-dark-surface"
                >
                  <p className="font-medium text-ink dark:text-dark-text">还有疑问？</p>
                  <p className="mt-0.5 text-sm text-text-light">通过联系页与我们取得联系 →</p>
                </Link>
                <Link
                  href={related.href}
                  className="rounded-2xl border border-primary-light/40 bg-white/95 p-4 transition-colors hover:border-accent-pink/60 dark:border-dark-border dark:bg-dark-surface"
                >
                  <p className="font-medium text-ink dark:text-dark-text">{related.label}</p>
                  <p className="mt-0.5 text-sm text-text-light">继续阅读 →</p>
                </Link>
              </div>
            </div>
          </div>
        </article>

        {showBackToTop && (
          <button
            type="button"
            onClick={() =>
              window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
            }
            aria-label="回到顶部"
            className="fixed right-4 bottom-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-primary-light/60 bg-white/90 text-ink shadow-md backdrop-blur sm:right-6 sm:bottom-6 dark:border-dark-border dark:bg-dark-surface/90 dark:text-dark-text"
            style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
          >
            ↑
          </button>
        )}
      </Layout>
    </>
  );
}
