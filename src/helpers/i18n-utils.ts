import { getCollection } from 'astro:content';

export type SupportedLang = 'en' | 'zh';

function basePrefix(): string {
  return (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
}

function withBase(path: string): string {
  const base = basePrefix();
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (!base) return clean === '/' ? '/' : clean;
  if (clean === '/') return `${base}/`;
  return `${base}${clean}`;
}

function stripBase(pathname: string): string {
  const base = basePrefix();
  if (base && (pathname === base || pathname.startsWith(base + '/'))) {
    const stripped = pathname.slice(base.length);
    return stripped ? stripped : '/';
  }
  return pathname;
}

export function getLangFromUrl(url: URL): SupportedLang {
  const segment = stripBase(url.pathname).split('/').filter(Boolean)[0];
  if (segment === 'zh') return 'zh';
  return 'en';
}

export function getCollectionName(lang: SupportedLang): 'post-en' | 'post-zh' {
  return lang === 'zh' ? 'post-zh' : 'post-en';
}

export function localePath(path: string, lang: SupportedLang): string {
  let cleanPath = path.startsWith('/') ? path : `/${path}`;
  // avoid GitHub Pages 301 (history pollution) for directory URLs
  const last = cleanPath.split('/').pop() || '';
  if (cleanPath !== '/' && !cleanPath.endsWith('/') && !(/^[^.]+\.[a-z0-9]+$/i.test(last))) {
    cleanPath += '/';
  }
  if (lang === 'en') return withBase(cleanPath);
  if (cleanPath === '/') return withBase('/zh/');
  return withBase(`/zh${cleanPath}`);
}

export function switchLangPath(currentPath: string, targetLang: SupportedLang): string {
  let cleanPath = stripBase(currentPath);
  if (cleanPath.startsWith('/zh/')) {
    cleanPath = cleanPath.slice(3);
  } else if (cleanPath === '/zh') {
    cleanPath = '/';
  }
  return localePath(cleanPath, targetLang);
}

export async function getPosts(lang: SupportedLang) {
  const collectionName = getCollectionName(lang);
  const posts = await getCollection(collectionName, ({ data }: { data: { draft?: boolean } }) => {
    return import.meta.env.DEV || data.draft !== true;
  });
  return posts.sort((a: { data: { pubDate?: Date } }, b: { data: { pubDate?: Date } }) =>
    (b.data.pubDate?.getTime() ?? 0) - (a.data.pubDate?.getTime() ?? 0)
  );
}

export function getHtmlLang(lang: SupportedLang): string {
  return lang === 'zh' ? 'zh-CN' : 'en';
}
