import React from 'react';
import { buildConstellation } from '../lib/constellation';

const W = 1280;
const H = 800;

// 模块级常量：只算一次
const NET = buildConstellation({
  seed: 618,
  width: W,
  height: H,
  count: 54,
  minDist: 96,
  linkDist: 190,
  maxLinks: 2,
});

/**
 * 全站底图（README 横幅的效果）：横线笔记纸 + 粉色页边线 + 闪烁的笔记节点网络。
 * 固定在视口里、不拦截点击，对读屏器隐藏；颜色全部来自 globals.css 里的 --paper-* / --net-* 变量。
 */
const PageBackground: React.FC = () => (
  <div className="page-bg" aria-hidden="true">
    <svg
      className="page-bg-net"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      focusable="false"
    >
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
        {NET.nodes.map((n, i) => (
          <circle
            key={i}
            className="net-dot"
            cx={n.x}
            cy={n.y}
            r={n.r}
            style={{ ['--delay' as string]: `${n.delay}s`, ['--dur' as string]: `${n.dur}s` }}
          />
        ))}
      </g>
    </svg>
  </div>
);

export default PageBackground;
