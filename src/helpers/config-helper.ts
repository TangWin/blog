import type { SiteConfig, ThemeOptions } from '@/typings/config';

const defaultConfig: Partial<SiteConfig> = {
  lang: 'zh-CN',
  theme: {
    mode: 'auto',
    enableUserChange: true,
  },
  readTime: false,
  lastModified: false,
};

export function defineSiteConfig(config: SiteConfig): SiteConfig {
  const mergedConfig: Partial<SiteConfig> = {};

  if (typeof config.theme === 'string') {
    mergedConfig.theme = {
      ...(defaultConfig.theme as ThemeOptions),
      mode: config.theme,
    };
  } else {
    mergedConfig.theme = {
      ...(defaultConfig.theme as ThemeOptions),
      ...config.theme,
    };
  }

  return Object.assign({}, defaultConfig, config, mergedConfig);
}
