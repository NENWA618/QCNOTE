import '../styles/globals.css';
import { Inter } from 'next/font/google';
import Header from '../components/Header';
import Footer from '../components/Footer';
import ClientInitializer from '../components/ClientInitializer';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata = {
  title: 'NOTE',
  description: '一个简洁而优雅的个人笔记应用',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body className={inter.className}>
        <ClientInitializer>
          <Header />
          {children}
          <Footer />
        </ClientInitializer>
      </body>
    </html>
  );
}
