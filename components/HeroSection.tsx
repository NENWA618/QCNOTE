import Image from 'next/image';
import Link from 'next/link';
import React, { useRef } from 'react';

const HIGHLIGHTS = ['Markdown + KaTeX', '双向链接', '知识图谱', '本地加密'];

/**
 * 首页全屏沉浸式 Hero。
 * 背景光斑、漂浮卡片均为装饰（aria-hidden）；视差只改 CSS 变量，不触发 React 重渲染。
 */
const HeroSection: React.FC = () => {
  const ref = useRef<HTMLElement>(null);

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el || e.pointerType === 'touch') return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', String((e.clientX - rect.left) / rect.width - 0.5));
    el.style.setProperty('--my', String((e.clientY - rect.top) / rect.height - 0.5));
  };

  const handlePointerLeave = () => {
    ref.current?.style.setProperty('--mx', '0');
    ref.current?.style.setProperty('--my', '0');
  };

  return (
    <section
      ref={ref}
      className="immersive-hero"
      aria-labelledby="hero-title"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {/* 背景：流动光斑 + 点阵 */}
      <div className="hero-bg" aria-hidden="true">
        <span className="hero-orb hero-orb-pink" />
        <span className="hero-orb hero-orb-purple" />
        <span className="hero-orb hero-orb-rose" />
        <span className="hero-grid" />
      </div>

      {/* 漂浮的笔记卡片（仅大屏） */}
      <div className="hero-floaters" aria-hidden="true">
        <div className="hero-float hero-float-a" style={{ ['--depth' as string]: 28 }}>
          <div className="hero-glass-card w-60 -rotate-6">
            <p className="text-xs font-semibold text-ink-pink mb-2"># 今日思考</p>
            <p className="text-sm text-ink leading-relaxed">
              记录是思考的开始，
              <br />
              链接到 <span className="text-ink-pink font-medium">[[知识图谱]]</span>
            </p>
            <p className="mt-3 font-serif italic text-ink-purple">E = mc²</p>
          </div>
        </div>

        <div className="hero-float hero-float-b" style={{ ['--depth' as string]: 44 }}>
          <div className="hero-glass-card w-52 rotate-6">
            <svg viewBox="0 0 160 100" className="w-full h-auto" role="presentation">
              <g stroke="currentColor" strokeWidth="1.5" className="text-ink-purple" opacity="0.55">
                <line x1="80" y1="50" x2="28" y2="26" />
                <line x1="80" y1="50" x2="134" y2="30" />
                <line x1="80" y1="50" x2="40" y2="82" />
                <line x1="80" y1="50" x2="128" y2="78" />
                <line x1="28" y1="26" x2="40" y2="82" />
              </g>
              <circle cx="80" cy="50" r="10" fill="var(--color-accent-pink)" />
              <circle cx="28" cy="26" r="6" fill="var(--color-accent-purple)" />
              <circle cx="134" cy="30" r="7" fill="var(--color-accent-purple)" />
              <circle cx="40" cy="82" r="5" fill="var(--color-accent-pink)" />
              <circle cx="128" cy="78" r="6" fill="var(--color-accent-purple)" />
            </svg>
            <p className="mt-1 text-xs text-text-light text-center">知识图谱</p>
          </div>
        </div>

        <div className="hero-float hero-float-c" style={{ ['--depth' as string]: 20 }}>
          <div className="hero-glass-card w-48 rotate-3 flex items-center gap-3">
            <span className="text-2xl">🔐</span>
            <div>
              <p className="text-sm font-semibold text-ink">AES-GCM</p>
              <p className="text-xs text-text-light">本地加密存储</p>
            </div>
          </div>
        </div>

        <div className="hero-float hero-float-d" style={{ ['--depth' as string]: 36 }}>
          <div className="hero-glass-card -rotate-3 flex items-center gap-2 px-4 py-2">
            <span className="text-sm text-text-light">🔍 搜索笔记</span>
            <kbd className="rounded-md bg-primary-light dark:bg-dark-surface-light px-1.5 py-0.5 text-xs font-mono text-ink">
              Ctrl K
            </kbd>
          </div>
        </div>
      </div>

      {/* 主内容 */}
      <div className="hero-content">
        <div className="hero-reveal" style={{ ['--i' as string]: 0 }}>
          <span className="hero-badge">
            <Image
              src="/images/icons/note_icon_64.png"
              alt=""
              width={20}
              height={20}
              className="rounded-md"
              priority
            />
            QCNOTE · 本地优先的个人笔记
          </span>
        </div>

        <h1 id="hero-title" className="hero-title hero-reveal" style={{ ['--i' as string]: 1 }}>
          用心记录，
          <br className="sm:hidden" />
          <span className="hero-title-accent">思考每一刻</span>
        </h1>

        <p className="hero-lead hero-reveal" style={{ ['--i' as string]: 2 }}>
          隐私优先、离线可用的 Markdown 笔记。双链串起想法，图谱看清脉络， 所有内容只属于你。
        </p>

        <ul className="hero-chips hero-reveal" style={{ ['--i' as string]: 3 }}>
          {HIGHLIGHTS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <div className="hero-actions hero-reveal" style={{ ['--i' as string]: 4 }}>
          <Link href="/dashboard" prefetch={false} className="btn btn-primary hero-btn">
            开始记录
            <span aria-hidden="true">→</span>
          </Link>
          <Link href="/contact" className="btn hero-btn hero-btn-ghost">
            💝 支持我们
          </Link>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
