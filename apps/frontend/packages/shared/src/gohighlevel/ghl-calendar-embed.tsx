'use client';

import { useEffect, useRef, useState } from 'react';

export interface GHLCalendarEmbedProps {
  /**
   * The GoHighLevel calendar ID or full calendar URL
   * Can be either:
   * - Just the calendar ID: "abc123"
   * - Full URL: "https://api.leadconnectorhq.com/widget/bookings/abc123"
   */
  calendarId: string;
  
  /**
   * Height of the iframe (default: "600px")
   */
  height?: string;
  
  /**
   * Width of the iframe (default: "100%")
   */
  width?: string;
  
  /**
   * Additional CSS class names for styling
   */
  className?: string;
  
  /**
   * Loading component to show while iframe is loading
   */
  loadingComponent?: React.ReactNode;
}

/**
 * GoHighLevel Calendar Embed Component
 * 
 * This component embeds a GHL calendar booking widget as an iframe.
 * Users can view available time slots and book appointments directly.
 * 
 * @example
 * ```tsx
 * import { GHLCalendarEmbed } from '@kit/shared/gohighlevel';
 * 
 * export function BookingPage() {
 *   return (
 *     <div className="container mx-auto p-4">
 *       <h1>Book an Appointment</h1>
 *       <GHLCalendarEmbed 
 *         calendarId="your-calendar-id" 
 *         height="700px"
 *       />
 *     </div>
 *   );
 * }
 * ```
 */
export function GHLCalendarEmbed({
  calendarId,
  height = '600px',
  width = '100%',
  className = '',
  loadingComponent,
}: GHLCalendarEmbedProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Construct the calendar URL
  // GHL calendars use link.msgsndr.com for widget embeds (singular 'booking')
  const calendarUrl = calendarId.startsWith('http')
    ? calendarId
    : `https://link.msgsndr.com/widget/booking/${calendarId}`;

  useEffect(() => {
    if (!calendarId) {
      setError('Calendar ID not provided');
      setIsLoading(false);
      return;
    }

    // Reset state when calendarId changes
    setIsLoading(true);
    setError(null);
  }, [calendarId]);

  const handleIframeLoad = () => {
    setIsLoading(false);
    console.log('[GHL Calendar] Calendar loaded successfully');
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setError('Failed to load calendar. Please check your calendar ID.');
    console.error('[GHL Calendar] Failed to load calendar iframe');
  };

  if (!calendarId) {
    return (
      <div className={`flex items-center justify-center p-8 border border-red-300 rounded-lg bg-red-50 ${className}`}>
        <div className="text-center">
          <p className="text-red-700 font-medium">Calendar Configuration Error</p>
          <p className="text-red-600 text-sm mt-1">No calendar ID provided</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center p-8 border border-red-300 rounded-lg bg-red-50 ${className}`}>
        <div className="text-center">
          <p className="text-red-700 font-medium">Calendar Error</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} style={{ height, width }}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-lg">
          {loadingComponent || (
            <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
              <p className="mt-4 text-sm text-muted-foreground">Loading calendar...</p>
            </div>
          )}
        </div>
      )}
      
      <iframe
        ref={iframeRef}
        src={calendarUrl}
        title="GoHighLevel Calendar"
        width={width}
        height={height}
        frameBorder="0"
        allowFullScreen
        onLoad={handleIframeLoad}
        onError={handleIframeError}
        className="rounded-lg"
        style={{
          display: isLoading ? 'none' : 'block',
        }}
      />
    </div>
  );
}

/**
 * Simple wrapper for displaying calendar in a modal/dialog
 * 
 * @example
 * ```tsx
 * import { GHLCalendarDialog } from '@kit/shared/gohighlevel';
 * 
 * export function BookingButton() {
 *   const [open, setOpen] = useState(false);
 *   
 *   return (
 *     <>
 *       <Button onClick={() => setOpen(true)}>Book Appointment</Button>
 *       <GHLCalendarDialog 
 *         open={open}
 *         onClose={() => setOpen(false)}
 *         calendarId="your-calendar-id"
 *       />
 *     </>
 *   );
 * }
 * ```
 */
export interface GHLCalendarDialogProps extends GHLCalendarEmbedProps {
  open: boolean;
  onClose: () => void;
  title?: string;
}

export function GHLCalendarDialog({
  open,
  onClose,
  calendarId,
  title = 'Book an Appointment',
  ...embedProps
}: GHLCalendarDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-lg max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="p-4">
          <GHLCalendarEmbed
            calendarId={calendarId}
            height="600px"
            {...embedProps}
          />
        </div>
      </div>
    </div>
  );
}

