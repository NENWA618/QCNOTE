import React from 'react';

export type AppLoaderState = 'loading' | 'slow' | 'error';

interface AppLoaderProps {
  state: AppLoaderState;
  /** state 为 error 时显示的原因 */
  error?: string | null;
}

/**
 * 打开笔记页时、本地存储就绪前显示的全屏加载界面。
 * - 首次绘制时 <html> 还没有 dark 类：配色先跟随系统深浅色（见 globals.css 的 .app-loader）
 * - 很快就绪时不闪：整体延迟淡入
 * - 迟迟不就绪或出错时给出原因和“重新加载”，而不是永远转圈
 */
const AppLoader: React.FC<AppLoaderProps> = ({ state, error }) => {
  const stuck = state !== 'loading';

  return (
    <div className="app-loader" role={state === 'error' ? 'alert' : 'status'} aria-busy={!stuck}>
      <div className="app-loader-inner">
        <div className={`app-loader-mark ${stuck ? '' : 'is-pulsing'}`} aria-hidden="true">
          {/* 用原生 img：此时页面其余部分（含 next/image 的运行时）可能还没就绪 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/icons/note_icon_192.png" alt="" width={72} height={72} />
        </div>

        <p className="app-loader-title">QCNOTE</p>

        {state === 'loading' && (
          <>
            <p className="app-loader-text">正在打开你的笔记…</p>
            <div className="app-loader-bar" aria-hidden="true">
              <span />
            </div>
          </>
        )}

        {state === 'slow' && (
          <>
            <p className="app-loader-text">加载时间比平时长一些…</p>
            <p className="app-loader-hint">
              可能是浏览器存储正忙，或在其他标签页里也打开了 QCNOTE。可以关掉其他 QCNOTE
              标签页后重新加载。
            </p>
            <div className="app-loader-bar" aria-hidden="true">
              <span />
            </div>
            <button
              type="button"
              className="btn btn-secondary mt-6"
              onClick={() => location.reload()}
            >
              重新加载
            </button>
          </>
        )}

        {state === 'error' && (
          <>
            <p className="app-loader-text">笔记空间没能打开</p>
            <p className="app-loader-hint">
              {error || '加载存储模块失败，可能是网络中断或刚刚发布了新版本。'}
              <br />
              你的笔记仍保存在本机，重新加载即可。
            </p>
            <button
              type="button"
              className="btn btn-primary mt-6"
              onClick={() => location.reload()}
            >
              重新加载
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AppLoader;
