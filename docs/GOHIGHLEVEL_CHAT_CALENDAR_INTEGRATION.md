# GoHighLevel Live Chat & Calendar Integration

This document describes how to integrate GoHighLevel's live chat widget and calendar booking functionality into Dentia.

## Overview

The integration provides two main features:

1. **Live Chat Widget**: A floating chat button that allows users to communicate with your team in real-time
2. **Calendar Booking**: Embeddable calendar for users to book appointments with your team

## Prerequisites

- GoHighLevel account with active subscription
- Access to your GHL location settings
- API access enabled in your GHL account

---

## Part 1: GoHighLevel Setup

### 1. Live Chat Widget Setup

#### Step 1: Enable Chat Widget in GHL

1. Log in to your GoHighLevel account
2. Navigate to **Settings** → **Chat Widget** (or **Conversations Widget**)
3. Click **Enable Widget** for your location
4. Configure the widget settings:
   - **Widget Position**: Choose where the chat button appears (bottom-right, bottom-left, etc.)
   - **Primary Color**: Match your brand colors
   - **Welcome Message**: Set the initial greeting message
   - **Business Hours**: Configure when the chat is active
   - **Team Assignment**: Select which team members receive chat messages

#### Step 2: Get Widget ID

1. In the Chat Widget settings, find the **Installation** or **Embed Code** section
2. You'll see a script tag like this:

```html
<script 
  src="https://widgets.leadconnectorhq.com/loader.js" 
  data-resources-url="https://widgets.leadconnectorhq.com" 
  data-widget-id="YOUR_WIDGET_ID_HERE">
</script>
```

