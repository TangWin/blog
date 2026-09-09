import { defineSiteConfig } from './src/helpers/config-helper';

export default defineSiteConfig({
  lang: 'zh-CN',
  site: 'https://tangwin.github.io/blog',
  avatar: '/blog/avatar.png',
  title: 'Peter 的技术笔记',
  description: '个人技术笔记（Java / 后端 / Agent）',
  theme: {
    mode: 'light',
    enableUserChange: true,
  },
  lastModified: true,
  readTime: true,
  contentWidth: { type: 'medium' },
  footer: {
    copyright: '© 2026 TangWin / Peter',
  },
  socialLinks: [
    { icon: 'github', link: 'https://github.com/TangWin' },
  ],
});
