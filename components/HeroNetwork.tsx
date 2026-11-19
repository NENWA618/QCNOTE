import React, { useSyncExternalStore } from 'react';
import { buildConstellation } from '../lib/constellation';

const W = 1200;
const H = 900;

const NET = buildConstellation({
  seed: 20250,
  width: W,
  height: H,
  count: 62,
  minDist: 88,
  linkDist: 175,
  maxLinks: 3,
  chains: 6,
  chainLen: 6,
});

const chainSet = new Set(NET.chains.flat());
const pathOf = (chain: number[]) =>
  chain.map((i, k) => `${k === 0 ? 'M' : 'L'}${NET.nodes[i].x} ${NET.nodes[i].y}`).join(' ');
const CHAIN_PATHS = NET.chains.map(pathOf);

// 少量节点上挂“笔记卡片”小图标，对应横幅里的卡片
const CARD_NODES = NET.nodes
  .map((n, i) => ({ n, i }))
  .filter(({ i }) => !chainSet.has(i))
  .filter((_, k) => k % 9 === 0)
  .slice(0, 6);

/**
 * 首页 Hero 背景：横幅里的节点网络。
 * - 暗淡的背景节点缓慢闪烁
 * - 被“墨水”（粉→紫→蓝渐变）点亮的链路带光晕，节点脉冲，光点沿链路流动
 * 纯装饰，aria-hidden。光点用 SMIL 动画，CSS 的“减少动态效果”管不到，所以这里自己判断。
 */
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const subscribeReducedMotion = (cb: () => void) => {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

const HeroNetwork: React.FC = () => {
  // 服务端按“有动画”渲染，水合后再同步用户偏好
  const still = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );

  return (
    <svg
      className="hero-net"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      focusable="false"
    >
      <defs>
        <linearGradient id="hn-ink" gradientUnits="userSpaceOnUse" x1="120" y1="0" x2="1080" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--ink-1)' }} />
          <stop offset=".5" style={{ stopColor: 'var(--ink-2)' }} />
          <stop offset="1" style={{ stopColor: 'var(--ink-3)' }} />
        </linearGradient>
        <filter id="hn-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <filter id="hn-soft" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* 普通链路与节点 */}
      <g className="net-links">
        {NET.links.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={NET.nodes[a].x}
            y1={NET.nodes[a].y}
            x2={NET.nodes[b].x}
            y2={NET.nodes[b].y}
          />
        ))}
      </g>
      <g className="net-dots">
        {NET.nodes.map((n, i) =>
          chainSet.has(i) ? null : (
            <circle
              key={i}
              className="net-dot"
              cx={n.x}
              cy={n.y}
              r={n.r}
              style={{ ['--delay' as string]: `${n.delay}s`, ['--dur' as string]: `${n.dur}s` }}
            />
          ),
        )}
      </g>

      {/* 笔记卡片小图标 */}
      {CARD_NODES.map(({ n, i }) => (
        <g key={i} transform={`translate(${n.x - 9} ${n.y - 11})`} className="hero-card-icon">
          <rect width="18" height="22" rx="3" />
          <line x1="4" y1="6" x2="14" y2="6" className="hci-pink" />
          <line x1="4" y1="11" x2="14" y2="11" />
          <line x1="4" y1="15.5" x2="10" y2="15.5" />
        </g>
      ))}

      {/* 墨水链路：光晕 + 实线 */}
      <g
        fill="none"
        stroke="url(#hn-ink)"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="hero-ink"
      >
        {CHAIN_PATHS.map((d, i) => (
          <path key={`g${i}`} d={d} strokeWidth="9" filter="url(#hn-glow)" opacity=".85" />
        ))}
        {CHAIN_PATHS.map((d, i) => (
          <path key={`l${i}`} d={d} strokeWidth="2.6" />
        ))}
      </g>

      {/* 被点亮的节点：光晕脉冲 + 白色内核 */}
      <g>
        {NET.nodes.map((n, i) =>
          chainSet.has(i) ? (
            <g key={i}>
              <circle
                className="hero-pulse"
                cx={n.x}
                cy={n.y}
                r="7"
                fill="url(#hn-ink)"
                filter="url(#hn-soft)"
                style={{ ['--delay' as string]: `${n.delay}s` }}
              />
              <circle cx={n.x} cy={n.y} r="3.4" className="hero-core" />
            </g>
          ) : null,
        )}
      </g>

      {/* 沿链路流动的光点 */}
      {!still &&
        CHAIN_PATHS.map((d, i) => {
          const dur = 4 + i * 0.9;
          const begin = `${i * 0.5}s`;
          return (
            <circle key={`p${i}`} r="3.2" className="hero-core">
              <animateMotion dur={`${dur}s`} begin={begin} repeatCount="indefinite" path={d} />
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                dur={`${dur}s`}
                begin={begin}
                repeatCount="indefinite"
              />
            </circle>
          );
        })}
    </svg>
  );
};

export default HeroNetwork;
