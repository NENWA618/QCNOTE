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
      <p className="text-xs mt-2 text-gray-400">
        看板娘基于 <a href="https://github.com/fghrsh/live2d_demo" className="text-primary-light underline hover:text-white transition-colors" target="_blank" rel="noopener noreferrer">Live2D 看板娘</a> 开源项目（GPL-2.0），支持自定义台词、健康提醒、天气查询、待办事项等功能。
      </p>
      <p className="text-xs text-gray-400">
        本站使用 <a href="https://pixijs.com/" className="text-primary-light underline hover:text-white transition-colors" target="_blank" rel="noopener noreferrer">Pixi.js</a>、
        <a href="https://github.com/guansss/pixi-live2d-display" className="text-primary-light underline hover:text-white transition-colors" target="_blank" rel="noopener noreferrer">pixi-live2d-display</a> 等开源库（MIT/Apache 等）。
      </p>
      <p className="mt-4 text-sm">
        <Link
          href="/privacy"
          className="text-primary-light no-underline hover:text-white transition-colors"
        >
          隐私政策
        </Link>{' '}
        |{' '}
        <Link
          href="/terms"
          className="text-primary-light no-underline hover:text-white transition-colors"
        >
          使用条款
        </Link>
      </p>
    </footer>
  );
};

export default Footer;
