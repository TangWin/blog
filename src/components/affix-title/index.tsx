import { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';

export interface AffixTitleProps {
  offsetTop?: number;
  title: string;
  homePath?: string;
}

const AffixTitle = (props: AffixTitleProps) => {
  const { title, offsetTop = 320, homePath = '/' } = props;
  const affixTitleRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const classes = classNames(
    'fixed left-0 right-0 top-0 w-full bg-slate1/80 backdrop-blur-lg transition-all duration-300 ease-in-out z-10 border-b border-transparent',
    isVisible
      ? 'translate-y-0 opacity-100 border-slate4'
      : '-translate-y-full opacity-0',
  );

  const handleScroll = () => {
    const scrollTop = document.documentElement.scrollTop;
    setIsVisible(scrollTop >= offsetTop);
  };

  useEffect(() => {
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div ref={affixTitleRef} className={classes}>
      <div className="mx-auto flex h-12 items-center justify-between px-6 max-w-180">
        <button
          onClick={() => (window.location.href = homePath)}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-slate11 transition-colors hover:bg-slate3 hover:text-slate12 active:scale-95"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-medium text-slate12 truncate max-w-[60%]">{title}</span>
        <div className="w-7" />
      </div>
    </div>
  );
};

export default AffixTitle;
