import React from 'react';
import Header from './Header';
import Footer from './Footer';

interface LayoutProps {
  children: React.ReactNode;
  footerLayout?: 'full' | 'minimal' | 'compact';
  className?: string;
}

const Layout: React.FC<LayoutProps> = ({ children, footerLayout = 'full', className = '' }) => {
  return (
    <div className="app-shell">
      <Header />
      <main className={`page-container ${className}`.trim()}>{children}</main>
      <Footer layout={footerLayout} />
    </div>
  );
};

export default Layout;
