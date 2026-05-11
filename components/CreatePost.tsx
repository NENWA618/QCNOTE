import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { ForumCategory } from '../types/ugc-types';
import { withApiBaseUrl } from '../lib/api-client';

interface CreatePostProps {
  categories: ForumCategory[];
}

type Message = {
  sender: 'system' | 'user';
  text: string;
};

export default function CreatePost({ categories }: CreatePostProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    categoryId: '',
    tags: ''
  });
  const [step, setStep] = useState(1);
  const [currentInput, setCurrentInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'system',
      text: '欢迎来到社区对话发布，按提示逐步填写你的话题。我们会像聊天一样帮你完成发帖流程。'
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session?.user) {
      router.push('/auth/signin');
    }
  }, [session, router]);

  const pushMessage = (message: Message) => {
    setMessages((prev) => [...prev, message]);
  };

  const handleTextSubmit = () => {
    setError('');

    if (step === 1) {
      if (!currentInput.trim()) {
        setError('标题不能为空');
        return;
      }
      pushMessage({ sender: 'user', text: currentInput.trim() });
      setFormData((prev) => ({ ...prev, title: currentInput.trim() }));
      setCurrentInput('');
      setStep(2);
      pushMessage({ sender: 'system', text: '好的，标题已记录。请选择最合适的分类。' });
      return;
    }

    if (step === 3) {
      const tags = currentInput
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .slice(0, 5);
      pushMessage({ sender: 'user', text: tags.length > 0 ? tags.join('，') : '不填写标签' });
      setFormData((prev) => ({ ...prev, tags: tags.join(',') }));
      setCurrentInput('');
      setStep(4);
      pushMessage({ sender: 'system', text: '标签已保存。现在请输入你的内容。' });
      return;
    }

    if (step === 4) {
      if (!currentInput.trim()) {
        setError('内容不能为空');
        return;
      }
      if (currentInput.trim().length > 10000) {
        setError('内容不能超过 10000 个字符');
        return;
      }
      pushMessage({ sender: 'user', text: currentInput.trim() });
      setFormData((prev) => ({ ...prev, content: currentInput.trim() }));
      setCurrentInput('');
      setStep(5);
      pushMessage({ sender: 'system', text: '内容已记录，准备提交你的帖子。' });
      return;
    }
  };

  const selectCategory = (categoryId: string | undefined, categoryName: string) => {
    if (!categoryId) {
      return;
    }
    pushMessage({ sender: 'user', text: categoryName });
    setFormData((prev) => ({ ...prev, categoryId }));
    setStep(3);
    pushMessage({ sender: 'system', text: '分类已选择。现在输入标签（可选），或者直接跳过。' });
  };

  const skipTags = () => {
    pushMessage({ sender: 'user', text: '不填写标签' });
    setFormData((prev) => ({ ...prev, tags: '' }));
    setCurrentInput('');
    setStep(4);
    pushMessage({ sender: 'system', text: '好的，继续输入你的内容。' });
  };

  const handleSubmit = async () => {
    setError('');

    if (!formData.title.trim()) {
      setError('标题不能为空');
      return;
    }
    if (!formData.categoryId) {
      setError('请选择分类');
      return;
    }
    if (!formData.content.trim()) {
      setError('内容不能为空');
      return;
    }

    setLoading(true);
    try {
      const tags = formData.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .slice(0, 5);

      const response = await fetch(withApiBaseUrl('/api/forum/posts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title.trim(),
          content: formData.content.trim(),
          categoryId: formData.categoryId,
          tags
        })
      });
      const data = await response.json();

      if (data.success) {
        router.push(`/forum/post/${data.post.id}`);
      } else {
        setError(data.error || '发布失败，请稍后重试');
      }
    } catch (e) {
      console.error('Create post error:', e);
      setError('发布失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const resetDialog = () => {
    setFormData({ title: '', content: '', categoryId: '', tags: '' });
    setStep(1);
    setCurrentInput('');
    setError('');
    setMessages([
      {
        sender: 'system',
        text: '欢迎来到社区对话发布，按提示逐步填写你的话题。我们会像聊天一样帮你完成发帖流程。'
      }
    ]);
  };

  if (!session?.user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-light via-primary-medium to-purple-200 text-primary-dark dark:bg-dark-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-primary-dark dark:text-dark-text">正在加载...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-light via-primary-medium to-purple-200 text-primary-dark dark:bg-dark-bg">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <section className="bg-white/90 dark:bg-dark-surface border border-primary-light/30 dark:border-dark-border rounded-3xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700 bg-slate-50 dark:bg-dark-surface-light">
            <h1 className="text-2xl font-semibold text-primary-dark dark:text-white">对话式发布</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              节省干扰，一步步完成发帖。
            </p>
          </div>
          <div className="p-6 space-y-4" style={{ minHeight: '520px' }}>
            <div className="space-y-3">
              {messages.map((message, index) => (
                <div key={`${message.sender}-${index}`} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] whitespace-pre-wrap rounded-3xl p-4 text-sm leading-6 ${
                    message.sender === 'user'
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-slate-100 text-slate-900 dark:bg-gray-700 dark:text-gray-100 rounded-bl-none'
                  }`}>
                    {message.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              {step === 2 ? (
                <div className="space-y-4">
                  <p className="font-medium">请选择分类</p>
                  <div className="flex flex-wrap gap-3">
                    {categories.map((category) => (
                      <button
                        key={category.id || category.categoryId || category.name}
                        type="button"
                        onClick={() => selectCategory(category.id || category.categoryId, category.name)}
                        className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:border-blue-500 hover:bg-blue-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 transition"
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
              ) : step === 5 ? (
                <div className="space-y-4">
                  <p className="font-medium">确认一下内容</p>
                  <div className="rounded-3xl border border-blue-200 bg-blue-50 p-4 text-sm text-slate-700 dark:bg-blue-900/20 dark:text-blue-100">
                    <p><span className="font-medium">标题：</span>{formData.title}</p>
                    <p className="mt-2"><span className="font-medium">分类：</span>{categories.find((item) => item.id === formData.categoryId || item.categoryId === formData.categoryId)?.name ?? '未选择'}</p>
                    <p className="mt-2"><span className="font-medium">标签：</span>{formData.tags || '未填写'}</p>
                    <p className="mt-2"><span className="font-medium">内容：</span>{formData.content.slice(0, 180)}{formData.content.length > 180 ? '...' : ''}</p>
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="font-medium">{step === 3 ? '标签（可选）' : '请输入内容'}</p>
                  {step === 4 ? (
                    <textarea
                      rows={5}
                      value={currentInput}
                      onChange={(e) => setCurrentInput(e.target.value)}
                      placeholder="请在这里输入你的内容..."
                      className="w-full rounded-3xl border border-gray-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-blue-500"
                    />
                  ) : (
                    <input
                      type="text"
                      value={currentInput}
                      onChange={(e) => setCurrentInput(e.target.value)}
                      placeholder={step === 1 ? '例如：如何用 QCNOTE 管理知识图谱？' : '例如：Live2D, 教程, 分享'}
                      className="w-full rounded-3xl border border-gray-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-blue-500"
                    />
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {step === 3 && (
                      <button
                        type="button"
                        onClick={skipTags}
                        className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 transition"
                      >
                        跳过标签
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleTextSubmit}
                      className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
                    >
                      {step === 4 ? '提交内容' : '继续'}
                    </button>
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>步骤 {step} / 5</span>
              <button
                type="button"
                onClick={resetDialog}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                重新开始
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
