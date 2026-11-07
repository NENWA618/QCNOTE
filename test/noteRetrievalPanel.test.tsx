import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const embeddings = vi.hoisted(() => ({
  embedTexts: vi.fn(),
  isSemanticSearchAvailable: vi.fn(() => true),
  onEmbeddingProgress: vi.fn(() => () => {}),
  cosineSimilarity: (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0),
}));

vi.mock('../lib/embeddings', () => embeddings);
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import NoteRetrievalPanel from '../components/NoteRetrievalPanel';
import { NoteStorageError } from '../lib/storage';
import type NoteStorage from '../lib/storage';
import type { NoteItem } from '../lib/storage';
import type { RagCache } from '../lib/rag';

const VOCAB = ['苹果', '香蕉'];
function fakeVector(text: string): number[] {
  const v: number[] = VOCAB.map((w) => (text.includes(w) ? 1 : 0));
  v.push(0.05);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / norm);
}

function note(id: string, title: string, content: string, extra: Partial<NoteItem> = {}): NoteItem {
  return {
    id,
    title,
    content,
    category: '',
    tags: [],
    color: '#fff',
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

function makeStorage(notes: NoteItem[] | Error) {
  let cache: RagCache | null = null;
  return {
    loadNotesAsync: vi.fn(async () => {
      if (notes instanceof Error) throw notes;
      return notes;
    }),
    loadRagCache: vi.fn(async () => cache),
    saveRagCache: vi.fn(async (c: RagCache) => {
      cache = c;
    }),
  } as unknown as NoteStorage;
}

describe('NoteRetrievalPanel', () => {
  beforeEach(() => {
    embeddings.embedTexts.mockReset();
    embeddings.embedTexts.mockImplementation(async (texts: string[]) => texts.map(fakeVector));
    embeddings.isSemanticSearchAvailable.mockReturnValue(true);
  });
  afterEach(() => cleanup());

  it('提交问题后展示命中的段落、所属笔记和小节标题', async () => {
    const storage = makeStorage([
      note('n1', '水果笔记', '# 苹果\n今天吃了苹果。\n\n# 香蕉\n香蕉也不错。'),
      note('n2', '无关', '完全无关的内容'),
    ]);
    render(<NoteRetrievalPanel getStorage={async () => storage} />);

    await userEvent.type(screen.getByLabelText('输入你想在笔记里查找的内容'), '苹果');
    await userEvent.click(screen.getByRole('button', { name: '检索' }));

    expect(await screen.findByText('今天吃了苹果。')).toBeTruthy();
    expect(screen.getByText(/水果笔记/)).toBeTruthy();
    expect(screen.getByText(/› 苹果/)).toBeTruthy();
    expect(screen.queryByText('完全无关的内容')).toBeNull();
    expect(screen.getByText(/相关度/)).toBeTruthy();
  });

  it('不检索回收站里的笔记', async () => {
    const storage = makeStorage([
      note('n1', '已删除', '苹果苹果', { isDeleted: true }),
      note('n2', '正常', '苹果在这里'),
    ]);
    render(<NoteRetrievalPanel getStorage={async () => storage} />);

    await userEvent.type(screen.getByLabelText('输入你想在笔记里查找的内容'), '苹果{Enter}');

    expect(await screen.findByText('苹果在这里')).toBeTruthy();
    expect(screen.queryByText('苹果苹果')).toBeNull();
  });

  it('没有相关内容时给出提示', async () => {
    const storage = makeStorage([note('n1', '编程', '学习 Python')]);
    render(<NoteRetrievalPanel getStorage={async () => storage} />);

    await userEvent.type(screen.getByLabelText('输入你想在笔记里查找的内容'), '香蕉{Enter}');

    expect(await screen.findByText(/没有找到相关内容/)).toBeTruthy();
  });

  it('空输入时检索按钮不可点，不会触发 embedding', async () => {
    render(<NoteRetrievalPanel getStorage={async () => makeStorage([])} />);
    const button = screen.getByRole('button', { name: '检索' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(embeddings.embedTexts).not.toHaveBeenCalled();
  });

  it('设备未解锁时提示先去笔记页验证', async () => {
    const storage = makeStorage(new NoteStorageError('locked', 'locked'));
    render(<NoteRetrievalPanel getStorage={async () => storage} />);

    await userEvent.type(screen.getByLabelText('输入你想在笔记里查找的内容'), '苹果{Enter}');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('设备未解锁');
  });

  it('模型加载失败时展示错误', async () => {
    embeddings.embedTexts.mockRejectedValue(new Error('模型下载失败'));
    const storage = makeStorage([note('n1', '水果', '苹果')]);
    render(<NoteRetrievalPanel getStorage={async () => storage} />);

    await userEvent.type(screen.getByLabelText('输入你想在笔记里查找的内容'), '苹果{Enter}');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('模型下载失败');
  });

  it('建立索引时显示进度', async () => {
    let release!: () => void;
    embeddings.embedTexts.mockImplementation(
      (texts: string[]) =>
        new Promise((resolve) => {
          release = () => resolve(texts.map(fakeVector));
        }),
    );
    const storage = makeStorage([note('n1', '水果', '苹果')]);
    render(<NoteRetrievalPanel getStorage={async () => storage} />);

    await userEvent.type(screen.getByLabelText('输入你想在笔记里查找的内容'), '苹果{Enter}');

    expect(await screen.findByText(/正在为笔记建立索引 0 \/ 1/)).toBeTruthy();
    expect((screen.getByRole('button', { name: '检索中...' }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    release();
    await waitFor(() => expect(embeddings.embedTexts).toHaveBeenCalledTimes(1));
    release(); // 问题本身的 embedding
    expect(await screen.findByText(/最相关的 1 段内容/)).toBeTruthy();
  });

  it('浏览器不支持 Worker 时禁用并提示', () => {
    embeddings.isSemanticSearchAvailable.mockReturnValue(false);
    render(<NoteRetrievalPanel getStorage={async () => makeStorage([])} />);
    expect(screen.getByRole('alert').textContent).toContain('不支持 Web Worker');
    expect((screen.getByLabelText('输入你想在笔记里查找的内容') as HTMLInputElement).disabled).toBe(
      true,
    );
  });
});
