'use client';

import { useEffect, useRef, useState } from 'react';

export function SidebarScrollShadow() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const content = el.closest('[data-sidebar="sidebar"]')?.querySelector('[data-sidebar="content"]');
    if (!content) return;

    const check = () => {
      const scrollable = content.scrollHeight > content.clientHeight;
      const atBottom = content.scrollHeight - content.scrollTop - content.clientHeight < 2;
      setVisible(scrollable && !atBottom);
    };

    check();
    content.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(content);

    return () => {
      content.removeEventListener('scroll', check);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={ref} aria-hidden="true"
      className={`pointer-events-none absolute left-0 right-0 -top-10 h-10 bg-gradient-to-t from-black/20 dark:from-white/15 to-transparent transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
    />
  );
}
