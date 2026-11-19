import Link from 'next/link';
import React from 'react';

const FEATURES = [
  {
    icon: '✍️',
    title: 'Markdown 与公式',
    text: '用 Markdown 书写，KaTeX 渲染数学公式；选中文字就能上色标注重点。',
  },
  {
    icon: '🔗',
    title: '双向链接',
    text: '写下 [[笔记标题]] 即可互相引用，被引用的笔记会自动出现反向链接。',
  },
  {
    icon: '🧠',
    title: '图谱、日历、时间线',
    text: '知识图谱看清想法之间的脉络，日历热力图和时间线回顾每天写了什么。',
  },
  {
    icon: '🔐',
    title: '本地优先，可加密',
    text: '笔记默认保存在浏览器本地，离线也能写；支持 AES-GCM 加密敏感内容。',
  },
  {
    icon: '🔍',
    title: '语义搜索',
    text: '除了关键词，还能按意思找笔记。语义模型在浏览器里运行，内容不出设备。',
  },
  {
    icon: '☁️',
    title: '可选的云同步',
    text: '需要多设备时，可接入 WebDAV 或 OneDrive，并可先在本地加密再上传。',
  },
];

const EXTRAS = ['版本历史', '标签管理', '回收站', '发布到个人主页', 'AI 生成笔记', '深色模式'];

const PRIVACY_POINTS = [
  {
    title: '默认不上传',
    text: '未发布的笔记只存在你的设备上，QCNOTE 不会把明文笔记发送到服务器。',
  },
  {
    title: '公开是你的选择',
    text: '只有你主动“发布到主页”的笔记才会公开，随时可以取消发布并删除副本。',
  },
  {
    title: '没有广告和追踪',
    text: '默认不启用第三方分析、广告或追踪功能。',
  },
];

/** 首页 Hero 之下的介绍区块：功能、隐私、行动引导 */
const HomeSections: React.FC = () => (
  <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
    {/* 功能 */}
    <section id="features" aria-labelledby="features-title" className="scroll-mt-24 pt-12 sm:pt-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium text-ink-pink">功能</p>
        <h2
          id="features-title"
          className="mt-2 text-2xl font-bold text-ink sm:text-4xl dark:text-dark-text"
        >
          写下来，连起来，找得到
        </h2>
        <p className="mt-3 text-text-light sm:text-lg">从一条随手记，到一张属于自己的知识网络。</p>
      </div>

      <ul className="mt-8 grid gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <li
            key={f.title}
            className="rounded-2xl border border-white/60 bg-white/80 p-5 backdrop-blur-sm transition-transform hover:-translate-y-0.5 sm:p-6 dark:border-dark-border dark:bg-dark-surface/80"
          >
            <span
              aria-hidden="true"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-accent-pink/25 to-accent-purple/25 text-2xl"
            >
              {f.icon}
            </span>
            <h3 className="mt-4 text-lg font-semibold text-ink dark:text-dark-text">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-text-light">{f.text}</p>
          </li>
        ))}
      </ul>

      <ul
        aria-label="更多功能"
        className="mt-6 flex flex-wrap justify-center gap-2 text-sm text-text-light"
      >
        {EXTRAS.map((e) => (
          <li
            key={e}
            className="rounded-full border border-white/60 bg-white/60 px-3 py-1 dark:border-dark-border dark:bg-dark-surface/60"
          >
            {e}
          </li>
        ))}
      </ul>
    </section>

    {/* 隐私 */}
    <section
      aria-labelledby="privacy-title"
      className="mt-16 overflow-hidden rounded-3xl border border-white/60 bg-white/80 backdrop-blur-sm sm:mt-24 dark:border-dark-border dark:bg-dark-surface/80"
    >
      <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
        <div>
          <p className="text-sm font-medium text-ink-pink">隐私优先</p>
          <h2
            id="privacy-title"
            className="mt-2 text-2xl font-bold text-ink sm:text-3xl dark:text-dark-text"
          >
            你的笔记，只属于你
          </h2>
          <p className="mt-3 leading-relaxed text-text-light">
            QCNOTE
            以“本地优先、隐私优先”为核心设计理念：数据尽量留在你的设备上，只在你主动授权时才与外部服务交互。
          </p>
          <Link
            href="/privacy"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-ink-pink hover:underline"
          >
            阅读隐私政策 <span aria-hidden="true">→</span>
          </Link>
        </div>
        <ul className="grid gap-3">
          {PRIVACY_POINTS.map((p, i) => (
            <li
              key={p.title}
              className="flex gap-4 rounded-2xl bg-primary-light/50 p-4 dark:bg-dark-surface-light"
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-ink-pink shadow-sm dark:bg-dark-surface"
              >
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold text-ink dark:text-dark-text">{p.title}</h3>
                <p className="mt-0.5 text-sm leading-relaxed text-text-light">{p.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  </div>
);

export default HomeSections;
