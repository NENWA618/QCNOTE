// Static markup for the maze stage: canvas, loading state and intro/win overlays.
// The page's effect drives these elements by id.
const DiejieStage = ({ ready }: { ready: boolean }) => (
  <div className="stage" id="stage">
    <canvas id="maze"></canvas>
    <div className="bump-toast" id="bumpToast">
      撞上了树木 · 坍焦失败
    </div>

    {!ready && (
      <div className="page-loading">
        <div className="spinner"></div>
        <div className="loading-title">QCNOTE · 初始化迷宫</div>
        <div className="loading-subtitle">正在准备光域迷宫，避免一次性加载过多内容导致卡顿。</div>
      </div>
    )}

    <div id="introOverlay" className="overlay show">
      <div className="mark">光域迷宫</div>
      <div id="introText">
        <p className="story-line">按下开始后，先用光源观察迷宫，7秒后即可移动。</p>
      </div>
      <button id="startBtn">开始</button>
      <div className="submit-status" id="countdownText" style={{ display: 'none' }}>
        光源倒计时：7s
      </div>
    </div>

    <div id="winOverlay" className="overlay">
      <div className="mark" id="winMark">
        已找到出口
      </div>
      <div id="statsBox" style={{ display: 'none' }}>
        <h2>迷宫已完成</h2>
        <div className="stats-final">
          <div>
            <div className="n" id="finalSteps">
              0
            </div>
            <div className="l">步数</div>
          </div>
          <div>
            <div className="n" id="finalBumps">
              0
            </div>
            <div className="l">撞墙次数</div>
          </div>
          <div>
            <div className="n" id="finalTime">
              00:00
            </div>
            <div className="l">用时</div>
          </div>
        </div>
        <button id="playAgainBtn" className="ghost">
          再走一次
        </button>
        <button
          id="loginSubmitBtn"
          className="ghost"
          style={{ display: 'none', marginTop: '12px' }}
        >
          登录后提交
        </button>
        <div id="submitStatus" className="submit-status">
          排行榜结果将自动提交
        </div>
      </div>
    </div>
  </div>
);

export default DiejieStage;