3. Copy the `YOUR_WIDGET_ID_HERE` value (it's usually a long alphanumeric string)

### 2. Calendar Setup

#### Step 1: Create a Calendar in GHL

1. Go to **Calendars** in your GHL dashboard
2. Click **+ New Calendar**
3. Configure your calendar:
   - **Calendar Name**: e.g., "Consultation Booking"
   - **Duration**: Set appointment length (15min, 30min, 1hr, etc.)
   - **Buffer Time**: Add time between appointments if needed
   - **Available Hours**: Set your availability
   - **Timezone**: Set your timezone
   - **Meeting Location**: Add location or video conference link

#### Step 2: Configure Calendar Settings

1. **Booking Form Fields**:
   - Go to **Calendar Settings** → **Form**
   - Add custom fields you want to collect (name, email, phone, etc.)
   - Set which fields are required

2. **Notifications**:
   - Configure email/SMS notifications for yourself and customers
   - Set reminder schedules (24hrs before, 1hr before, etc.)

3. **Confirmation Page**:
   - Customize the thank-you message after booking
   - Add any additional instructions

#### Step 3: Get Calendar ID

1. In your calendar list, click on the calendar you created
2. Look at the URL - it will contain your calendar ID:
   ```
   https://app.gohighlevel.com/location/YOUR_LOCATION_ID/calendars/YOUR_CALENDAR_ID
   ```
3. Or go to **Calendar Settings** → **Share** → **Embed Code**
4. You'll see an iframe URL like:
   ```html
   <iframe src="https://api.leadconnectorhq.com/widget/bookings/YOUR_CALENDAR_ID"></iframe>
   ```
5. Copy the `YOUR_CALENDAR_ID` value

---

## Part 2: Dentia Integration

### 1. Environment Variables Setup

Add the following environment variables to your configuration:

#### Local Development

Add to `apps/frontend/.env.local`:

```bash
# GoHighLevel Chat Widget
NEXT_PUBLIC_GHL_WIDGET_ID=your-widget-id-here

# GoHighLevel Calendar (if you want to use one default calendar)
NEXT_PUBLIC_GHL_CALENDAR_ID=your-calendar-id-here

# Existing GHL API credentials (already configured)
GHL_API_KEY=your-api-key
GHL_LOCATION_ID=your-location-id
```

#### Docker Compose

The `docker-compose.yml` already has GHL variables. Add the new ones:

```yaml
frontend:
  environment:
    # ... existing variables ...
    
    # GoHighLevel Integration
    GHL_API_KEY: ${GHL_API_KEY:-}
    GHL_LOCATION_ID: ${GHL_LOCATION_ID:-}
    
    # NEW: Add these
    NEXT_PUBLIC_GHL_WIDGET_ID: ${NEXT_PUBLIC_GHL_WIDGET_ID:-}
    NEXT_PUBLIC_GHL_CALENDAR_ID: ${NEXT_PUBLIC_GHL_CALENDAR_ID:-}
```

Then set them in your shell:

```bash
export NEXT_PUBLIC_GHL_WIDGET_ID=your-widget-id
export NEXT_PUBLIC_GHL_CALENDAR_ID=your-calendar-id
```

#### Production (AWS)

Add to AWS Systems Manager Parameter Store:

```bash
/dentia/production/NEXT_PUBLIC_GHL_WIDGET_ID
/dentia/production/NEXT_PUBLIC_GHL_CALENDAR_ID
```

### 2. Add Chat Widget to Your App

#### Option A: Global Chat Widget (Recommended)

Add the chat widget to your root layout so it appears on all pages:

**File**: `apps/frontend/apps/web/app/layout.tsx`

```tsx
import { GHLChatWidget } from '@kit/shared/gohighlevel';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ... existing code ...

  return (
    <html lang={language} className={`${className} ${theme === 'dark' ? 'dark' : ''}`}>
      <body>
        <RootProviders theme={theme} lang={language} nonce={nonce} session={session}>
          {children}
        </RootProviders>

        <Toaster richColors={true} theme={theme} position="top-center" />
        
        {/* Add GHL Chat Widget */}
        <GHLChatWidget />
      </body>
    </html>
  );
}
```

#### Option B: Chat Widget on Specific Pages

Add the widget only to authenticated pages:

**File**: `apps/frontend/apps/web/app/home/(user)/layout.tsx`

```tsx
import { GHLChatWidget } from '@kit/shared/gohighlevel';

function MyLayout({ children }: React.PropsWithChildren) {
  return (
    <>
      <Page>
        {/* ... your page content ... */}
        {children}
      </Page>
      
      {/* Add chat widget for authenticated users */}
      <GHLChatWidget />
    </>
  );
}
```

### 3. Add Calendar Booking Page

Create a dedicated booking page for users to schedule appointments:

**File**: `apps/frontend/apps/web/app/home/(user)/booking/page.tsx`

```tsx
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';
import { GHLCalendarEmbed } from '@kit/shared/gohighlevel';

import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';

export const generateMetadata = async () => {
  const i18n = await createI18nServerInstance();
  const title = i18n.t('common:bookingPage');

  return {
    title,
  };
};

function BookingPage() {
  const calendarId = process.env.NEXT_PUBLIC_GHL_CALENDAR_ID || '';

  return (
    <>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-2">
          <Trans i18nKey="common:bookAppointment" defaults="Book an Appointment" />
        </h1>
        <p className="text-muted-foreground mb-6">
          <Trans 
            i18nKey="common:bookAppointmentDescription" 
            defaults="Select a time that works for you to meet with our team" 
          />
        </p>
        
        <PageBody>
          {calendarId ? (
            <GHLCalendarEmbed 
              calendarId={calendarId}
              height="700px"
              className="w-full"
            />
          ) : (
            <div className="text-center p-8 border border-yellow-300 rounded-lg bg-yellow-50">
              <p className="text-yellow-800">
                Calendar is not configured. Please set NEXT_PUBLIC_GHL_CALENDAR_ID environment variable.
              </p>
            </div>
          )}
        </PageBody>
      </div>
    </>
  );
}

export default withI18n(BookingPage);
```

**File**: `apps/frontend/apps/web/app/home/(user)/booking/loading.tsx`

```tsx
import { GlobalLoader } from '@kit/ui/global-loader';

export default GlobalLoader;
```

### 4. Add Navigation Link

Add a link to the booking page in your navigation:

**File**: `apps/frontend/apps/web/config/personal-account-navigation.config.tsx`

```tsx
import { Calendar } from 'lucide-react';

export const personalAccountNavigationConfig = () => {
  return {
    routes: [
      // ... existing routes ...
      
      {
        label: 'common:bookingLabel',
        path: '/home/booking',
        Icon: <Calendar className="w-4" />,
      },
    ],
  };
};
```

### 5. Add Translations

Add the necessary translation keys:

**File**: `apps/frontend/apps/web/public/locales/en/common.json`

```json
{
  "routes": {
    "booking": "Booking"
  },
  "bookingLabel": "Book Appointment",
  "bookingPage": "Book an Appointment",
  "bookAppointment": "Book an Appointment",
  "bookAppointmentDescription": "Select a time that works for you to meet with our team"
}
```

---

## Usage Examples

### Example 1: Multiple Calendars

If you have different calendars for different purposes:

```tsx
import { GHLCalendarEmbed } from '@kit/shared/gohighlevel';

export function BookingPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-4">Sales Consultation</h2>
        <GHLCalendarEmbed 
          calendarId="sales-calendar-id"
          height="600px"
        />
      </div>
      
      <div>
        <h2 className="text-2xl font-bold mb-4">Technical Support</h2>
        <GHLCalendarEmbed 
          calendarId="support-calendar-id"
          height="600px"
        />
      </div>
    </div>
  );
}
```

### Example 2: Calendar in a Modal

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@kit/ui/button';
import { GHLCalendarDialog } from '@kit/shared/gohighlevel';

export function BookingButton() {
  const [open, setOpen] = useState(false);
  
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        Schedule a Meeting
      </Button>
      
      <GHLCalendarDialog 
        open={open}
        onClose={() => setOpen(false)}
        calendarId={process.env.NEXT_PUBLIC_GHL_CALENDAR_ID || ''}
        title="Book Your Consultation"
      />
    </>
  );
}
```

### Example 3: Conditional Chat Widget

Show chat only to logged-in users:

```tsx
'use client';

