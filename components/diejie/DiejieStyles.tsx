// Page-level styles for the 叠界 · 光域迷宫 screen (global so the full-bleed stage,
// the canvas HUD and the overlays pick them up). Classes are prefixed `dj-`.
const DiejieStyles = () => (
  <style jsx global>{`
    :root {
      --void: #0a0a0d;
      --panel: #15141b;
      --panel-line: #2a2833;
      --ink: #ede9e2;
      --ink-dim: #8e8a92;
      --path-glow: #49dfae;
      --path-glow-soft: #a6f3d9;
      --player: #ff8b5e;
      --exit: #f2c94c;
      --danger: #e5484d;
    }
    * {
      box-sizing: border-box;
    }
    html,
    body {
      margin: 0;
      padding: 0;
      height: 100%;
      overflow: hidden;
      background: var(--void);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
      overscroll-behavior: none;
    }

    .dj-stage {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      user-select: none;
      -webkit-user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    .dj-canvas {
      display: block;
      cursor: none;
      touch-action: none;
      background: #d9d4c9;
    }

    /* ---- HUD ---- */
    .dj-hud {
      position: absolute;
      top: calc(10px + env(safe-area-inset-top, 0px));
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 6px 16px 8px;
      border-radius: 14px;
      background: rgba(10, 10, 13, 0.62);
      border: 1px solid rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      pointer-events: none;
    }
    .dj-hud-time {
      font-size: 26px;
      line-height: 1.1;
      font-weight: 600;
      letter-spacing: 0.02em;
      font-variant-numeric: tabular-nums;
      color: var(--path-glow-soft);
    }
    .dj-hud-preview {
      font-size: 14px;
      color: var(--ink-dim);
      letter-spacing: 0.08em;
    }
    .dj-hud-preview b {
      font-size: 22px;
      color: var(--exit);
      font-variant-numeric: tabular-nums;
    }
    .dj-hud-chips {
      display: flex;
      gap: 6px;
    }
    .dj-chip {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 999px;
      color: var(--path-glow-soft);
      border: 1px solid rgba(73, 223, 174, 0.35);
    }
    .dj-chip-bad {
      color: #f2a3a5;
      border-color: rgba(229, 72, 77, 0.5);
      background: rgba(229, 72, 77, 0.14);
    }
    .dj-chip-dim {
      color: var(--ink-dim);
      border-color: var(--panel-line);
    }

    /* ---- panels ---- */
    .dj-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(10, 9, 13, 0.9);
      animation: dj-fade 0.35s ease both;
    }
    .dj-card {
      width: 100%;
      max-width: 400px;
      max-height: 100%;
      overflow-y: auto;
      text-align: center;
      animation: dj-rise 0.4s ease both;
    }
    .dj-mark {
      font-family: 'Songti SC', 'STSong', 'Noto Serif SC', serif;
      font-size: 13px;
      letter-spacing: 0.3em;
      color: var(--exit);
      margin-bottom: 16px;
    }
    .dj-tabs {
      display: inline-flex;
      padding: 3px;
      border-radius: 999px;
      border: 1px solid var(--panel-line);
      background: var(--panel);
    }
    .dj-tabs button {
      border: 0;
      background: transparent;
      color: var(--ink-dim);
      font: inherit;
      font-size: 13px;
      padding: 7px 18px;
      border-radius: 999px;
      cursor: pointer;
    }
    .dj-tabs button[aria-selected='true'] {
      background: rgba(73, 223, 174, 0.16);
      color: var(--path-glow-soft);
    }
    .dj-tabs button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .dj-sub {
      margin: 12px 0 20px;
      font-size: 12px;
      color: var(--ink-dim);
      min-height: 1.5em;
    }
    .dj-rules {
      list-style: none;
      margin: 0 0 24px;
      padding: 0;
      display: grid;
      gap: 10px;
      text-align: left;
      counter-reset: rule;
    }
    .dj-rules li {
      counter-increment: rule;
      display: grid;
      grid-template-columns: 26px 1fr;
      column-gap: 10px;
      padding: 10px 12px;
      border-radius: 10px;
      background: var(--panel);
      border: 1px solid var(--panel-line);
    }
    .dj-rules li::before {
      content: counter(rule);
      grid-row: span 2;
      align-self: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-size: 12px;
      font-weight: 600;
      color: #0a1512;
      background: var(--path-glow);
    }
    .dj-rules b {
      font-size: 14px;
      font-weight: 600;
    }
    .dj-rules span {
      font-size: 12px;
      line-height: 1.6;
      color: var(--ink-dim);
    }
    .dj-note {
      margin: 16px 0 0;
      font-size: 12px;
      line-height: 1.7;
      color: var(--ink-dim);
    }

    .dj-primary,
    .dj-ghost {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0 26px;
      border-radius: 10px;
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
    }
    .dj-primary {
      border: 0;
      background: var(--path-glow);
      color: #0a1512;
    }
    .dj-primary:hover:not(:disabled) {
      background: var(--path-glow-soft);
    }
    .dj-primary:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .dj-ghost {
      background: transparent;
      color: var(--ink-dim);
      border: 1px solid var(--panel-line);
    }
    .dj-ghost:hover {
      color: var(--path-glow-soft);
      border-color: var(--path-glow);
    }
    .dj-link {
      border: 0;
      background: none;
      padding: 0 0 0 6px;
      font: inherit;
      color: var(--path-glow);
      cursor: pointer;
      text-decoration: underline;
    }
    .dj-primary:focus-visible,
    .dj-ghost:focus-visible,
    .dj-link:focus-visible,
    .dj-tabs button:focus-visible,
    .dj-pad button:focus-visible {
      outline: 2px solid var(--path-glow-soft);
      outline-offset: 2px;
    }

    /* ---- result ---- */
    .dj-score {
      font-size: 46px;
      line-height: 1.1;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--path-glow-soft);
    }
    .dj-score-l {
      margin: 4px 0 20px;
      font-size: 12px;
      color: var(--ink-dim);
    }
    .dj-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 18px;
    }
    .dj-cell {
      padding: 10px 4px;
      border-radius: 10px;
      background: var(--panel);
      border: 1px solid var(--panel-line);
    }
    .dj-cell-n {
      font-size: 16px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .dj-cell-l {
      margin-top: 2px;
      font-size: 11px;
      color: var(--ink-dim);
    }
    .dj-cell-h {
      margin-top: 2px;
      font-size: 10px;
      color: #f2a3a5;
    }
    .dj-rank {
      margin: 0 0 4px;
      font-size: 15px;
    }
    .dj-rank b {
      font-size: 24px;
      color: var(--exit);
    }
    .dj-rank span {
      color: var(--ink-dim);
      font-size: 12px;
    }
    .dj-status {
      margin: 0 0 18px;
      font-size: 12px;
      line-height: 1.7;
      color: var(--ink-dim);
    }
    .dj-bad {
      color: #f2a3a5;
    }
    .dj-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: center;
    }

    /* ---- touch pad: only where there is no mouse ---- */
    .dj-pad {
      display: none;
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      padding: 12px 22px calc(14px + env(safe-area-inset-bottom, 0px));
      justify-content: space-between;
      align-items: flex-end;
      pointer-events: none;
    }
    @media (pointer: coarse) {
      .dj-pad {
        display: flex;
      }
    }
    .dj-pad button {
      pointer-events: auto;
      touch-action: none;
      border: 1px solid var(--panel-line);
      background: rgba(21, 20, 27, 0.78);
      color: var(--ink);
      font: inherit;
    }
    .dj-pad button:active:not(:disabled) {
      background: rgba(73, 223, 174, 0.28);
      border-color: var(--path-glow);
    }
    .dj-dpad {
      display: grid;
      grid-template-columns: repeat(3, 58px);
      grid-template-rows: repeat(3, 58px);
      grid-template-areas:
        '. up .'
        'left . right'
        '. down .';
      gap: 4px;
    }
    .dj-dpad button {
      border-radius: 14px;
      font-size: 18px;
    }
    .dj-lantern {
      width: 84px;
      height: 84px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      align-content: center;
      font-size: 14px;
      font-weight: 600;
      color: var(--exit);
    }
    .dj-lantern span {
      font-size: 12px;
      color: var(--ink-dim);
    }
    .dj-lantern:disabled {
      opacity: 0.4;
    }

    /* ---- loading ---- */
    .dj-loading {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #18131f 0%, #3e2b55 55%, #5b3a6b 100%);
      color: #fff;
      font-size: 16px;
      letter-spacing: 0.06em;
      z-index: 10;
    }
    .dj-spinner {
      width: 56px;
      height: 56px;
      border: 5px solid rgba(255, 255, 255, 0.18);
      border-top-color: rgba(255, 255, 255, 0.95);
      border-radius: 999px;
      animation: dj-spin 0.9s linear infinite;
    }

    @keyframes dj-spin {
      to {
        transform: rotate(360deg);
      }
    }
    @keyframes dj-fade {
      from {
        opacity: 0;
      }
    }
    @keyframes dj-rise {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .dj-overlay,
      .dj-card {
        animation: none;
      }
      .dj-spinner {
        animation-duration: 3s;
      }
    }
  `}</style>
);

export default DiejieStyles;
