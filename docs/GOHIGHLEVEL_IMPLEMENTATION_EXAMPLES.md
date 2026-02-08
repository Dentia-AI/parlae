# GoHighLevel Integration - Implementation Examples

This document provides practical examples for implementing GHL chat and calendar features in different scenarios.

## Table of Contents

1. [Chat Widget Examples](#chat-widget-examples)
2. [Calendar Examples](#calendar-examples)
3. [Advanced Use Cases](#advanced-use-cases)
4. [Testing Examples](#testing-examples)

---

## Chat Widget Examples

### Example 1: Global Chat (All Pages)

Add chat widget to every page by modifying the root layout:

**File**: `apps/frontend/apps/web/app/layout.tsx`

```tsx
import { GHLChatWidget } from '@kit/shared/gohighlevel';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ... existing setup code ...

  return (
    <html lang={language}>
      <body>
        <RootProviders theme={theme} lang={language} nonce={nonce} session={session}>
          {children}
        </RootProviders>

        <Toaster richColors={true} theme={theme} position="top-center" />
        
        {/* Global chat widget - appears on all pages */}
        <GHLChatWidget />
      </body>
    </html>
  );
}
```

### Example 2: Authenticated Users Only

Show chat only to logged-in users:

**File**: `apps/frontend/apps/web/components/authenticated-chat-widget.tsx`

```tsx
'use client';

import { useSession } from 'next-auth/react';
import { GHLChatWidget } from '@kit/shared/gohighlevel';

export function AuthenticatedChatWidget() {
  const { data: session, status } = useSession();
  
  // Don't show anything while loading
  if (status === 'loading') {
    return null;
  }
  
  // Only show chat to authenticated users
  if (!session) {
    return null;
  }
  
  return <GHLChatWidget />;
}
```

Then in your layout:

```tsx
import { AuthenticatedChatWidget } from '~/components/authenticated-chat-widget';

export default function Layout({ children }) {
  return (
    <>
      {children}
      <AuthenticatedChatWidget />
    </>
  );
}
```

### Example 3: Specific Routes Only

Add chat only to the user dashboard area:

**File**: `apps/frontend/apps/web/app/home/(user)/layout.tsx`

```tsx
import { GHLChatWidget } from '@kit/shared/gohighlevel';

function UserLayout({ children }: React.PropsWithChildren) {
  return (
    <>
      <Page>
        {/* ... navigation and other content ... */}
        {children}
      </Page>
      
      {/* Chat only on user dashboard pages */}
      <GHLChatWidget />
    </>
  );
}

export default withI18n(UserLayout);
```

### Example 4: Marketing Pages Only

Add chat widget to marketing pages to capture leads:

**File**: `apps/frontend/apps/web/app/(marketing)/layout.tsx`

```tsx
import { GHLChatWidget } from '@kit/shared/gohighlevel';

export default function MarketingLayout({ children }) {
  return (
    <>
      {/* ... header, navigation ... */}
      {children}
      {/* ... footer ... */}
      
      {/* Chat on all marketing pages for lead capture */}
      <GHLChatWidget />
    </>
  );
}
```

---

## Calendar Examples

### Example 5: Simple Booking Page

Basic booking page with one calendar:

**File**: `apps/frontend/apps/web/app/home/(user)/booking/page.tsx`

```tsx
import { GHLCalendarEmbed } from '@kit/shared/gohighlevel';
import { withI18n } from '~/lib/i18n/with-i18n';

function BookingPage() {
  const calendarId = process.env.NEXT_PUBLIC_GHL_CALENDAR_ID || '';

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Book an Appointment</h1>
      <p className="text-muted-foreground mb-6">
        Choose a time that works best for you
      </p>
      
      <GHLCalendarEmbed 
        calendarId={calendarId}
        height="700px"
        className="max-w-5xl mx-auto"
      />
    </div>
  );
}

export default withI18n(BookingPage);
```

### Example 6: Multiple Calendar Types

Different calendars for different services:

**File**: `apps/frontend/apps/web/app/home/(user)/booking/page.tsx`

```tsx
'use client';

import { useState } from 'react';
import { GHLCalendarEmbed } from '@kit/shared/gohighlevel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';

const CALENDAR_IDS = {
  sales: process.env.NEXT_PUBLIC_GHL_SALES_CALENDAR_ID || '',
  support: process.env.NEXT_PUBLIC_GHL_SUPPORT_CALENDAR_ID || '',
  demo: process.env.NEXT_PUBLIC_GHL_DEMO_CALENDAR_ID || '',
};

export default function MultiCalendarBookingPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Schedule a Meeting</h1>
      
      <Tabs defaultValue="sales" className="w-full">
        <TabsList className="grid w-full max-w-md mx-auto grid-cols-3">
          <TabsTrigger value="sales">Sales Call</TabsTrigger>
          <TabsTrigger value="support">Support</TabsTrigger>
          <TabsTrigger value="demo">Product Demo</TabsTrigger>
        </TabsList>
        
        <TabsContent value="sales" className="mt-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Sales Consultation</h2>
            <p className="text-muted-foreground">
              Discuss your needs with our sales team
            </p>
          </div>
          <GHLCalendarEmbed 
            calendarId={CALENDAR_IDS.sales}
            height="700px"
          />
        </TabsContent>
        
        <TabsContent value="support" className="mt-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Technical Support</h2>
            <p className="text-muted-foreground">
              Get help from our support team
            </p>
          </div>
          <GHLCalendarEmbed 
            calendarId={CALENDAR_IDS.support}
            height="700px"
          />
        </TabsContent>
        
        <TabsContent value="demo" className="mt-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Product Demonstration</h2>
            <p className="text-muted-foreground">
              See our product in action
            </p>
          </div>
          <GHLCalendarEmbed 
            calendarId={CALENDAR_IDS.demo}
            height="700px"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

### Example 7: Calendar in Modal Dialog

Show calendar in a popup dialog:

**File**: `apps/frontend/apps/web/components/booking-dialog-button.tsx`

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@kit/ui/button';
import { GHLCalendarDialog } from '@kit/shared/gohighlevel';
import { Calendar } from 'lucide-react';

export function BookingDialogButton() {
  const [open, setOpen] = useState(false);
  
  return (
    <>
      <Button 
        onClick={() => setOpen(true)}
        className="gap-2"
      >
        <Calendar className="h-4 w-4" />
        Schedule a Meeting
      </Button>
      
      <GHLCalendarDialog 
        open={open}
        onClose={() => setOpen(false)}
        calendarId={process.env.NEXT_PUBLIC_GHL_CALENDAR_ID || ''}
        title="Book Your Consultation"
        height="650px"
      />
    </>
  );
}
```

Use it in any page:

```tsx
import { BookingDialogButton } from '~/components/booking-dialog-button';

export default function HomePage() {
  return (
    <div>
      <h1>Welcome to Dentia</h1>
      <BookingDialogButton />
    </div>
  );
}
```

### Example 8: Pre-filled Calendar Form

Automatically fill user information in the booking form:

**File**: `apps/frontend/apps/web/app/home/(user)/booking/page.tsx`

```tsx
'use client';

import { use } from 'react';
import { GHLCalendarEmbed } from '@kit/shared/gohighlevel';
import { useUserWorkspace } from '@kit/accounts/hooks/use-user-workspace';

export default function PersonalizedBookingPage() {
  const { user } = useUserWorkspace();
  
  // Build URL with pre-filled data
  const baseCalendarId = process.env.NEXT_PUBLIC_GHL_CALENDAR_ID || '';
  const calendarUrl = `https://api.leadconnectorhq.com/widget/bookings/${baseCalendarId}?name=${encodeURIComponent(user.displayName || '')}&email=${encodeURIComponent(user.email || '')}`;
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Book Your Appointment</h1>
      <p className="text-muted-foreground mb-6">
        Hi {user.displayName}, select your preferred time slot
      </p>
      
      <GHLCalendarEmbed 
        calendarId={calendarUrl}
        height="700px"
      />
    </div>
  );
}
```

---

## Advanced Use Cases

### Example 9: Conditional Chat Based on Subscription

Show different chat options for free vs paid users:

**File**: `apps/frontend/apps/web/components/tiered-chat-widget.tsx`

```tsx
'use client';

import { useUserWorkspace } from '@kit/accounts/hooks/use-user-workspace';
import { GHLChatWidget } from '@kit/shared/gohighlevel';

export function TieredChatWidget() {
  const { subscription } = useUserWorkspace();
  
  // Free users: Show chat only during business hours
  // Paid users: 24/7 chat access
  
  const isPaidUser = subscription?.status === 'active';
  const isBusinessHours = checkBusinessHours(); // implement this
  
  if (isPaidUser || isBusinessHours) {
    return <GHLChatWidget />;
  }
  
  return (
    <div className="fixed bottom-4 right-4 p-4 bg-muted rounded-lg max-w-sm">
      <p className="text-sm">
        Chat support is available during business hours (9am-5pm EST).
        Upgrade to Premium for 24/7 support!
      </p>
    </div>
  );
}

function checkBusinessHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  
  // Monday-Friday, 9am-5pm
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
}
```

### Example 10: Calendar with Tracking

Track booking events for analytics:

**File**: `apps/frontend/apps/web/app/home/(user)/booking/page.tsx`

```tsx
'use client';

import { useEffect } from 'react';
import { GHLCalendarEmbed } from '@kit/shared/gohighlevel';
import { toast } from '@kit/ui/sonner';

export default function TrackedBookingPage() {
  useEffect(() => {
    // Listen for booking completion from the iframe
    const handleMessage = (event: MessageEvent) => {
      // Check if message is from GHL
      if (event.origin.includes('leadconnectorhq.com')) {
        if (event.data.type === 'booking-completed') {
          // Show success message
          toast.success('Booking confirmed! Check your email for details.');
          
          // Track in analytics (example with Google Analytics)
          if (window.gtag) {
            window.gtag('event', 'booking_completed', {
              calendar_id: event.data.calendarId,
              booking_id: event.data.bookingId,
            });
          }
          
          // You could also:
          // - Redirect to a thank you page
          // - Update user's booking status in your database
          // - Send a webhook to your backend
        }
      }
    };
    
    window.addEventListener('message', handleMessage);
    
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Book an Appointment</h1>
      
      <GHLCalendarEmbed 
        calendarId={process.env.NEXT_PUBLIC_GHL_CALENDAR_ID || ''}
        height="700px"
      />
    </div>
  );
}
```

### Example 11: Booking with Custom Loading

Custom loading state for better UX:

**File**: `apps/frontend/apps/web/components/custom-calendar-loading.tsx`

```tsx
import { Skeleton } from '@kit/ui/skeleton';

export function CustomCalendarLoading() {
  return (
    <div className="space-y-4 p-6 border rounded-lg">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
      
      <div className="space-y-2 mt-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
```

Use it:

```tsx
import { GHLCalendarEmbed } from '@kit/shared/gohighlevel';
import { CustomCalendarLoading } from '~/components/custom-calendar-loading';

export default function BookingPage() {
  return (
    <GHLCalendarEmbed 
      calendarId="your-calendar-id"
      loadingComponent={<CustomCalendarLoading />}
    />
  );
}
```

### Example 12: Inline Booking in Dashboard

Embed a mini calendar widget in the user dashboard:

**File**: `apps/frontend/apps/web/app/home/(user)/page.tsx`

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { GHLCalendarEmbed } from '@kit/shared/gohighlevel';
import { Calendar } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Other dashboard cards */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Quick Booking
            </CardTitle>
            <CardDescription>
              Schedule your next consultation
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Compact calendar */}
            <GHLCalendarEmbed 
              calendarId={process.env.NEXT_PUBLIC_GHL_CALENDAR_ID || ''}
              height="400px"
            />
          </CardContent>
        </Card>
        
        <div className="lg:col-span-2">
          {/* Other dashboard content */}
        </div>
      </div>
    </div>
  );
}
```

---

## Testing Examples

### Example 13: Testing Chat Widget

Create a test page to verify chat functionality:

**File**: `apps/frontend/apps/web/app/test/chat/page.tsx`

```tsx
'use client';

import { useState } from 'react';
import { GHLChatWidget } from '@kit/shared/gohighlevel';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';

export default function ChatTestPage() {
  const [widgetEnabled, setWidgetEnabled] = useState(true);
  
  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Chat Widget Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Widget ID: {process.env.NEXT_PUBLIC_GHL_WIDGET_ID || 'Not set'}
            </p>
            <p className="text-sm text-muted-foreground">
              Status: {widgetEnabled ? 'Enabled' : 'Disabled'}
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={() => setWidgetEnabled(true)}>
              Enable Chat
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setWidgetEnabled(false)}
            >
              Disable Chat
            </Button>
          </div>
          
          <div className="p-4 bg-muted rounded-lg">
            <h3 className="font-semibold mb-2">Test Checklist:</h3>
            <ul className="space-y-1 text-sm">
              <li>✓ Widget appears in bottom corner</li>
              <li>✓ Click opens chat interface</li>
              <li>✓ Can send messages</li>
              <li>✓ Messages appear in GHL dashboard</li>
              <li>✓ Styling matches your brand</li>
            </ul>
          </div>
        </CardContent>
      </Card>
      
      {widgetEnabled && <GHLChatWidget />}
    </div>
  );
}
```

### Example 14: Calendar Test Page

Test different calendar configurations:

**File**: `apps/frontend/apps/web/app/test/calendar/page.tsx`

```tsx
'use client';

import { useState } from 'react';
import { GHLCalendarEmbed } from '@kit/shared/gohighlevel';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Label } from '@kit/ui/label';
import { Input } from '@kit/ui/input';
import { Button } from '@kit/ui/button';

export default function CalendarTestPage() {
  const [calendarId, setCalendarId] = useState(
    process.env.NEXT_PUBLIC_GHL_CALENDAR_ID || ''
  );
  const [height, setHeight] = useState('700px');
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Calendar Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="calendar-id">Calendar ID</Label>
              <Input
                id="calendar-id"
                value={calendarId}
                onChange={(e) => setCalendarId(e.target.value)}
                placeholder="Enter calendar ID"
              />
            </div>
            
            <div>
              <Label htmlFor="height">Height</Label>
              <Input
                id="height"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="e.g., 700px"
              />
            </div>
            
            <Button 
              onClick={() => {
                console.log('Calendar Config:', { calendarId, height });
              }}
              className="w-full"
            >
              Test Calendar
            </Button>
            
            <div className="p-4 bg-muted rounded-lg text-sm">
              <h3 className="font-semibold mb-2">Test Checklist:</h3>
              <ul className="space-y-1">
                <li>✓ Calendar loads correctly</li>
                <li>✓ Dates are displayed</li>
                <li>✓ Time slots are available</li>
                <li>✓ Can select a time</li>
                <li>✓ Form collects data</li>
                <li>✓ Booking completes successfully</li>
              </ul>
            </div>
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Calendar Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {calendarId ? (
              <GHLCalendarEmbed 
                calendarId={calendarId}
                height={height}
              />
            ) : (
              <div className="flex items-center justify-center h-96 border rounded-lg bg-muted">
                <p className="text-muted-foreground">
                  Enter a calendar ID to preview
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

---

## Summary

These examples cover:

- ✅ Different chat widget placements
- ✅ Multiple calendar configurations  
- ✅ User personalization
- ✅ Analytics tracking
- ✅ Custom loading states
- ✅ Modal/dialog implementations
- ✅ Testing pages

Choose the patterns that fit your use case and customize as needed!

