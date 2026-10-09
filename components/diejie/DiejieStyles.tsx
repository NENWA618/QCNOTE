// Page-level styles for the 叠界 · 光域迷宫 page (global so the canvas HUD/overlays pick them up).
const DiejieStyles = () => (
  <style jsx global>{`
    :root {
      --void: #0a0a0d;
      --panel: #15141b;
      --panel-line: #2a2833;
      --ink: #ede9e2;
      --ink-dim: #8e8a92;
      --floor: #d9d4c9;
      --floor-shadow: #b9b3a5;
      --wall: #241a34;
      --wall-edge: #4b3866;
      --path-glow: #49dfae;
      --path-glow-soft: #a6f3d9;
      --player: #ff8b5e;
      --player-glow: #ffc08a;
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
      background: var(--void);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
      height: 100%;
      overflow: hidden;
    }
    .stage {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      max-width: none;
      margin: 0;
      border-radius: 0;
      background: transparent;
      border: none;
      padding: 0;
      box-shadow: none;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
      border-radius: 0;
      background: var(--floor);
      cursor: none;
      touch-action: none;
    }
    .overlay {
      position: absolute;
      inset: 14px;
      background: rgba(10, 9, 13, 0.94);
      border-radius: 3px;
      display: none;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      text-align: center;
      padding: 20px;
    }
    .overlay.show {
      display: flex;
    }
    .overlay .mark {
      font-family: 'Songti SC', 'STSong', serif;
      font-size: 13px;
      letter-spacing: 0.3em;
      color: var(--exit);
      margin-bottom: 16px;
      text-transform: uppercase;
    }
    #winOverlay h2 {
      font-family: 'Songti SC', 'STSong', serif;
      font-size: 22px;
      margin: 0 0 14px;
      color: var(--ink);
      font-weight: 600;
    }
    #winOverlay .stats-final {
      display: flex;
      gap: 26px;
      margin-bottom: 22px;
    }
    #winOverlay .stats-final div {
      text-align: center;
    }
    #winOverlay .stats-final .n {
      font-size: 22px;
      font-weight: 600;
      color: var(--path-glow-soft);
      font-variant-numeric: tabular-nums;
    }
    #winOverlay .stats-final .l {
      font-size: 11px;
      color: var(--ink-dim);
      margin-top: 2px;
    }
    .overlay button {
      background: var(--path-glow);
      border: none;
      color: #0a1512;
      font-size: 13px;
      padding: 10px 22px;
      border-radius: 3px;
      cursor: pointer;
      font-weight: 600;
      letter-spacing: 0.02em;
      font-family: inherit;
    }
    .overlay button:hover {
      background: var(--path-glow-soft);
    }
    .overlay button.ghost {
      background: transparent;
      border: 1px solid var(--panel-line);
      color: var(--ink-dim);
    }
    .overlay button.ghost:hover {
      border-color: var(--path-glow);
      color: var(--path-glow-soft);
      background: transparent;
    }
    .submit-status {
      margin-top: 18px;
      color: var(--ink-dim);
      font-size: 12px;
      line-height: 1.6;
      max-width: 320px;
    }
    #introText {
      max-width: 380px;
      margin-bottom: 22px;
    }
    .story-line {
      font-family: 'Songti SC', 'STSong', 'Noto Serif SC', serif;
      font-size: 15px;
      line-height: 2;
      color: var(--ink-dim);
      margin: 0 0 4px;
    }
    #storyBox {
      max-width: 400px;
      min-height: 150px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .page-loading {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #18131f 0%, #3e2b55 45%, #d38aa5 100%);
      color: white;
      z-index: 10;
      padding: 24px;
      text-align: center;
    }
    .page-loading .spinner {
      width: 72px;
      height: 72px;
      border: 6px solid rgba(255, 255, 255, 0.18);
      border-top-color: rgba(255, 255, 255, 0.95);
      border-radius: 999px;
      animation: spin 0.9s linear infinite;
      margin: 0 auto 18px;
    }
    .page-loading .loading-title {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.06em;
      margin-bottom: 8px;
    }
    .page-loading .loading-subtitle {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.72);
      line-height: 1.7;
      max-width: 320px;
      margin: 0 auto;
    }
    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }
    .bump-toast {
      position: absolute;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(229, 72, 77, 0.14);
      border: 1px solid rgba(229, 72, 77, 0.4);
      color: #f2a3a5;
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 20px;
      opacity: 0;
      transition: opacity 0.25s ease;
      pointer-events: none;
      letter-spacing: 0.04em;
    }
    .bump-toast.show {
      opacity: 1;
    }
  `}</style>
);

export default DiejieStyles;
