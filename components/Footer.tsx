import React from 'react';
import Link from 'next/link';

const Footer: React.FC = () => {
  return (
    <footer>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
        <div>
          <h4 className="text-white mb-4">📝 关于 NOTE</h4>
          <p className="text-sm leading-relaxed">
            NOTE 是一个简洁而优雅的个人笔记应用。完全本地存储，100% 隐私保护。
          </p>
        </div>
        <div>
          <h4 className="text-white mb-4">🔗 快速链接</h4>
          <p className="text-sm space-y-2">
            <Link
              href="/"
              className="text-primary-light no-underline block hover:text-white transition-colors"
            >
              ← 返回首页
            </Link>
            <Link
              href="/contact"
              className="text-primary-light no-underline block hover:text-white transition-colors"
            >
              💰 支持我们
            </Link>
          </p>
        </div>
        <div>
          <h4 className="text-white mb-4">📞 联系我们</h4>
          <p className="text-sm space-y-1">
            <div>📧 i24026878@student.newinti.edu.my</div>
            <div>
              💬{' '}
              <Link
                href="/contact"
                className="text-primary-light no-underline hover:text-white transition-colors"
              >
                扫码支持
              </Link>
            </div>
          </p>
        </div>
      </div>
      <hr className="border-0 border-t border-white border-opacity-20 my-8" />
      <p>© 2026 NOTE. 用心记录每一刻。</p>
      <p className="mt-4 text-sm">
        <a
          href="/privacy"
          className="text-primary-light no-underline hover:text-white transition-colors"
        >
          隐私政策
        </a>{' '}
        |{' '}
        <a
          href="/terms"
          className="text-primary-light no-underline hover:text-white transition-colors"
        >
          使用条款
        </a>
      </p>
    </footer>
  );
};

export default Footer;
