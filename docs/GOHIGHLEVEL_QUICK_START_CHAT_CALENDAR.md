# GoHighLevel Chat & Calendar - Quick Start Guide 🚀

Get GHL Live Chat and Calendar integrated in 5 minutes!

## Step 1: Get Your GHL Credentials

### Get Widget ID (for Chat)

1. Log in to GoHighLevel
2. Go to **Settings** → **Chat Widget**
3. Enable the widget
4. Find the embed code and copy the `data-widget-id` value

**Example:**
```html
<script data-widget-id="abc123xyz" ...>
```
Copy: `abc123xyz`

### Get Calendar ID (for Booking)

1. Go to **Calendars** in GHL
2. Create or select a calendar
3. Go to **Settings** → **Share**
4. Find the iframe URL like:
```
https://api.leadconnectorhq.com/widget/bookings/YOUR_CALENDAR_ID
```
Copy: `YOUR_CALENDAR_ID`

---

## Step 2: Add Environment Variables

### Local Development

Add to `apps/frontend/.env.local`:

```bash
# GHL Chat Widget ID
NEXT_PUBLIC_GHL_WIDGET_ID=abc123xyz

# GHL Calendar ID
NEXT_PUBLIC_GHL_CALENDAR_ID=your-calendar-id

# Already have these (for contact sync)
GHL_API_KEY=your-api-key
GHL_LOCATION_ID=your-location-id
```

### Docker

```bash
# Set in your shell before running docker-compose
export NEXT_PUBLIC_GHL_WIDGET_ID=abc123xyz
export NEXT_PUBLIC_GHL_CALENDAR_ID=your-calendar-id

# Then run
docker-compose up
```

---

## Step 3: Add Chat Widget to Your App

Open `apps/frontend/apps/web/app/layout.tsx` and add the chat widget:

```tsx
import { GHLChatWidget } from '@kit/shared/gohighlevel';

export default async function RootLayout({ children }) {
  // ... existing code ...
  
  return (
    <html>
      <body>
        {/* ... existing providers ... */}
        {children}
        
        {/* Add this line */}
        <GHLChatWidget />
      </body>
    </html>
  );
}
```

**That's it!** The chat widget will now appear on all pages.

---

## Step 4: Create a Booking Page (Optional)

Create `apps/frontend/apps/web/app/home/(user)/booking/page.tsx`:

```tsx
import { GHLCalendarEmbed } from '@kit/shared/gohighlevel';
import { withI18n } from '~/lib/i18n/with-i18n';

function BookingPage() {
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

export default withI18n(BookingPage);
```

Create `apps/frontend/apps/web/app/home/(user)/booking/loading.tsx`:

```tsx
import { GlobalLoader } from '@kit/ui/global-loader';

export default GlobalLoader;
```

---

## Step 5: Test It!

### Test Chat

1. Start your dev server: `pnpm run dev`
2. Open http://localhost:3000
3. Look for the chat button (usually bottom-right corner)
4. Click it and send a message
5. Check your GHL dashboard for the message

### Test Calendar

1. Navigate to http://localhost:3000/home/booking
2. Select a date and time
3. Fill out the form
4. Complete booking
5. Check GHL for the appointment

---

## Troubleshooting

### Chat Not Showing?

```bash
# Check the environment variable is set
echo $NEXT_PUBLIC_GHL_WIDGET_ID

# Check browser console for errors
# Look for: [GHL Chat] messages
```

### Calendar Not Loading?

```bash
# Check the environment variable
echo $NEXT_PUBLIC_GHL_CALENDAR_ID

# Test the calendar URL directly:
# Open in browser:
https://api.leadconnectorhq.com/widget/bookings/YOUR_CALENDAR_ID
```

### Still Having Issues?

1. Verify widget is enabled in GHL settings
2. Check that your GHL subscription is active
3. Look for console errors in browser DevTools
4. Verify IDs are correct (no extra spaces)

---

## Common Patterns

### Chat on Specific Pages Only

Instead of adding to root layout, add to specific layouts:

```tsx
// In apps/frontend/apps/web/app/home/(user)/layout.tsx
import { GHLChatWidget } from '@kit/shared/gohighlevel';

function UserLayout({ children }) {
  return (
    <>
      {children}
      <GHLChatWidget />  {/* Only on user pages */}
    </>
  );
}
```

### Multiple Calendars

```tsx
// Different calendars for different purposes
<GHLCalendarEmbed calendarId="sales-calendar-id" />
<GHLCalendarEmbed calendarId="support-calendar-id" />
```

### Calendar in Modal

```tsx
import { GHLCalendarDialog } from '@kit/shared/gohighlevel';

function MyComponent() {
  const [open, setOpen] = useState(false);
  
  return (
    <>
      <Button onClick={() => setOpen(true)}>Book Now</Button>
      <GHLCalendarDialog 
        open={open}
        onClose={() => setOpen(false)}
        calendarId="your-calendar-id"
      />
    </>
  );
}
```

---

## Production Deployment

### Add to AWS Parameter Store

```bash
# Chat Widget ID
aws ssm put-parameter \
  --name "/dentia/production/NEXT_PUBLIC_GHL_WIDGET_ID" \
  --value "your-widget-id" \
  --type "String"

# Calendar ID
aws ssm put-parameter \
  --name "/dentia/production/NEXT_PUBLIC_GHL_CALENDAR_ID" \
  --value "your-calendar-id" \
  --type "String"
```

---

## Summary

✅ **What You Did:**
1. Got Widget ID and Calendar ID from GHL
2. Added environment variables
3. Added `<GHLChatWidget />` to layout
4. Created booking page with `<GHLCalendarEmbed />`
5. Tested both features

✅ **What Works Now:**
- Live chat on your pages
- Calendar booking for appointments
- Real-time communication with customers
- Automated booking confirmations

---

**Need More Details?**

See the full guide: [GOHIGHLEVEL_CHAT_CALENDAR_INTEGRATION.md](./GOHIGHLEVEL_CHAT_CALENDAR_INTEGRATION.md)

**Support:**
- GHL Docs: https://highlevel.stoplight.io/
- GHL Help: https://help.gohighlevel.com/

