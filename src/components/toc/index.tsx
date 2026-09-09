import { useEffect, useState, useRef, useCallback } from 'react';
import type { MarkdownHeading } from 'astro';
import classNames from 'classnames';

interface TocProps {
  className?: string;
  listClassName?: string;
  dataSource?: MarkdownHeading[];
}

function Toc(props: TocProps) {
  const { dataSource = [], className, listClassName } = props;
  const [activeId, setActiveId] = useState<string>('');
  const observerRef = useRef<IntersectionObserver | null>(null);

  const headings = dataSource.filter((item) => item.depth > 1);

  const setupObserver = useCallback(() => {
    observerRef.current?.disconnect();

    const callback: IntersectionObserverCallback = (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length > 0) {
        setActiveId(visible[0].target.id);
      }
    };

    observerRef.current = new IntersectionObserver(callback, {
      rootMargin: '-80px 0px -60% 0px',
      threshold: 0,
    });

    headings.forEach((h) => {
      const el = document.getElementById(h.slug);
      if (el) observerRef.current!.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, [headings]);

  useEffect(() => {
    const cleanup = setupObserver();
    return cleanup;
  }, [setupObserver]);

  if (!headings.length) return null;

  return (
    <div className={className}>
      <nav
        className={classNames(
          'h-full w-full overflow-y-auto scrollbar-none',
          listClassName,
        )}
      >
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate9">
          On this page
        </p>
        <ul className="relative border-l border-slate4">
          {headings.map((item) => {
            const isActive = activeId === item.slug;
            const indent = (item.depth - 2) * 12;
            return (
              <li key={item.slug} className="relative">
                {isActive && (
                  <span className="absolute left-[-1px] top-0 h-full w-[2px] bg-slate12 transition-all" />
                )}
                <a
                  className={classNames(
                    'block py-1.5 pl-3 text-[13px] leading-snug transition-colors',
                    isActive
                      ? 'text-slate12 font-medium'
                      : 'text-slate9 hover:text-slate11',
                  )}
                  style={{ paddingLeft: `${12 + indent}px` }}
                  href={`#${item.slug}`}
                >
                  {item.text}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export default Toc;
