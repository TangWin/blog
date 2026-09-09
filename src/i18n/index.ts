import i18next from 'i18next'
import zhCn from './lang/zh-cn';
import enUS from './lang/en-us'

await i18next.init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    'zh': {
      translation: zhCn
    },
    'en': {
      translation: enUS
    }
  }
})

export function setLang(lang: string) {
  i18next.changeLanguage(lang === 'zh' ? 'zh' : 'en');
}

export function getLang(): string {
  return i18next.language === 'zh' ? 'zh' : 'en';
}

export function t(key: string, options?: Record<string, unknown>): string {
  return i18next.t(key, options);
}

export function getCollectionName(lang: string): 'post-en' | 'post-zh' {
  return lang === 'zh' ? 'post-zh' : 'post-en';
}

export function localePath(path: string, lang: string): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const clean = path.startsWith('/') ? path : `/${path}`;
  const localized = lang === 'en' ? clean : (clean === '/' ? '/zh/' : `/zh${clean}`);
  if (!base) return localized;
  if (localized === '/') return `${base}/`;
  return `${base}${localized}`;
}

export default i18next;