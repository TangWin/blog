import { useEffect, useRef, useState, useCallback } from 'react';
import '@pagefind/default-ui/npm_dist/mjs/ui-core.css';
import './index.css';

interface SearchProps {
  className?: string;
}

const Search = ({ className }: SearchProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  const openSearch = useCallback(() => {
    dialogRef.current?.showModal();
    if (!loaded) {
      import('@pagefind/default-ui').then(({ PagefindUI }) => {
        if (containerRef.current && !containerRef.current.hasChildNodes()) {
          new PagefindUI({
            element: containerRef.current,
            bundlePath: '/pagefind/',
            showSubResults: true,
            showImages: false,
          });
        }
        setLoaded(true);
      });
    }
    setTimeout(() => {
      const input = containerRef.current?.querySelector<HTMLInputElement>('.pagefind-ui__search-input');
      input?.focus();
    }, 100);
  }, [loaded]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
      }
      if (e.key === 'Escape') {
        dialogRef.current?.close();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [openSearch]);

  return (
    <div className={className}>
      <button
        onClick={openSearch}
        className="search-trigger"
        aria-label="Search"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span className="search-shortcut">
          <kbd>⌘</kbd><kbd>K</kbd>
        </span>
      </button>

      <dialog ref={dialogRef} className="search-dialog" onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current.close();
      }}>
        <div className="search-dialog-content">
          <div ref={containerRef} />
        </div>
      </dialog>
    </div>
  );
};

export default Search;
