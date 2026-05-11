/**
 * Footer 配置文件 - 统一管理版权声明和通用页脚内容
 * 所有页脚都从这里读取版权信息，确保全站一致
 */

export const FOOTER_CONFIG = {
  // 主版权
  copyright: '© 2026 QCNOTE. 用心记录每一刻。',
  
  // 核心库声明（与 Footer.tsx 保持同步）
  techStack: [
    { name: 'React', url: 'https://react.dev/', license: 'MIT License' },
    { name: 'Next.js', url: 'https://nextjs.org/', license: 'MIT License' },
    { name: 'Lunr.js', url: 'https://lunrjs.com/', license: 'MIT License' },
  ],
  
  // 可视化与 Markdown 库
  visualization: [
    { name: 'Pixi.js', url: 'https://pixijs.com/', license: 'MIT License' },
    { name: 'pixi-live2d-display', url: 'https://github.com/guansss/pixi-live2d-display', license: 'MIT License' },
    { name: 'react-markdown', url: 'https://github.com/remarkjs/react-markdown', license: 'MIT License' },
  ],
  
  // 其他依赖
  other: [
    { name: 'remark-gfm', url: 'https://github.com/remarkjs/remark-gfm', license: 'MIT License' },
    { name: '@dnd-kit/core', url: 'https://github.com/clauderic/dnd-kit', license: 'MIT License' },
  ],
  
  // Live2D 特殊声明
  live2d: {
    name: 'Live2D 看板娘',
    url: 'https://github.com/fghrsh/live2d_demo',
    license: 'GPL-2.0',
    description: '可爱的看板娘形象，纯展示性互动，不会访问或分析笔记内容。',
  },
  
  // 政策链接
  policies: [
    { name: '隐私政策', url: '/privacy' },
    { name: '使用条款', url: '/terms' },
  ],
  
  // ICP 备案号
  icp: {
    number: '萌ICP备20260133号',
    url: 'https://icp.gov.moe/?keyword=20260133',
  },
};

/**
 * 页脚配置 - 定义不同页面的页脚布局
 * 每个页面可以有不同的「快速链接」和「关于」部分，但版权声明统一
 */
export const PAGE_FOOTER_CONFIG = {
  // 默认页脚配置（dashboard, privacy, terms 使用）
  default: {
    showAbout: true,
    showLinks: true,
    showContact: true,
    customSections: null, // 不加入额外自定义内容
  },
  
  // 首页页脚配置
  home: {
    showAbout: false,
    showLinks: false,
    showContact: false,
    customSections: null, // 使用简略格式
    layout: 'minimal', // 简要样式
  },
  
  // 联系页页脚配置
  contact: {
    showAbout: true,
    showLinks: true,
    showContact: true,
    customSections: null, // 使用完整格式
    layout: 'full', // 完整样式
  },
};

export type FooterConfigType = typeof FOOTER_CONFIG;
export type PageFooterConfigType = typeof PAGE_FOOTER_CONFIG;
