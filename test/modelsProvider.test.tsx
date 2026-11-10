import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  getAISettings: vi.fn(),
  saveAISettings: vi.fn(),
  clearAISettings: vi.fn(),
  generateNote: vi.fn(),
  addNoteAsync: vi.fn(),
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'u1' } }, status: 'authenticated' }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('../lib/aiSettings', () => ({
  getAISettings: mocks.getAISettings,
  saveAISettings: mocks.saveAISettings,
  clearAISettings: mocks.clearAISettings,
}));
vi.mock('../lib/aiClient', () => ({ generateNote: mocks.generateNote }));
vi.mock('../lib/dialog', () => ({ confirmDialog: vi.fn(async () => true) }));
vi.mock('../lib/embeddings', () => ({
  embedTexts: vi.fn(),
  isSemanticSearchAvailable: () => true,
  onEmbeddingProgress: () => () => {},
  cosineSimilarity: () => 0,
}));
vi.mock('../lib/storage', () => {
  class FakeStorage {
    currentUserId: string | null = 'u1';
    notesDbLocked = false;
    async setCurrentUser(id: string | null) {
      this.currentUserId = id;
    }
    addNoteAsync = mocks.addNoteAsync;
    loadNotesAsync = vi.fn(async () => []);
  }
  class NoteStorageError extends Error {
    constructor(
      message: string,
      readonly kind: string,
    ) {
      super(message);
    }
  }
  return { default: FakeStorage, NoteStorageError, initWindowStorage: () => null };
});

import AIModelSettings from '../components/Models';

const field = (label: string) =>
  screen.getByLabelText(label) as HTMLInputElement | HTMLSelectElement;

async function renderLoaded() {
  render(<AIModelSettings />);
  await screen.findByLabelText('接口类型');
}

describe('Models 页：接口类型', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getAISettings.mockResolvedValue(null);
    mocks.saveAISettings.mockResolvedValue(true);
  });
  afterEach(() => cleanup());

  it('默认是 Chat Completions，五种类型都可选', async () => {
    await renderLoaded();
    const select = field('接口类型') as HTMLSelectElement;
    expect(select.value).toBe('openai-chat');
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      'openai-chat',
      'openai-responses',
      'gemini',
      'gemini-interactions',
      'deepseek',
    ]);
  });

  it('切换到 DeepSeek：自动填入官方地址，并提示新模型名', async () => {
    await renderLoaded();
    await userEvent.selectOptions(field('接口类型'), 'deepseek');

    expect((field('API 地址') as HTMLInputElement).value).toBe(
      'https://api.deepseek.com/chat/completions',
    );
    expect((field('模型名称') as HTMLInputElement).placeholder).toContain('deepseek-v4-flash');
    expect(screen.getByText(/已于 2026-07-24 弃用/)).toBeTruthy();
  });

  it('切换到 Gemini Interactions：自动填入 /interactions 官方地址', async () => {
    await renderLoaded();
    await userEvent.selectOptions(field('接口类型'), 'gemini-interactions');

    expect((field('API 地址') as HTMLInputElement).value).toBe(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
    );
    expect((field('模型名称') as HTMLInputElement).placeholder).toContain('gemini-3.5-flash');
  });

  it('在不同类型之间切换时，上一个类型的默认地址会被替换', async () => {
    await renderLoaded();
    await userEvent.selectOptions(field('接口类型'), 'deepseek');
    await userEvent.selectOptions(field('接口类型'), 'gemini');

    expect((field('API 地址') as HTMLInputElement).value).toBe(
      'https://generativelanguage.googleapis.com/v1beta',
    );
  });

  it('用户自己填的地址（比如代理）切换类型时不会被覆盖', async () => {
    await renderLoaded();
    await userEvent.type(field('API 地址'), 'https://my-proxy.test/v1/chat/completions');
    await userEvent.selectOptions(field('接口类型'), 'deepseek');

    expect((field('API 地址') as HTMLInputElement).value).toBe(
      'https://my-proxy.test/v1/chat/completions',
    );
  });

  it('保存时带上所选的接口类型', async () => {
    await renderLoaded();
    await userEvent.selectOptions(field('接口类型'), 'openai-responses');
    await userEvent.type(field('模型名称'), 'gpt-5.4');
    await userEvent.type(field('API Key'), 'sk-test');
    await userEvent.click(screen.getByRole('button', { name: '保存设置' }));

    await waitFor(() => expect(mocks.saveAISettings).toHaveBeenCalled());
    expect(mocks.saveAISettings.mock.calls[0][1]).toEqual({
      provider: 'openai-responses',
      apiEndpoint: 'https://api.openai.com/v1/responses',
      modelName: 'gpt-5.4',
      apiKey: 'sk-test',
    });
  });

  it('只改了接口类型也算有未保存的更改', async () => {
    await renderLoaded();
    const save = screen.getByRole('button', { name: '保存设置' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await userEvent.selectOptions(field('接口类型'), 'gemini');
    expect(save.disabled).toBe(false);
  });

  it('读取已保存的设置并显示其接口类型', async () => {
    mocks.getAISettings.mockResolvedValue({
      provider: 'gemini',
      apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
      modelName: 'gemini-3.5-flash',
      apiKey: 'k',
      updatedAt: 1,
    });
    await renderLoaded();
    expect((field('接口类型') as HTMLSelectElement).value).toBe('gemini');
    expect((field('模型名称') as HTMLInputElement).value).toBe('gemini-3.5-flash');
  });

  it('生成笔记时按所选接口类型调用', async () => {
    mocks.getAISettings.mockResolvedValue({
      provider: 'deepseek',
      apiEndpoint: 'https://api.deepseek.com/chat/completions',
      modelName: 'deepseek-v4-flash',
      apiKey: 'k',
      updatedAt: 1,
    });
    mocks.generateNote.mockResolvedValue({ title: '问候', content: '回复内容' });
    mocks.addNoteAsync.mockResolvedValue(undefined);
    await renderLoaded();

    await userEvent.type(screen.getByLabelText('输入你想问的内容'), '你好');
    await userEvent.click(screen.getByRole('button', { name: '生成并保存为笔记' }));

    await waitFor(() => expect(mocks.generateNote).toHaveBeenCalled());
    expect(mocks.generateNote.mock.calls[0][0]).toMatchObject({
      provider: 'deepseek',
      modelName: 'deepseek-v4-flash',
      prompt: '你好',
    });
    expect(await screen.findByText('回复内容')).toBeTruthy();
    expect(mocks.addNoteAsync.mock.calls[0][0]).toMatchObject({
      title: '问候',
      content: '回复内容',
    });
  });
});
