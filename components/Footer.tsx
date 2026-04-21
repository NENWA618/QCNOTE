import React from 'react';
import Link from 'next/link';
import { FOOTER_CONFIG } from '../lib/footerConfig';

interface FooterProps {
  /**
   * 页脚布局类型
   * - 'full': 完整布局，包含关于、链接、版权等所有内容
   * - 'minimal': 最小布局，仅显示版权声明
   * - 'compact': 紧凑布局，显示版权和一些链接
   * @default 'full'
   */
  layout?: 'full' | 'minimal' | 'compact';

  /**
   * 是否显示「关于」部分
   * @default true
   */
  showAbout?: boolean;

  /**
   * 是否显示「快速链接」部分
   * @default true
   */
  showLinks?: boolean;

  /**
   * 是否显示「联系我们」部分
   * @default true
   */
  showContact?: boolean;

  /**
   * 自定义的链接部分
   * 如果提供，会覆盖默认的快速链接
   */
  customLinks?: Array<{ label: string; href: string }>;

  /**
   * 是否显示技术栈声明
   * @default true
   */
  showTechStack?: boolean;

  /**
   * 是否显示政策链接
   * @default true
   */
  showPolicies?: boolean;
}

/**
 * 可复用的 Footer 组件
 * 支持多种布局和定制选项
 * 所有版权声明统一来自 footerConfig.ts
 */
const Footer: React.FC<FooterProps> = ({
  layout = 'full',
  showAbout = true,
  showLinks = true,
  showContact = true,
  customLinks,
  showTechStack = true,
  showPolicies = true,
}) => {
  // 如果是 minimal 模式，跳过所有可选内容
  if (layout === 'minimal') {
    return (
      <footer role="contentinfo" aria-label="Site footer" className="bg-primary-dark text-white py-8 px-6">
        <div className="max-w-6xl mx-auto">
          <p className="text-center">{FOOTER_CONFIG.copyright}</p>
          <p className="text-center text-xs text-gray-400 mt-2">
            <a
              href={FOOTER_CONFIG.icp.url}
              className="text-primary-light no-underline hover:text-white transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              {FOOTER_CONFIG.icp.number}
            </a>
          </p>
        </div>
      </footer>
    );
  }

  // 渲染版权部分（所有模式都有）
  const renderCopyrightSection = () => (
    <>
      <p>{FOOTER_CONFIG.copyright}</p>
      
      {/* Live2D 特殊声明 */}
      <p className="text-xs mt-2 text-gray-400">
        看板娘基于{' '}
        <a
          href={FOOTER_CONFIG.live2d.url}
          className="text-primary-light underline hover:text-white transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
          {FOOTER_CONFIG.live2d.name}
        </a>
        开源项目（{FOOTER_CONFIG.live2d.license}），
        {FOOTER_CONFIG.live2d.description}
      </p>

      {/* 技术栈声明 */}
      {showTechStack && (
        <>
          <p className="text-xs text-gray-400">
            核心技术栈：
            {FOOTER_CONFIG.techStack.map((tech, idx) => (
              <React.Fragment key={tech.name}>
                {idx > 0 && ' · '}
                <a
                  href={tech.url}
                  className="text-primary-light underline hover:text-white transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {tech.name}
                </a>
              </React.Fragment>
            ))}
            （MIT License）
          </p>

          <p className="text-xs text-gray-400">
            可视化与 Markdown：
            {FOOTER_CONFIG.visualization.map((tech, idx) => (
              <React.Fragment key={tech.name}>
                {idx > 0 && ' · '}
                <a
                  href={tech.url}
                  className="text-primary-light underline hover:text-white transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {tech.name}
                </a>
              </React.Fragment>
            ))}
            （MIT License）
          </p>

          <p className="text-xs text-gray-400">
            其他依赖：
            {FOOTER_CONFIG.other.map((tech, idx) => (
              <React.Fragment key={tech.name}>
                {idx > 0 && ' · '}
                <a
                  href={tech.url}
                  className="text-primary-light underline hover:text-white transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {tech.name}
                </a>
              </React.Fragment>
            ))}
            ·{' '}
            <a
              href="https://github.com/NENWA618/NOTE/blob/main/package.json"
              className="text-primary-light underline hover:text-white transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              完整许可证
            </a>
          </p>
        </>
      )}

      {/* 政策链接和 ICP 备案号 */}
      {showPolicies && (
        <p className="mt-4 text-sm">
          {FOOTER_CONFIG.policies.map((policy, idx) => (
            <React.Fragment key={policy.url}>
              {idx > 0 && ' | '}
              <Link
                href={policy.url}
                className="text-primary-light no-underline hover:text-white transition-colors"
              >
                {policy.name}
              </Link>
            </React.Fragment>
          ))}
          {FOOTER_CONFIG.policies.length > 0 && ' | '}
          <a
            href={FOOTER_CONFIG.icp.url}
            className="text-primary-light no-underline hover:text-white transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            {FOOTER_CONFIG.icp.number}
          </a>
        </p>
      )}
    </>
  );

  // 完整模式或紧凑模式：三列结构
  if (layout === 'full' || layout === 'compact') {
    const defaultLinks = [
      { label: '← 返回首页', href: '/' },
      { label: '💰 支持我们', href: '/contact' },
    ];

    const links = customLinks || defaultLinks;

    return (
      <footer role="contentinfo" aria-label="Site footer" className="bg-primary-dark text-white py-12 px-6">
        <div className="max-w-6xl mx-auto">
          {/* 三列网格部分 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            {/* 关于部分 */}
            {showAbout && (
              <div>
                <h4 className="text-white mb-4">📝 关于 QCNOTE</h4>
                <p className="text-sm leading-relaxed">
                  QCNOTE 是一个简洁而优雅的个人笔记应用。完全本地存储，100% 隐私保护。
                </p>
              </div>
            )}

            {/* 快速链接部分 */}
            {showLinks && (
              <nav aria-label="Footer links">
                <h4 className="text-white mb-4">🔗 快速链接</h4>
                <p className="text-sm space-y-2">
                  {links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="text-primary-light no-underline block hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  ))}
                </p>
              </nav>
            )}

            {/* 联系我们部分 */}
            {showContact && (
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
            )}
          </div>

          <hr className="border-0 border-t border-white border-opacity-20 my-8" />

          {/* 版权和技术栈声明 */}
          {renderCopyrightSection()}
        </div>
      </footer>
    );
  }

  return null;
};

export default Footer;
