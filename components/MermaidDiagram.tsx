import React, { useEffect, useState } from 'react';

/**
 * 笔记里的 ```mermaid 代码块渲染成图。
 *
 * 安全：笔记可能来自同步、导入、网页剪藏或别人的公开主页，不能信任。
 * - securityLevel: 'strict'：Mermaid 自己会转义标签里的 HTML、禁用点击回调；
 * - 结果 SVG 不进 DOM，而是放进 <img src="data:image/svg+xml">：<img> 里的 SVG
 *   不执行脚本、不加载外部资源，即使 Mermaid 的清理被绕过也伤不到页面；
 * - 不用 htmlLabels（foreignObject），文字走原生 SVG <text>，<img> 里显示才一致；
 * - 限制源码长度，渲染失败时退回显示源码。
 */

const MAX_SOURCE_LENGTH = 20_000;
/** 输入停顿多久后才渲染：分屏预览里每敲一个字都重画一次图太重 */
const RENDER_DEBOUNCE_MS = 300;
const CACHE_LIMIT = 30;

type MermaidApi = typeof import('mermaid').default;

let mermaidPromise: Promise<MermaidApi> | null = null;
let renderQueue: Promise<unknown> = Promise.resolve();
let renderCounter = 0;
let initializedTheme: 'dark' | 'default' | null = null;
const cache = new Map<string, string>();

function loadMermaid(): Promise<MermaidApi> {
  // 动态导入：Mermaid 很大，只有笔记里真有图时才下载
  mermaidPromise ??= import('mermaid').then((m) => m.default);
  return mermaidPromise;
}

function currentTheme(): 'dark' | 'default' {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    ? 'dark'
    : 'default';
}

function configure(mermaid: MermaidApi, theme: 'dark' | 'default') {
  if (initializedTheme === theme) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme,
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    maxTextSize: MAX_SOURCE_LENGTH,
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  });
  initializedTheme = theme;
}

/** Mermaid 的 render 不能并发（共用全局状态），按顺序排队 */
function renderSvg(source: string, theme: 'dark' | 'default'): Promise<string> {
  const key = `${theme}\n${source}`;
  const hit = cache.get(key);
  if (hit !== undefined) return Promise.resolve(hit);

  const task = renderQueue.then(async () => {
    const mermaid = await loadMermaid();
    configure(mermaid, theme);
    const id = `qc-mermaid-${++renderCounter}`;
    try {
      const { svg } = await mermaid.render(id, source);
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
      cache.set(key, svg);
      return svg;
    } finally {
      // 渲染出错时 Mermaid 会在 body 里留下临时节点
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    }
  });
  renderQueue = task.catch(() => undefined);
  return task;
}

/** 仅供测试：清掉模块级的初始化状态与渲染缓存 */
export function resetMermaidStateForTests() {
  initializedTheme = null;
  cache.clear();
  renderCounter = 0;
}

function toDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** 监听 <html class="dark"> 的切换，让图跟着换配色 */
function useIsDarkTheme(): 'dark' | 'default' {
  const [theme, setTheme] = useState<'dark' | 'default'>(currentTheme);
  useEffect(() => {
    const update = () => setTheme(currentTheme());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

interface MermaidDiagramProps {
  source: string;
}

type State =
  { status: 'loading' } | { status: 'ready'; uri: string } | { status: 'error'; message: string };

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ source }) => {
  const theme = useIsDarkTheme();
  const code = source.trim();
  const tooLong = code.length > MAX_SOURCE_LENGTH;
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    if (!code || tooLong) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      renderSvg(code, theme).then(
        (svg) => {
          if (!cancelled) setState({ status: 'ready', uri: toDataUri(svg) });
        },
        (err: unknown) => {
          if (!cancelled) {
            setState({
              status: 'error',
              message: err instanceof Error ? err.message.split('\n')[0] : '图表语法有误',
            });
          }
        },
      );
    }, RENDER_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, theme, tooLong]);

  if (!code) return null;

  if (tooLong || state.status === 'error') {
    const message = tooLong
      ? 'Mermaid 图表源码过长，未渲染'
      : `Mermaid 图表无法渲染：${state.status === 'error' ? state.message : ''}`;
    return (
      <div className="mb-4">
        <p role="alert" className="mb-1 text-sm text-red-600 dark:text-red-400">
          {message}
        </p>
        <pre className="bg-gray-100 dark:bg-dark-surface-light p-4 rounded overflow-x-auto text-sm text-gray-800 dark:text-dark-text">
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  if (state.status === 'loading') {
    return (
      <div className="mb-4 text-sm text-gray-500 dark:text-dark-text-secondary" aria-busy="true">
        正在渲染图表…
      </div>
    );
  }

  return (
    <div className="mb-4 overflow-x-auto">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={state.uri}
        alt="Mermaid 图表"
        className="mx-auto max-w-full h-auto"
        referrerPolicy="no-referrer"
      />
    </div>
  );
};

export default React.memo(MermaidDiagram);
