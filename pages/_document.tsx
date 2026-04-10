import Document, { Html, Head, Main, NextScript } from 'next/document';
import Script from 'next/script';

class MyDocument extends Document {
  render() {
    return (
      <Html lang="zh-CN">
        <Head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta name="theme-color" content="#c8b8c8" />
          <link rel="icon" href="/images/icons/note_icon.png" />
          {/* Load Cubism 2 runtime for koharu Live2D model.
              add a version query parameter to bust client cache after
              each deployment; the value can be explicit via
              NEXT_PUBLIC_LIVE2D_VERSION or defaults to build timestamp. */}
          <Script
            src="/js/jquery.min.js"
            strategy="beforeInteractive"
            onError={(e) => console.error('jquery 加载失败', e)}
          />
          <Script
            src="/js/jquery-ui.min.js"
            strategy="beforeInteractive"
            onError={(e) => console.error('jquery-ui 加载失败', e)}
          />
          <Script
            src="/js/live2d.min.js"
            strategy="beforeInteractive"
            onError={(e) => console.error('live2d 加载失败', e)}
          />
          <Script
            src="/js/waifu-tips.js"
            strategy="beforeInteractive"
            onError={(e) => console.error('waifu-tips 加载失败', e)}
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
