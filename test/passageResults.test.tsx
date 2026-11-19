import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PassageResults from '../components/PassageResults';
import type { RagHit } from '../lib/rag';

function hit(extra: Partial<RagHit> = {}): RagHit {
  return {
    noteId: 'n1',
    noteTitle: '水果笔记',
    chunkIndex: 0,
    heading: '苹果',
    text: '今天吃了苹果。',
    score: 0.87,
    ...extra,
  };
}

type Props = React.ComponentProps<typeof PassageResults>;

function renderPanel(props: Partial<Props> = {}) {
  const onOpenNote = vi.fn();
  const utils = render(
    <PassageResults
      query="苹果"
      hits={[]}
      status="ready"
      progress={0}
      indexProgress={null}
      error={null}
      onOpenNote={onOpenNote}
      {...props}
    />,
  );
  return { ...utils, onOpenNote };
}

describe('PassageResults', () => {
  afterEach(() => cleanup());

  it('展示命中的段落、所属笔记、小节标题和相关度', () => {
    renderPanel({ hits: [hit(), hit({ chunkIndex: 1, heading: '', text: '另一段' })] });

    expect(screen.getByText('今天吃了苹果。')).toBeTruthy();
    expect(screen.getByText('另一段')).toBeTruthy();
    expect(screen.getByText(/› 苹果/)).toBeTruthy();
    expect(screen.getAllByText(/相关度 0\.87/)).toHaveLength(2);
    expect(screen.getByText(/与「苹果」最相关的 2 段内容/)).toBeTruthy();
  });

  it('标题里用的是命中时的搜索词，而不是当前输入', () => {
    renderPanel({ query: '苹', hits: [hit()], status: 'searching' });
    expect(screen.getByText(/与「苹」最相关/)).toBeTruthy();
  });

  it('点击结果标题会打开对应的笔记', async () => {
    const { onOpenNote } = renderPanel({ hits: [hit({ noteId: 'n9', noteTitle: '蔬菜' })] });
    await userEvent.click(screen.getByRole('button', { name: '打开笔记：蔬菜' }));
    expect(onOpenNote).toHaveBeenCalledWith('n9');
  });

  it('没有标题的笔记显示“无标题”', () => {
    renderPanel({ hits: [hit({ noteTitle: '' })] });
    expect(screen.getByRole('button', { name: '打开笔记：无标题' })).toBeTruthy();
  });

  it('没有相关内容时给出提示', () => {
    renderPanel({ hits: [], status: 'ready' });
    expect(screen.getByText(/没有找到语义相关的段落/)).toBeTruthy();
  });

  it('检索中不显示“没有找到”，上一轮的结果继续展示', () => {
    renderPanel({ hits: [hit()], status: 'searching' });
    expect(screen.getByRole('status').textContent).toContain('检索中');
    expect(screen.queryByText(/没有找到/)).toBeNull();
    expect(screen.getByText('今天吃了苹果。')).toBeTruthy();
  });

  it('下载模型和建立索引时显示进度', () => {
    const { rerender, onOpenNote } = renderPanel({ status: 'loading-model', progress: 42.4 });
    expect(screen.getByRole('status').textContent).toContain('正在下载本地模型 42%');

    rerender(
      <PassageResults
        query="苹果"
        hits={[]}
        status="indexing"
        progress={0}
        indexProgress={{ done: 3, total: 10 }}
        error={null}
        onOpenNote={onOpenNote}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('正在为笔记建立索引 3 / 10');
  });

  it('出错时展示错误信息', () => {
    renderPanel({ status: 'error', error: '模型下载失败' });
    expect(screen.getByRole('alert').textContent).toContain('模型下载失败');
  });

  it('空闲，或环境不支持（出错但没有错误信息）时不渲染', () => {
    const idle = renderPanel({ status: 'idle' });
    expect(idle.container.firstChild).toBeNull();
    idle.unmount();

    const unsupported = renderPanel({ status: 'error', error: null });
    expect(unsupported.container.firstChild).toBeNull();
  });
});
