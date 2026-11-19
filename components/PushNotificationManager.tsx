import React, { useState } from 'react';
import axios from 'axios';

const DEFAULT_ICON = '/images/icons/note_icon.png';

interface PushNotificationManagerProps {
  onNotificationSent?: () => void;
}

export default function PushNotificationManager({
  onNotificationSent,
}: PushNotificationManagerProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [icon, setIcon] = useState(DEFAULT_ICON);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'warning' | 'error' | ''>('');

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setMessage('请输入通知标题');
      setMessageType('error');
      return;
    }

    setLoading(true);
    setMessage('');
    setMessageType('');

    try {
      const response = await axios.post('/api/push/broadcast', {
        title: title.trim(),
        body: body.trim(),
        icon,
        badge: '/images/icons/badge_96.png',
        tag: 'qcnote-broadcast',
        data: {
          timestamp: new Date().toISOString(),
        },
      });

      if (response.data.success) {
        const { result } = response.data;
        if (result.success + result.failed === 0) {
          // Nothing was sent: keep the form so it can be sent once someone subscribes.
          setMessage('⚠️ 当前没有任何订阅，通知未发送');
          setMessageType('warning');
          return;
        }
        setMessage(
          `✅ 推送已发送\n成功: ${result.success}/${result.success + result.failed}\n${
            result.failed > 0 ? `失败: ${result.failed}` : ''
          }`,
        );
        setMessageType('success');

        // 清空表单
        setTitle('');
        setBody('');

        onNotificationSent?.();
      }
    } catch (error: unknown) {
      const errorMsg = axios.isAxiosError<{ error?: string }>(error)
        ? error.response?.data?.error || error.message
        : error instanceof Error
          ? error.message
          : '发送失败';
      setMessage(`❌ 发送失败: ${errorMsg}`);
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setBody('');
    setIcon(DEFAULT_ICON);
    setMessage('');
  };

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-primary-light/40 dark:border-dark-border">
      <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-dark-border">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text">📢 推送通知</h2>
        <p className="text-sm text-text-light mt-1">向所有已订阅用户发送官方通知</p>
      </div>

      <form
        onSubmit={handleSend}
        className="px-4 sm:px-6 py-5 sm:py-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <div className="space-y-4 min-w-0">
          {/* 标题 */}
          <div>
            <label
              htmlFor="push-title"
              className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1.5"
            >
              通知标题 <span className="text-red-500">*</span>
            </label>
            <input
              id="push-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：新功能发布 或 系统维护通知"
              className="input py-2"
              disabled={loading}
            />
          </div>

          {/* 内容 */}
          <div>
            <label
              htmlFor="push-body"
              className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1.5"
            >
              通知内容
            </label>
            <textarea
              id="push-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="输入通知内容（可选）"
              rows={4}
              className="input py-2 resize-y"
              disabled={loading}
            />
          </div>

          {/* 图标 */}
          <div>
            <label
              htmlFor="push-icon"
              className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1.5"
            >
              通知图标 URL
            </label>
            <input
              id="push-icon"
              type="text"
              inputMode="url"
              autoCapitalize="off"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder={DEFAULT_ICON}
              className="input py-2 text-sm"
              disabled={loading}
            />
            <p className="text-xs text-text-light mt-1">通知图标的 URL，支持相对路径</p>
          </div>
        </div>

        {/* 预览 + 操作：桌面端在右栏并随页面吸顶，移动端排在表单下方 */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="p-4 bg-gray-50 dark:bg-dark-surface-light rounded-xl border border-gray-200 dark:border-dark-border">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">预览</p>
            <div className="bg-white dark:bg-dark-surface rounded-lg p-3 flex gap-3 shadow-sm">
              {icon && (
                // 管理员可以填任意地址，还没输完时也会渲染：next/image 遇到未配置的域名或不以 /
                // 开头的路径会直接抛错，所以预览用普通 img
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={icon}
                  alt="icon"
                  width={48}
                  height={48}
                  className="h-12 w-12 shrink-0 rounded object-cover"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-dark-text text-sm break-words">
                  {title || '通知标题'}
                </p>
                {body && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2 break-words">
                    {body}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 消息反馈 */}
          {message && (
            <div
              role="status"
              className={`p-3 rounded-xl text-sm whitespace-pre-line ${
                messageType === 'success'
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                  : messageType === 'warning'
                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
              }`}
            >
              {message}
            </div>
          )}

          {/* 发送按钮 */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={resetForm}
              disabled={loading}
              className="btn btn-secondary"
            >
              清空
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="btn btn-primary flex-1"
            >
              {loading ? (
                <>
                  <span className="animate-spin">⏳</span>
                  发送中...
                </>
              ) : (
                '📤 发送通知'
              )}
            </button>
          </div>

          <p className="text-xs text-text-light">
            💡 通知将发送给所有已订阅的用户。您可以在浏览器通知权限允许的情况下看到推送。
          </p>
        </div>
      </form>
    </div>
  );
}
