'use client';

import { useEffect, useRef, useCallback } from 'react';

const MOBILE_BREAKPOINT = 768;
const MOBILE_BOTTOM_OFFSET = '80px';
const CLOSE_BTN_ID = 'ghl-chat-close-btn';
const REOPEN_BTN_ID = 'ghl-chat-reopen-btn';

const GHL_WIDGET_SELECTORS = [
  'iframe[src*="leadconnectorhq"]',
  'iframe[src*="msgsndr"]',
  '.lc_text-widget-container',
  '[class*="chat-widget"]',
  '[id*="chat-widget"]',
].join(', ');

export function GHLChatWidget() {
  const widgetId = process.env.NEXT_PUBLIC_GHL_WIDGET_ID;
  const locationId = process.env.NEXT_PUBLIC_GHL_LOCATION_ID;
  const observerRef = useRef<MutationObserver | null>(null);
  const hiddenRef = useRef(false);

  const isMobile = useCallback(
    () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches,
    [],
  );

  const repositionWidgetElements = useCallback(() => {
    if (!isMobile()) return;

    document.querySelectorAll(GHL_WIDGET_SELECTORS).forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (!htmlEl.style) return;
      const current = htmlEl.style.bottom;
      if (current && current !== MOBILE_BOTTOM_OFFSET) {
        htmlEl.style.setProperty('bottom', MOBILE_BOTTOM_OFFSET, 'important');
      }
    });
  }, [isMobile]);

  const hideWidget = useCallback(() => {
    hiddenRef.current = true;
    document.querySelectorAll(GHL_WIDGET_SELECTORS).forEach((el) => {
      (el as HTMLElement).style.setProperty('display', 'none', 'important');
    });
    const closeBtn = document.getElementById(CLOSE_BTN_ID);
    if (closeBtn) closeBtn.style.display = 'none';

    showReopenButton();
  }, []);

  const showWidget = useCallback(() => {
    hiddenRef.current = false;
    document.querySelectorAll(GHL_WIDGET_SELECTORS).forEach((el) => {
      (el as HTMLElement).style.removeProperty('display');
    });
    const reopenBtn = document.getElementById(REOPEN_BTN_ID);
    if (reopenBtn) reopenBtn.style.display = 'none';

    repositionWidgetElements();
    ensureCloseButton();
  }, [repositionWidgetElements]);

  const ensureCloseButton = useCallback(() => {
    if (!isMobile() || document.getElementById(CLOSE_BTN_ID)) return;

    const btn = document.createElement('button');
    btn.id = CLOSE_BTN_ID;
    btn.setAttribute('aria-label', 'Close chat widget');
    Object.assign(btn.style, {
      position: 'fixed',
      bottom: `calc(${MOBILE_BOTTOM_OFFSET} + 48px)`,
      right: '8px',
      zIndex: '2147483647',
      width: '24px',
      height: '24px',
      borderRadius: '50%',
      border: 'none',
      background: 'rgba(0,0,0,0.6)',
      color: '#fff',
      fontSize: '14px',
      lineHeight: '1',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    });
    btn.textContent = '✕';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      hideWidget();
    });
    document.body.appendChild(btn);
  }, [isMobile, hideWidget]);

  const showReopenButton = useCallback(() => {
    if (document.getElementById(REOPEN_BTN_ID)) {
      document.getElementById(REOPEN_BTN_ID)!.style.display = 'flex';
      return;
    }

    const btn = document.createElement('button');
    btn.id = REOPEN_BTN_ID;
    btn.setAttribute('aria-label', 'Open chat');
    Object.assign(btn.style, {
      position: 'fixed',
      bottom: MOBILE_BOTTOM_OFFSET,
      right: '12px',
      zIndex: '2147483647',
      width: '44px',
      height: '44px',
      borderRadius: '50%',
      border: 'none',
      background: '#6366f1',
      color: '#fff',
      fontSize: '20px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
    });
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showWidget();
    });
    document.body.appendChild(btn);
  }, [showWidget]);

  useEffect(() => {
    if (!widgetId) return;

    if (!document.querySelector('[data-chat-widget]') && !document.getElementById('ghl-chat-widget-script')) {
      const widgetContainer = document.createElement('div');
      widgetContainer.setAttribute('data-chat-widget', '');
      widgetContainer.setAttribute('data-widget-id', widgetId);
      if (locationId) {
        widgetContainer.setAttribute('data-location-id', locationId);
      }
      document.body.appendChild(widgetContainer);

      const script = document.createElement('script');
      script.id = 'ghl-chat-widget-script';
      script.src = 'https://widgets.leadconnectorhq.com/loader.js';
      script.setAttribute('data-resources-url', 'https://widgets.leadconnectorhq.com/chat-widget/loader.js');
      script.setAttribute('data-widget-id', widgetId);
      script.async = true;
      document.body.appendChild(script);
    }

    // Watch for GHL injecting elements and reposition them on mobile
    observerRef.current = new MutationObserver(() => {
      if (hiddenRef.current) return;
      repositionWidgetElements();
      if (isMobile()) {
        ensureCloseButton();
      }
    });

    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    });

    // Also reposition on resize
    const onResize = () => {
      if (!isMobile()) {
        const closeBtn = document.getElementById(CLOSE_BTN_ID);
        if (closeBtn) closeBtn.style.display = 'none';
        const reopenBtn = document.getElementById(REOPEN_BTN_ID);
        if (reopenBtn) reopenBtn.style.display = 'none';

        if (hiddenRef.current) {
          hiddenRef.current = false;
          document.querySelectorAll(GHL_WIDGET_SELECTORS).forEach((el) => {
            (el as HTMLElement).style.removeProperty('display');
            (el as HTMLElement).style.removeProperty('bottom');
          });
        }
      } else {
        if (!hiddenRef.current) {
          repositionWidgetElements();
          ensureCloseButton();
        }
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      observerRef.current?.disconnect();
      window.removeEventListener('resize', onResize);
      document.getElementById(CLOSE_BTN_ID)?.remove();
      document.getElementById(REOPEN_BTN_ID)?.remove();
    };
  }, [widgetId, locationId, isMobile, repositionWidgetElements, ensureCloseButton]);

  return null;
}

