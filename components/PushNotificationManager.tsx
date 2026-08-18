import React, { useState } from 'react';
import Image from 'next/image';
import axios from 'axios';

interface PushNotificationManagerProps {
  onNotificationSent?: () => void;
}

export default function PushNotificationManager({
  onNotificationSent,
}: PushNotificationManagerProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [icon, setIcon] = useState('/images/icons/note_icon.png');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');

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
        badge: '/images/icons/note_icon.png',
        tag: 'qcnote-broadcast',
        data: {
          timestamp: new Date().toISOString(),
        },
      });

      if (response.data.success) {
        const { result } = response.data;
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
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message || '发送失败';
      setMessage(`❌ 发送失败: ${errorMsg}`);
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg shadow-sm border border-primary-light/30 dark:border-dark-border">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text">📢 推送通知管理</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          向所有已订阅用户发送官方通知
        </p>
      </div>

      <form onSubmit={handleSend} className="px-6 py-6">
        {/* 标题 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-2">
            通知标题 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：新功能发布 或 系统维护通知"
            className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent-pink bg-white dark:bg-dark-surface-light text-gray-900 dark:text-dark-text"
            disabled={loading}
          />
        </div>

        {/* 内容 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-2">
            通知内容
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="输入通知内容（可选）"
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent-pink bg-white dark:bg-dark-surface-light text-gray-900 dark:text-dark-text"
            disabled={loading}
          />
        </div>

        {/* 图标 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-2">
            通知图标 URL
          </label>
          <input
            type="text"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="/images/icons/note_icon.png"
            className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent-pink bg-white dark:bg-dark-surface-light text-gray-900 dark:text-dark-text text-sm"
            disabled={loading}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            通知图标的 URL，支持相对路径
          </p>
        </div>

        {/* 消息反馈 */}
        {message && (
          <div
            className={`mb-4 p-3 rounded-md text-sm whitespace-pre-line ${
              messageType === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
            }`}
          >
            {message}
          </div>
        )}

        {/* 预览 */}
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
            预览
          </p>
          <div className="bg-white dark:bg-dark-surface rounded p-3 flex gap-3">
            {icon && <Image src={icon} alt="icon" width={48} height={48} className="rounded" />}
            <div className="flex-1">
              <p className="font-medium text-gray-900 dark:text-dark-text text-sm">
                {title || '通知标题'}
              </p>
              {body && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{body}</p>
              )}
            </div>
          </div>
        </div>

        {/* 发送按钮 */}
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={() => {
              setTitle('');
              setBody('');
              setIcon('/images/icons/note_icon.png');
              setMessage('');
            }}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            清空
          </button>
          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="px-6 py-2 text-sm font-medium text-white bg-accent-pink rounded-md hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
          💡 提示：通知将发送给所有已订阅的用户。您可以在浏览器通知权限允许的情况下看到推送。
        </p>
      </form>
    </div>
  );
}
