import React, { useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { signOut } from 'next-auth/react';
import { withApiBaseUrl } from '../lib/api-client';

// 用户需要原样输入这句话才能注销，避免误点
const CONFIRM_PHRASE = '注销账号';

interface DeleteAccountProps {
  userId: string;
}

// 取消本浏览器的推送订阅；服务器上的订阅记录随账号一起删除
async function unsubscribeLocalPush() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  await subscription?.unsubscribe();
}

/**
 * 注销账号：先删除服务器上的数据，再清掉本机为该账号保存的加密笔记和设置，最后退出登录。
 * 服务器上的加密密钥删除后，本机笔记已无法解密，所以要提醒用户先导出。
 */
const DeleteAccount: React.FC<DeleteAccountProps> = ({ userId }) => {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = typed.trim() === CONFIRM_PHRASE && !deleting;

  const cancel = () => {
    setOpen(false);
    setTyped('');
    setError(null);
  };

  const handleDelete = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await axios.post(withApiBaseUrl(`/api/ugc/user/${encodeURIComponent(userId)}/delete`), {
        confirm: 'DELETE',
      });
    } catch (err) {
      const message =
        axios.isAxiosError<{ error?: string }>(err) && err.response
          ? err.response.data?.error || `${err.response.status} ${err.response.statusText}`
          : err instanceof Error
            ? err.message
            : '未知错误';
      setError(`注销失败：${message}`);
      setDeleting(false);
      return;
    }

    // 服务器上的账号已删除：本机清理失败也继续退出登录，不让用户停在一个已不存在的账号里
    try {
      const { purgeLocalUserData } = await import('../lib/storage/purgeUserData');
      await purgeLocalUserData(userId);
    } catch (err) {
      console.warn('[DeleteAccount] 清理本机数据失败', err);
    }
    try {
      await unsubscribeLocalPush();
    } catch (err) {
      console.warn('[DeleteAccount] 取消推送订阅失败', err);
    }
    await signOut({ callbackUrl: '/' });
  };

  return (
    <section className="bg-white/95 dark:bg-dark-surface rounded-2xl border border-red-200 dark:border-red-900/60 p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-1">注销账号</h2>
          <p className="text-sm text-text-light">
            永久删除你的账号和服务器上的全部数据，此操作无法撤销。
          </p>
        </div>
        {!open && (
          <button type="button" className="btn btn-danger shrink-0" onClick={() => setOpen(true)}>
            注销账号…
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={handleDelete} className="mt-4" noValidate>
          <div className="p-4 rounded-xl text-sm bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200">
            <p className="font-medium">注销后将删除：</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>个人资料与公开主页</li>
              <li>所有公开笔记（公开链接将失效）</li>
              <li>排行榜成绩与推送订阅</li>
              <li>
                用于加密笔记的密钥，以及本设备上这个账号的笔记和设置——其它设备上的笔记也将无法再解密
              </li>
            </ul>
            <p className="mt-3">
              如需保留笔记，请先到{' '}
              <Link href="/dashboard" className="underline font-medium">
                仪表盘
              </Link>{' '}
              使用“导出数据”备份。WebDAV / OneDrive 上已同步的文件不会被删除。
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-4 p-3 rounded-xl text-sm bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <label
            htmlFor="delete-account-confirm"
            className="block mt-4 text-sm font-medium text-ink dark:text-dark-text mb-1.5"
          >
            请输入“{CONFIRM_PHRASE}”以确认
          </label>
          <input
            id="delete-account-confirm"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            disabled={deleting}
            className="input py-2"
          />

          <div className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={cancel}
              disabled={deleting}
            >
              取消
            </button>
            <button type="submit" className="btn btn-danger" disabled={!canDelete}>
              {deleting ? '注销中...' : '永久注销账号'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
};

export default DeleteAccount;
