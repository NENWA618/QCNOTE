import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { signOut } from 'next-auth/react';
import DeleteAccount from '../components/DeleteAccount';
import { purgeLocalUserData } from '../lib/storage/purgeUserData';

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return { default: { ...actual.default, post: vi.fn() } };
});
vi.mock('next-auth/react', () => ({ signOut: vi.fn() }));
vi.mock('../lib/storage/purgeUserData', () => ({ purgeLocalUserData: vi.fn() }));

async function openAndConfirm() {
  await userEvent.click(screen.getByRole('button', { name: '注销账号…' }));
  const submit = screen.getByRole('button', { name: '永久注销账号' });
  expect(submit).toBeDisabled();
  await userEvent.type(screen.getByLabelText(/请输入“注销账号”以确认/), '注销账号');
  expect(submit).toBeEnabled();
  return submit;
}

describe('DeleteAccount', () => {
  afterEach(() => vi.clearAllMocks());

  it('输入确认短语后删除服务器数据、清理本机数据并退出登录', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { success: true } });
    render(<DeleteAccount userId="github:42" />);

    await userEvent.click(await openAndConfirm());

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/ugc/user/github%3A42/delete'),
      { confirm: 'DELETE' },
    );
    expect(purgeLocalUserData).toHaveBeenCalledWith('github:42');
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/' });
  });

  it('服务器删除失败时显示错误，不清理本机数据也不退出登录', async () => {
    vi.mocked(axios.post).mockRejectedValue(new Error('Network Error'));
    render(<DeleteAccount userId="github:42" />);

    await userEvent.click(await openAndConfirm());

    expect(await screen.findByRole('alert')).toHaveTextContent('注销失败：Network Error');
    expect(purgeLocalUserData).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});
