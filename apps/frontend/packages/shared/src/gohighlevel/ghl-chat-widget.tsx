'use client';

import { useEffect, useRef } from 'react';

const MOBILE_BREAKPOINT = 768;
const BOTTOM_NAV_HEIGHT = 64;
const GAP = 12;
const CLOSE_BTN_ID = 'ghl-chat-close-btn';

function getWidgetEl(): HTMLElement | null {
  return document.querySelector('chat-widget');
}

function isMobile() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

export function GHLChatWidget() {
  const widgetId = process.env.NEXT_PUBLIC_GHL_WIDGET_ID;
  const locationId = process.env.NEXT_PUBLIC_GHL_LOCATION_ID;
  const observerRef = useRef<MutationObserver | null>(null);
  const hiddenRef = useRef(false);

  useEffect(() => {
    if (!widgetId) return;

    if (
      !document.querySelector('[data-chat-widget]') &&
      !document.getElementById('ghl-chat-widget-script')
    ) {
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
      script.setAttribute(
        'data-resources-url',
        'https://widgets.leadconnectorhq.com/chat-widget/loader.js',
      );
      script.setAttribute('data-widget-id', widgetId);
      script.async = true;
      document.body.appendChild(script);
    }

    function repositionWidget() {
      if (!isMobile() || hiddenRef.current) return;
      const widget = getWidgetEl();
      if (!widget) return;
      const offset = `${BOTTOM_NAV_HEIGHT + GAP}px`;
      widget.style.setProperty('bottom', offset, 'important');
    }

    function hideWidget() {
      hiddenRef.current = true;
      const widget = getWidgetEl();
      if (widget) {
        widget.style.setProperty('display', 'none', 'important');
      }
      document.getElementById(CLOSE_BTN_ID)?.remove();
    }

    function ensureCloseButton() {
      if (hiddenRef.current) return;
      if (!getWidgetEl()) return;

      const existing = document.getElementById(CLOSE_BTN_ID);
      if (existing) {
        // Update position for current viewport
        existing.style.bottom = isMobile() ? '90px' : '80px';
        return;
      }

      const btn = document.createElement('button');
      btn.id = CLOSE_BTN_ID;
      btn.setAttribute('aria-label', 'Dismiss chat');
      Object.assign(btn.style, {
        position: 'fixed',
        zIndex: '2147483647',
        bottom: isMobile() ? '90px' : '80px',
        right: '8px',
        width: '22px',
        height: '22px',
        borderRadius: '50%',
        border: 'none',
        background: 'rgba(0,0,0,0.7)',
        color: '#fff',
        fontSize: '13px',
        lineHeight: '1',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0',
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
      });
      btn.textContent = '✕';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideWidget();
      });
      document.body.appendChild(btn);
    }

    function onMutation() {
      if (hiddenRef.current) {
        const widget = getWidgetEl();
        if (widget) {
          widget.style.setProperty('display', 'none', 'important');
        }
        return;
      }
      if (isMobile()) {
        repositionWidget();
      }
      ensureCloseButton();
    }

    observerRef.current = new MutationObserver(onMutation);
    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    const onResize = () => {
      if (hiddenRef.current) return;
      if (isMobile()) {
        repositionWidget();
      }
      ensureCloseButton();
    };
    window.addEventListener('resize', onResize);

    // GHL script needs time to hydrate the <chat-widget> custom element
    const initTimer = setTimeout(() => {
      if (hiddenRef.current) return;
      if (isMobile()) {
        repositionWidget();
      }
      ensureCloseButton();
    }, 3000);

    return () => {
      observerRef.current?.disconnect();
      window.removeEventListener('resize', onResize);
      clearTimeout(initTimer);
      document.getElementById(CLOSE_BTN_ID)?.remove();
    };
  }, [widgetId, locationId]);

  return null;
}

