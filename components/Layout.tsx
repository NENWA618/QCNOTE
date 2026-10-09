import React from 'react';
import Header from './Header';
import Footer from './Footer';

interface LayoutProps {
  children: React.ReactNode;
  footerLayout?: 'full' | 'minimal' | 'compact';
  className?: string;
  /** 取消内容区的最大宽度与内边距，让子内容（如全屏 Hero）通栏显示 */
  fullBleed?: boolean;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  footerLayout = 'full',
  className = '',
  fullBleed = false,
}) => {
  return (
    <div className="app-shell">
      <Header />
      <main className={`${fullBleed ? '' : 'page-container'} ${className}`.trim()}>{children}</main>
      <Footer layout={footerLayout} />
    </div>
  );
};

export default Layout;
