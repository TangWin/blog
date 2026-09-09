import siteConfig from '~@/site.config';
import type { ThemeMode } from '@/typings/config';

export function getFullTitle(title: string) {
  return `${title}${!!title && siteConfig.title ? ' | ' : ''}${siteConfig.title}`;
}

export function setThemeMode(mode: ThemeMode) {
  document.documentElement.className = mode;
  document.documentElement.dataset.theme = mode;
}
