import { useEffect, useRef, useState } from 'react';

export interface GiscusConfig {
  repo: string;
  repoId: string;
  category: string;
  categoryId: string;
  mapping?: 'pathname' | 'url' | 'title' | 'og:title' | 'specific' | 'number';
  strict?: boolean;
  reactionsEnabled?: boolean;
  emitMetadata?: boolean;
  inputPosition?: 'top' | 'bottom';
  lang?: string;
  loading?: 'lazy' | 'eager';
}

interface GiscusProps {
  config: GiscusConfig;
  theme?: 'light' | 'dark' | 'auto';
}

export default function Giscus({ config, theme = 'auto' }: GiscusProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !containerRef.current) return;

    const container = containerRef.current;
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    let giscusTheme: string = theme;
    if (theme === 'auto') {
      const isDark =
        document.documentElement.classList.contains('dark') ||
        document.documentElement.getAttribute('data-theme') === 'dark';
      giscusTheme = isDark ? 'dark' : 'light';
    }

    const script = document.createElement('script');
    script.src = 'https://giscus.app/client.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.className = 'giscus-script';

    script.setAttribute('data-repo', config.repo);
    script.setAttribute('data-repo-id', config.repoId);
    script.setAttribute('data-category', config.category);
    script.setAttribute('data-category-id', config.categoryId);
    script.setAttribute('data-mapping', config.mapping || 'pathname');
    script.setAttribute('data-strict', config.strict ? '1' : '0');
    script.setAttribute('data-reactions-enabled', config.reactionsEnabled !== false ? '1' : '0');
    script.setAttribute('data-emit-metadata', config.emitMetadata ? '1' : '0');
    script.setAttribute('data-input-position', config.inputPosition || 'bottom');
    script.setAttribute('data-theme', giscusTheme);
    script.setAttribute('data-lang', config.lang || 'zh-CN');
    script.setAttribute('data-loading', config.loading || 'lazy');

    container.appendChild(script);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class' || mutation.attributeName === 'data-theme') {
          const isDark =
            document.documentElement.classList.contains('dark') ||
            document.documentElement.getAttribute('data-theme') === 'dark';
          const newTheme = isDark ? 'dark' : 'light';

          const iframe = document.querySelector<HTMLIFrameElement>('iframe.giscus-frame');
          if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage(
              { giscus: { setConfig: { theme: newTheme } } },
              'https://giscus.app',
            );
          }
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });

    return () => {
      observer.disconnect();
    };
  }, [mounted, config, theme]);

  if (!mounted) {
    return <div className="giscus-container mt-12 pt-8 border-t border-slate6" />;
  }

  return <div ref={containerRef} className="giscus-container mt-12 pt-8 border-t border-slate6" />;
}
