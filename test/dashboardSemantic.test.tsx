import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  signOut: vi.fn(),
}));
vi.mock('next/head', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

const embeddings = vi.hoisted(() => ({
  embedTexts: vi.fn(),
  isSemanticSearchAvailable: vi.fn(() => true),
  onEmbeddingProgress: vi.fn(() => () => {}),
  cosineSimilarity: (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0),
}));
vi.mock('../lib/embeddings', () => embeddings);

import Dashboard from '../pages/dashboard';
import { setContent } from './editorHarness';

const SEMANTIC_KEY = 'qcnote:semantic-search-enabled';
// “durian”是“榴莲”的同义词：向量相同，但文字上关键词搜索找不到
const CONCEPTS = [['榴莲', 'durian']];
function fakeVector(text: string): number[] {
  const v: number[] = CONCEPTS.map((words) => (words.some((w) => text.includes(w)) ? 1 : 0));
  v.push(0.05);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / norm);
}

const panel = () => screen.queryByRole('heading', { name: '相关段落' });

async function createNote(content: string) {
  fireEvent.click(screen.getByRole('button', { name: '新建笔记' }));
  await screen.findByRole('dialog', { name: '新建笔记' });
  setContent(content);
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 150));
  });
}

async function renderWithNote(...contents: string[]) {
  render(<Dashboard />);
  await screen.findByRole('heading', { name: '笔记管理' });
  for (const content of contents.length > 0 ? contents : ['今天尝了榴莲，味道很冲。']) {
    await createNote(content);
  }
}

describe('Dashboard 的统一搜索：关键词 + 语义笔记 + 相关段落出自同一个搜索框', () => {
  beforeEach(() => {
    window.localStorage.removeItem(SEMANTIC_KEY);
    embeddings.embedTexts.mockReset();
    embeddings.embedTexts.mockImplementation(async (texts: string[]) => texts.map(fakeVector));
    embeddings.isSemanticSearchAvailable.mockReturnValue(true);
  });
  afterEach(() => {
    cleanup();
    window.localStorage.removeItem(SEMANTIC_KEY);
  });

  it('没开启语义搜索：没有相关段落面板，也不会触发模型', async () => {
    await renderWithNote();
    await userEvent.type(screen.getByRole('searchbox', { name: '搜索笔记' }), '榴莲');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });

    expect(panel()).toBeNull();
    expect(embeddings.embedTexts).not.toHaveBeenCalled();
  });

  it('开启后输入搜索词：列表上方出现相关段落，一次搜索只做一次 query embedding', async () => {
    await renderWithNote();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.type(screen.getByRole('searchbox', { name: '搜索笔记' }), '榴莲');

    // 面板里有命中的段落；同一篇笔记也在下面的列表里（关键词命中）
    const heading = await screen.findByRole('heading', { name: '相关段落' }, { timeout: 3000 });
    const section = heading.closest('section') as HTMLElement;
    await within(section).findAllByText(/今天尝了榴莲/, {}, { timeout: 3000 });
    await within(section).findByText(/与「榴莲」最相关/);
    expect(screen.getAllByText(/今天尝了榴莲/).length).toBeGreaterThan(
      within(section).getAllByText(/今天尝了榴莲/).length,
    );

    const queryEmbeds = embeddings.embedTexts.mock.calls.filter(
      ([texts]) => texts.length === 1 && texts[0] === '榴莲',
    );
    expect(queryEmbeds).toHaveLength(1);
  });

  it('清空搜索框后面板消失', async () => {
    await renderWithNote();
    await userEvent.click(screen.getByRole('checkbox'));
    const box = screen.getByRole('searchbox', { name: '搜索笔记' });
    await userEvent.type(box, '榴莲');
    await waitFor(() => expect(panel()).toBeInTheDocument(), { timeout: 3000 });

    await userEvent.clear(box);
    await waitFor(() => expect(panel()).toBeNull());
  });

  it('关键词没命中、意思相近的笔记单独成组，排在关键词命中的后面', async () => {
    await renderWithNote('今天尝了榴莲，味道很冲。', 'durian 季节到了，市集上很多。');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.type(screen.getByRole('searchbox', { name: '搜索笔记' }), '榴莲');

    const semantic = await screen.findByRole('region', { name: /语义相关/ }, { timeout: 3000 });
    const keyword = screen.getByRole('region', { name: /关键词匹配/ });
    expect(within(semantic).getByText(/durian 季节到了/)).toBeInTheDocument();
    expect(within(semantic).queryByText(/今天尝了榴莲/)).toBeNull();
    expect(within(keyword).getAllByText(/今天尝了榴莲/).length).toBeGreaterThan(0);
    expect(within(keyword).queryByText(/durian 季节到了/)).toBeNull();
    // 关键词组在前
    expect(
      keyword.compareDocumentPosition(semantic) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('不开启语义搜索时没有分组标题', async () => {
    await renderWithNote('今天尝了榴莲，味道很冲。', 'durian 季节到了，市集上很多。');
    await userEvent.type(screen.getByRole('searchbox', { name: '搜索笔记' }), '榴莲');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    expect(screen.queryByRole('region', { name: /语义相关/ })).toBeNull();
    expect(screen.queryByRole('region', { name: /关键词匹配/ })).toBeNull();
  });

  it('在回收站视图里输入搜索词不会跑模型', async () => {
    await renderWithNote();
    await userEvent.click(screen.getByRole('checkbox'));

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.click(await screen.findByRole('option', { name: '回收站' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /返回/ })).toBeInTheDocument());

    await userEvent.type(screen.getByRole('searchbox', { name: '搜索笔记' }), '榴莲');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    expect(embeddings.embedTexts).not.toHaveBeenCalled();
  });
});
