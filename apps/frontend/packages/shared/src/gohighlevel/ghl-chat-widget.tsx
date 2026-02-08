'use client';

import { useEffect } from 'react';

/**
 * GoHighLevel Chat Widget Component
 * 
 * This component loads the GHL live chat widget script and initializes it on the page.
 * The widget appears as a floating chat button and allows users to chat with your team.
 * 
 * @example
 * ```tsx
 * import { GHLChatWidget } from '@kit/shared/gohighlevel';
 * 
 * export function Layout({ children }) {
 *   return (
 *     <>
 *       {children}
 *       <GHLChatWidget />
 *     </>
 *   );
 * }
 * ```
 */
export function GHLChatWidget() {
  const widgetId = process.env.NEXT_PUBLIC_GHL_WIDGET_ID;
  const locationId = process.env.NEXT_PUBLIC_GHL_LOCATION_ID;

  useEffect(() => {
    // Only load if widget ID is configured
    if (!widgetId) {
      console.warn('[GHL Chat] Widget ID not configured - chat widget disabled');
      return;
    }

    // Check if widget container already exists
    const existingContainer = document.querySelector('[data-chat-widget]');
    if (existingContainer) {
      console.log('[GHL Chat] Widget container already exists');
      return;
    }

    // Check if script already exists
    const existingScript = document.getElementById('ghl-chat-widget-script');
    if (existingScript) {
      console.log('[GHL Chat] Widget script already loaded');
      return;
    }

    // Create the chat widget container div
    const widgetContainer = document.createElement('div');
    widgetContainer.setAttribute('data-chat-widget', '');
    widgetContainer.setAttribute('data-widget-id', widgetId);
    
    if (locationId) {
      widgetContainer.setAttribute('data-location-id', locationId);
    }
    
    document.body.appendChild(widgetContainer);

    // Create and load the chat widget script
    const script = document.createElement('script');
    script.id = 'ghl-chat-widget-script';
    script.src = 'https://widgets.leadconnectorhq.com/loader.js';
    script.setAttribute('data-resources-url', 'https://widgets.leadconnectorhq.com/chat-widget/loader.js');
    script.setAttribute('data-widget-id', widgetId);
    script.async = true;

    // Handle load success
    script.onload = () => {
      console.log(JSON.stringify({
        message: '[GHL Chat] Widget loaded successfully',
        widgetId,
        locationId: locationId || 'not set',
      }));
    };

    // Handle load error
    script.onerror = () => {
      console.error('[GHL Chat] Failed to load chat widget script');
    };

    document.body.appendChild(script);

    // Cleanup function
    return () => {
      // Remove widget container
      const containerToRemove = document.querySelector('[data-chat-widget]');
      if (containerToRemove) {
        document.body.removeChild(containerToRemove);
      }
      
      // Remove script
      const scriptToRemove = document.getElementById('ghl-chat-widget-script');
      if (scriptToRemove) {
        document.body.removeChild(scriptToRemove);
      }
    };
  }, [widgetId, locationId]);

  // This component doesn't render anything visible - the widget is injected by the script
  return null;
}

