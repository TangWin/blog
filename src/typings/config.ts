import type { SitemapOptions } from '@astrojs/sitemap';

export const languages = ['zh-CN', 'en-US'] as const;
export type LangType = (typeof languages)[number];

export const theme = ['auto', 'light', 'dark'] as const;
export type ThemeMode = (typeof theme)[number];
export interface ThemeOptions {
  mode: ThemeMode;
  enableUserChange?: boolean;
}

export interface SocialLink {
  icon: SocialLinkIcon;
  link: string;
  ariaLabel?: string;
}

type SocialLinkIcon =
  | 'dribbble'
  | 'facebook'
  | 'figma'
  | 'github'
  | 'instagram'
  | 'link'
  | 'mail'
  | 'notion'
  | 'rss'
  | 'threads'
  | 'x'
  | 'youtube'
  | { svg: string };

export interface SiteConfig {
  site: string;
  lang?: LangType;
  theme?: ThemeOptions;
  avatar?: string;
  sitemap?: SitemapOptions;
  title: string;
  description: string;
  readTime?: boolean;
  lastModified?: boolean;
  footer?: {
    copyright: string;
  };
  follow?: {
    feedId: string;
    userId: string;
  };
  socialLinks?: SocialLink[];
  contentWidth?: {
    type: 'narrow' | 'medium' | 'wide' | 'full';
  };
  giscus?: {
    repo: string;
    repoId: string;
    category: string;
    categoryId: string;
    mapping?: 'pathname' | 'url' | 'title' | 'og:title' | 'specific' | 'number';
    strict?: boolean;
    reactionsEnabled?: boolean;
    inputPosition?: 'top' | 'bottom';
    lang?: string;
  };
}
