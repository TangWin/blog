import React, { useState, useCallback, useEffect, useRef } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/thumbnails.css';

interface ImageLightboxProps {
  children: React.ReactNode;
}

const ImageLightbox: React.FC<ImageLightboxProps> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [slides, setSlides] = useState<Array<{ src: string; alt?: string }>>([]);
  const copyHandlersRef = useRef<Map<HTMLButtonElement, (e: Event) => void>>(new Map());

  const collectImages = useCallback(() => {
    const images: Array<{ src: string; alt?: string }> = [];
    document.querySelectorAll('.blog-content img').forEach((img) => {
      const src = img.getAttribute('src');
      const alt = img.getAttribute('alt') || '';
      if (src) images.push({ src, alt });
    });
    return images;
  }, []);

  useEffect(() => {
    const images = document.querySelectorAll('.blog-content img');

    const handleClick = (event: Event) => {
      const target = event.target as HTMLImageElement;
      const allImages = collectImages();
      const currentIndex = allImages.findIndex((img) => img.src === target.src);
      if (currentIndex !== -1) {
        setSlides(allImages);
        setIndex(currentIndex);
        setOpen(true);
      }
    };

    images.forEach((img) => {
      (img as HTMLImageElement).style.cursor = 'pointer';
      img.addEventListener('click', handleClick);
    });

    return () => {
      images.forEach((img) => img.removeEventListener('click', handleClick));
    };
  }, [collectImages]);

  useEffect(() => {
    const fallbackCopy = (text: string): boolean => {
      const pre = document.createElement('pre');
      Object.assign(pre.style, {
        opacity: '0',
        pointerEvents: 'none',
        position: 'absolute',
        overflow: 'hidden',
        left: '0',
        top: '0',
        width: '20px',
        height: '20px',
        webkitUserSelect: 'auto',
        userSelect: 'all',
      });
      pre.ariaHidden = 'true';
      pre.textContent = text;
      document.body.appendChild(pre);

      const range = document.createRange();
      range.selectNode(pre);
      const selection = getSelection();
      if (!selection) return false;

      selection.removeAllRanges();
      selection.addRange(range);

      let success = false;
      try {
        success = document.execCommand('copy');
      } finally {
        selection.removeAllRanges();
        document.body.removeChild(pre);
      }
      return success;
    };

    const handleCopyClick = async (event: Event) => {
      const button = event.currentTarget as HTMLButtonElement;
      const { code: rawCode, copied } = button.dataset;
      let success = false;
      const code = (rawCode || '').replace(/\u007f/g, '\n');

      try {
        await navigator.clipboard.writeText(code);
        success = true;
      } catch {
        success = fallbackCopy(code);
      }

      if (!success || button.parentNode?.querySelector('.feedback')) return;

      const feedback = document.createElement('div');
      feedback.classList.add('feedback');
      feedback.append(copied || 'Copied!');
      button.before(feedback);
      feedback.offsetWidth;
      requestAnimationFrame(() => feedback?.classList.add('show'));

      const hideFeedback = () => feedback?.classList.remove('show');
      const removeFeedback = () => {
        if (!feedback) return;
        if (parseFloat(getComputedStyle(feedback).opacity) > 0) return;
        feedback.remove();
      };

      setTimeout(hideFeedback, 1500);
      setTimeout(removeFeedback, 2500);
      button.addEventListener('blur', hideFeedback);
      feedback.addEventListener('transitioncancel', removeFeedback);
      feedback.addEventListener('transitionend', removeFeedback);
    };

    const copyButtons = document.querySelectorAll<HTMLButtonElement>(
      '.expressive-code .copy button',
    );
    copyButtons.forEach((button) => {
      if (!copyHandlersRef.current.has(button)) {
        const handler = (e: Event) => handleCopyClick(e);
        copyHandlersRef.current.set(button, handler);
        button.addEventListener('click', handler);
      }
    });

    return () => {
      copyHandlersRef.current.forEach((handler, button) => {
        button.removeEventListener('click', handler);
      });
      copyHandlersRef.current.clear();
    };
  }, []);

  return (
    <>
      {children}
      <Lightbox
        open={open}
        close={() => setOpen(false)}
        index={index}
        slides={slides}
        plugins={[Thumbnails]}
        on={{
          view: ({ index: currentIndex }) => setIndex(currentIndex),
        }}
        carousel={{ finite: true }}
        render={{
          buttonPrev: slides.length <= 1 ? () => null : undefined,
          buttonNext: slides.length <= 1 ? () => null : undefined,
        }}
        thumbnails={{
          position: 'bottom',
          width: 80,
          height: 80,
          border: 0,
          borderRadius: 4,
          padding: 4,
          gap: 8,
          showToggle: true,
        }}
      />
    </>
  );
};

export default ImageLightbox;