import { useSession } from 'next-auth/react';
import { GHLChatWidget } from '@kit/shared/gohighlevel';

export function ConditionalChatWidget() {
  const { data: session } = useSession();
  
  // Only show chat to authenticated users
  if (!session) {
    return null;
  }
  
  return <GHLChatWidget />;
}
```

---

## Testing

### Test Chat Widget

1. Start your development server
2. Navigate to any page where you added the widget
3. You should see a chat button appear in the bottom corner
4. Click it to open the chat interface
5. Send a test message
6. Check your GHL dashboard for the incoming message

### Test Calendar

1. Navigate to your booking page (`/home/booking`)
2. You should see the calendar with available time slots
3. Try selecting a date and time
4. Fill out the booking form
5. Complete the booking
6. Check your GHL dashboard for the appointment
7. Verify you receive the confirmation email/SMS

### Troubleshooting

#### Chat Widget Not Appearing

**Check:**
- Is `NEXT_PUBLIC_GHL_WIDGET_ID` set correctly?
- Check browser console for errors
- Verify the widget is enabled in your GHL account
- Check if ad blockers are interfering

**Debug:**
```bash
# Check environment variable
echo $NEXT_PUBLIC_GHL_WIDGET_ID

# Look for console errors in browser
# Open DevTools → Console tab
```

#### Calendar Not Loading

**Check:**
- Is `NEXT_PUBLIC_GHL_CALENDAR_ID` set correctly?
- Is the calendar published/active in GHL?
- Check browser console for CORS or loading errors
- Verify the calendar ID is correct

**Debug:**
```bash
# Test calendar URL directly in browser
https://api.leadconnectorhq.com/widget/bookings/YOUR_CALENDAR_ID
```

#### Widget Showing But Not Functional

**Check:**
- Is your GHL subscription active?
- Are team members assigned to receive chats/bookings?
- Check GHL dashboard for any error messages
- Verify business hours are set correctly

---

## Advanced Configuration

### Custom Styling for Chat Widget

The chat widget appearance is controlled in GHL, but you can add custom CSS:

```css
/* Add to your global CSS */
#ghl-chat-widget-container {
  /* Custom positioning */
  bottom: 20px !important;
  right: 20px !important;
}

