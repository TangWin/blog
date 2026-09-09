import { getCollection } from 'astro:content';

export type SupportedLang = 'en' | 'zh';

export function getLangFromUrl(url: URL): SupportedLang {
  const [, lang] = url.pathname.split('/');
  if (lang === 'zh') return 'zh';
  return 'en';
}

export function getCollectionName(lang: SupportedLang): 'post-en' | 'post-zh' {
  return lang === 'zh' ? 'post-zh' : 'post-en';
}

export function localePath(path: string, lang: SupportedLang): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (lang === 'en') return cleanPath;
  return `/zh${cleanPath}`;
}

export function switchLangPath(currentPath: string, targetLang: SupportedLang): string {
  let cleanPath = currentPath;
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
