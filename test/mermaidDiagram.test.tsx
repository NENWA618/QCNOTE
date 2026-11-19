import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock('mermaid', () => ({ default: mermaidMock }));

import { NormalMarkdown } from '../components/ColoredMarkdown';
import { resetMermaidStateForTests } from '../components/MermaidDiagram';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><text>hello</text></svg>';

const fence = (lang: string, body: string) => '```' + lang + '\n' + body + '\n```';

describe('Mermaid 图表', () => {
  beforeEach(() => {
    mermaidMock.initialize.mockReset();
    mermaidMock.render.mockReset();
    mermaidMock.render.mockResolvedValue({ svg: SVG });
    document.documentElement.classList.remove('dark');
    resetMermaidStateForTests();
  });
  afterEach(cleanup);

  it('把 ```mermaid 代码块渲染成 <img>，而不是代码块', async () => {
    const { container } = render(<NormalMarkdown content={fence('mermaid', 'graph TD; A-->B')} />);
    const img = await screen.findByRole('img', { name: 'Mermaid 图表' });
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(container.querySelector('pre')).toBeNull();
    expect(mermaidMock.render).toHaveBeenCalledTimes(1);
    expect(mermaidMock.render.mock.calls[0][1]).toBe('graph TD; A-->B');
  });

  it('SVG 只放在 <img> 的 data URI 里，不会进入页面 DOM', async () => {
    const { container } = render(<NormalMarkdown content={fence('mermaid', 'graph TD; X-->Y')} />);
    await screen.findByRole('img', { name: 'Mermaid 图表' });
    expect(container.querySelector('svg')).toBeNull();
    expect(container.innerHTML).not.toContain('<text>');
  });

  it('以 strict 安全级别初始化，并关闭 htmlLabels', async () => {
    render(<NormalMarkdown content={fence('mermaid', 'graph TD; S-->T')} />);
    await screen.findByRole('img', { name: 'Mermaid 图表' });
    const config = mermaidMock.initialize.mock.calls[0][0];
    expect(config.securityLevel).toBe('strict');
    expect(config.htmlLabels).toBe(false);
    expect(config.startOnLoad).toBe(false);
  });

  it('深色模式下使用 dark 主题', async () => {
    document.documentElement.classList.add('dark');
    render(<NormalMarkdown content={fence('mermaid', 'graph TD; D-->K')} />);
    await screen.findByRole('img', { name: 'Mermaid 图表' });
    expect(mermaidMock.initialize.mock.calls[0][0].theme).toBe('dark');
  });

  it('语法错误时提示并显示源码', async () => {
    mermaidMock.render.mockRejectedValue(new Error('Parse error on line 1\nmore detail'));
    const source = 'graph TD; broken((';
    render(<NormalMarkdown content={fence('mermaid', source)} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Parse error on line 1');
    expect(alert.textContent).not.toContain('more detail');
    expect(screen.getByText(source)).toBeTruthy();
  });

  it('源码过长时不渲染', async () => {
    render(<NormalMarkdown content={fence('mermaid', 'A'.repeat(20_001))} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('过长');
    expect(mermaidMock.render).not.toHaveBeenCalled();
  });

  it('其他语言的代码块保持原样，不加载 Mermaid', async () => {
    const { container } = render(<NormalMarkdown content={fence('js', 'const a = 1;')} />);
    expect(container.querySelector('pre code')?.textContent).toContain('const a = 1;');
    await new Promise((r) => setTimeout(r, 400));
    expect(mermaidMock.render).not.toHaveBeenCalled();
  });

  it('相同源码再次出现时直接用缓存，不重复渲染', async () => {
    const content = fence('mermaid', 'graph TD; C-->D');
    const first = render(<NormalMarkdown content={content} />);
    await screen.findByRole('img', { name: 'Mermaid 图表' });
    first.unmount();
    render(<NormalMarkdown content={content} />);
    await waitFor(() => expect(screen.getByRole('img', { name: 'Mermaid 图表' })).toBeTruthy());
    expect(mermaidMock.render).toHaveBeenCalledTimes(1);
  });
});