/* Customize the chat button */
.ghl-chat-button {
  /* Your custom styles */
}
```

### Pre-fill Calendar Data

You can pre-fill calendar form fields using URL parameters:

```tsx
import { GHLCalendarEmbed } from '@kit/shared/gohighlevel';
import { useUserWorkspace } from '@kit/accounts/hooks/use-user-workspace';

export function PersonalizedBooking() {
  const { user } = useUserWorkspace();
  
  // Build URL with pre-filled data
  const calendarUrl = `https://api.leadconnectorhq.com/widget/bookings/YOUR_CALENDAR_ID?name=${user.displayName}&email=${user.email}`;
  
  return (
    <GHLCalendarEmbed 
      calendarId={calendarUrl}
      height="700px"
    />
  );
}
```

### Tracking Bookings

Listen for booking completion events:

```tsx
'use client';

import { useEffect } from 'react';

export function BookingPageWithTracking() {
  useEffect(() => {
    // Listen for booking completion messages from iframe
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'booking-completed') {
        // Track in your analytics
        console.log('Booking completed:', event.data);
        
        // You can trigger custom actions here
        // e.g., show a success message, redirect, etc.
      }
    };
    
    window.addEventListener('message', handleMessage);
    
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);
  
  return (
    <GHLCalendarEmbed calendarId="your-calendar-id" />
  );
}
```

---

## Security Considerations

### Widget ID vs API Key

- **Widget ID** (`NEXT_PUBLIC_*`): Safe to expose publicly - only allows users to interact with chat/calendar
- **API Key** (`GHL_API_KEY`): Must remain server-side only - grants full API access

### Best Practices

1. **Never expose API keys** in client-side code
2. **Use environment variables** for all GHL credentials
3. **Validate user input** before passing to GHL
4. **Implement rate limiting** if programmatically creating bookings
5. **Use HTTPS only** in production

---

## API Reference

### GHLChatWidget Component

```tsx
import { GHLChatWidget } from '@kit/shared/gohighlevel';

// Usage
<GHLChatWidget />
```

**Environment Variables:**
- `NEXT_PUBLIC_GHL_WIDGET_ID`: Your GHL widget ID (required)

**Features:**
- Automatically loads and initializes the chat widget
- Handles script loading errors gracefully
- Cleans up on unmount
- No props required

### GHLCalendarEmbed Component

```tsx
import { GHLCalendarEmbed } from '@kit/shared/gohighlevel';

<GHLCalendarEmbed
  calendarId="your-calendar-id"
  height="700px"
  width="100%"
  className="my-custom-class"
  loadingComponent={<MySpinner />}
/>
```

**Props:**
- `calendarId` (required): GHL calendar ID or full URL
- `height`: Iframe height (default: "600px")
- `width`: Iframe width (default: "100%")
- `className`: Additional CSS classes
- `loadingComponent`: Custom loading component

### GHLCalendarDialog Component

```tsx
import { GHLCalendarDialog } from '@kit/shared/gohighlevel';

<GHLCalendarDialog
  open={isOpen}
  onClose={() => setIsOpen(false)}
  calendarId="your-calendar-id"
  title="Book Your Appointment"
/>
```

**Props:**
- All props from `GHLCalendarEmbed`
- `open` (required): Dialog open state
- `onClose` (required): Close handler function
- `title`: Dialog title (default: "Book an Appointment")

---

## Summary

### What You Need from GHL:
1. ✅ Widget ID for live chat
2. ✅ Calendar ID for bookings
3. ✅ API Key (already have) and Location ID (already have)

### What to Add to Dentia:
1. ✅ `GHLChatWidget` component in your layout
2. ✅ New booking page with `GHLCalendarEmbed`
3. ✅ Environment variables for widget and calendar IDs
4. ✅ Navigation links to booking page

### Next Steps:
1. Get your Widget ID from GHL
2. Create a calendar in GHL and get the Calendar ID
3. Add environment variables
4. Add components to your app
5. Test the integration

---

**Questions or Issues?**

- GHL API Documentation: https://highlevel.stoplight.io/
- GHL Support: https://help.gohighlevel.com/
- Check the Dentia logs for `[GHL]` prefixed messages

**Last Updated**: November 2024
**Version**: 1.0.0

