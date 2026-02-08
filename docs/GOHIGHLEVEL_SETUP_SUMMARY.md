# GoHighLevel Integration - Setup Summary

This document provides a complete overview of what has been implemented and what you need to do to get GHL Chat and Calendar working.

## 🎯 What's Been Implemented

### New Components Created

1. **`GHLChatWidget`** - Live chat widget component
   - Location: `apps/frontend/packages/shared/src/gohighlevel/ghl-chat-widget.tsx`
   - Usage: Drop into any layout to add live chat

2. **`GHLCalendarEmbed`** - Calendar booking embed component
   - Location: `apps/frontend/packages/shared/src/gohighlevel/ghl-calendar-embed.tsx`
   - Usage: Embed calendar booking on any page

3. **`GHLCalendarDialog`** - Calendar in modal dialog
   - Location: Same file as `GHLCalendarEmbed`
   - Usage: Show calendar in a popup

4. **Sample Booking Page**
   - Location: `apps/frontend/apps/web/app/home/(user)/booking/page.tsx`
   - A ready-to-use booking page for users

### Updated Files

1. **`gohighlevel/index.ts`**
   - Added exports for new components

2. **`docker-compose.yml`**
   - Added environment variables for chat and calendar

### Documentation Created

1. **`GOHIGHLEVEL_CHAT_CALENDAR_INTEGRATION.md`**
   - Complete integration guide with all details

2. **`GOHIGHLEVEL_QUICK_START_CHAT_CALENDAR.md`**
   - Quick 5-minute setup guide

3. **`GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md`**
   - 14 practical implementation examples

4. **`GOHIGHLEVEL_SETUP_SUMMARY.md`** (this file)
   - Overview and action items

---

## ✅ What You Need to Do

### Step 1: Get GHL Credentials

You need two IDs from your GoHighLevel account:

#### A. Chat Widget ID

1. Log in to GoHighLevel
2. Go to **Settings** → **Chat Widget**
3. Enable the widget if not already enabled
4. Configure appearance (colors, position, greeting)
5. Find the installation code - it looks like:
   ```html
   <script data-widget-id="YOUR_WIDGET_ID" ...>
   ```
6. **Copy the widget ID**

#### B. Calendar ID

1. In GoHighLevel, go to **Calendars**
2. Create a new calendar or select an existing one
3. Configure:
   - Duration (15min, 30min, 1hr, etc.)
   - Available times
   - Form fields to collect
   - Notifications settings
4. Go to **Calendar Settings** → **Share** or **Embed**
5. You'll see a URL like:
   ```
   https://api.leadconnectorhq.com/widget/bookings/YOUR_CALENDAR_ID
   ```
6. **Copy the calendar ID**

### Step 2: Set Environment Variables

#### For Local Development

Create or update `apps/frontend/.env.local`:

```bash
# GHL Contact Sync (you already have these)
GHL_API_KEY=your-existing-api-key
GHL_LOCATION_ID=your-existing-location-id

# NEW: Chat Widget
NEXT_PUBLIC_GHL_WIDGET_ID=abc123xyz

# NEW: Calendar
NEXT_PUBLIC_GHL_CALENDAR_ID=your-calendar-id
```

#### For Docker

Before running `docker-compose up`, set these:

```bash
export NEXT_PUBLIC_GHL_WIDGET_ID=abc123xyz
export NEXT_PUBLIC_GHL_CALENDAR_ID=your-calendar-id

# Then run
docker-compose up
```

#### For Production (AWS)

Add to AWS Systems Manager Parameter Store:

```bash
aws ssm put-parameter \
  --name "/dentia/production/NEXT_PUBLIC_GHL_WIDGET_ID" \
  --value "your-widget-id" \
  --type "String"

aws ssm put-parameter \
  --name "/dentia/production/NEXT_PUBLIC_GHL_CALENDAR_ID" \
  --value "your-calendar-id" \
  --type "String"
```

### Step 3: Add Chat Widget to Your App

Open `apps/frontend/apps/web/app/layout.tsx` and add:

```tsx
import { GHLChatWidget } from '@kit/shared/gohighlevel';

export default async function RootLayout({ children }) {
  // ... existing code ...
  
  return (
    <html lang={language}>
      <body>
        <RootProviders theme={theme} lang={language} nonce={nonce} session={session}>
          {children}
        </RootProviders>

        <Toaster richColors={true} theme={theme} position="top-center" />
        
        {/* ADD THIS LINE */}
        <GHLChatWidget />
      </body>
    </html>
  );
}
```

### Step 4: Add Booking Navigation (Optional)

If you want a link to the booking page in your navigation:

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

### Step 5: Add Translations

**File**: `apps/frontend/apps/web/public/locales/en/common.json`

Add these keys (if not already present):

```json
{
  "routes": {
    "booking": "Booking"
  },
  "bookingLabel": "Book Appointment",
  "bookingPage": "Book an Appointment",
  "bookAppointment": "Book an Appointment",
  "bookAppointmentDescription": "Select a time that works for you to meet with our team",
  "configurationError": "Configuration Error",
  "calendarNotConfigured": "Calendar is not configured. Please set NEXT_PUBLIC_GHL_CALENDAR_ID environment variable."
}
```

### Step 6: Test Everything

1. **Start your app:**
   ```bash
   pnpm run dev
   ```

2. **Test Chat:**
   - Open http://localhost:3000
   - Look for chat button (usually bottom-right)
   - Click and send a test message
   - Check GHL dashboard for the message

3. **Test Calendar:**
   - Navigate to http://localhost:3000/home/booking
   - Try selecting a date and time
   - Complete a test booking
   - Check GHL for the appointment

---

## 📁 File Structure

```
apps/frontend/
├── packages/shared/src/gohighlevel/
│   ├── gohighlevel.service.ts          # Existing (contact sync)
│   ├── ghl-chat-widget.tsx             # NEW (chat widget)
│   ├── ghl-calendar-embed.tsx          # NEW (calendar embed)
│   └── index.ts                         # Updated exports
│
└── apps/web/
    └── app/home/(user)/booking/
        ├── page.tsx                     # NEW (booking page)
        └── loading.tsx                  # NEW (loading state)

docs/
├── GOHIGHLEVEL_INTEGRATION.md                    # Existing
├── GOHIGHLEVEL_CHAT_CALENDAR_INTEGRATION.md     # NEW (detailed guide)
├── GOHIGHLEVEL_QUICK_START_CHAT_CALENDAR.md     # NEW (quick start)
├── GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md        # NEW (examples)
└── GOHIGHLEVEL_SETUP_SUMMARY.md                  # NEW (this file)
```

---

## 🔧 Troubleshooting

### Chat Widget Not Showing

**Problem**: Chat button doesn't appear

**Solutions**:
1. Check if `NEXT_PUBLIC_GHL_WIDGET_ID` is set:
   ```bash
   echo $NEXT_PUBLIC_GHL_WIDGET_ID
   ```
2. Check browser console for errors (F12 → Console)
3. Look for log messages with `[GHL Chat]` prefix
4. Verify widget is enabled in GHL dashboard
5. Check if ad blocker is interfering

### Calendar Not Loading

**Problem**: Calendar shows error or blank

**Solutions**:
1. Check if `NEXT_PUBLIC_GHL_CALENDAR_ID` is set:
   ```bash
   echo $NEXT_PUBLIC_GHL_CALENDAR_ID
   ```
2. Test calendar URL directly in browser:
   ```
   https://api.leadconnectorhq.com/widget/bookings/YOUR_CALENDAR_ID
   ```
3. Verify calendar is active/published in GHL
4. Check browser console for CORS errors
5. Ensure calendar ID has no extra spaces

### Environment Variables Not Working

**Problem**: Variables not being read

**Solutions**:
1. For local dev, make sure `.env.local` exists
2. For Docker, export variables before `docker-compose up`
3. Restart your dev server after adding variables
4. Variables starting with `NEXT_PUBLIC_` are exposed to client
5. Other variables are server-only

### Widget Showing But Not Working

**Problem**: Widget loads but doesn't function

**Solutions**:
1. Check GHL subscription is active
2. Verify team members are assigned to receive chats/bookings
3. Check business hours in GHL settings
4. Look for errors in GHL dashboard
5. Try a different browser

---

## 🎨 Customization Options

### Chat Widget Placement

Choose where to add the chat widget:

1. **All pages** (recommended): Add to root layout
2. **Authenticated pages only**: Add to user layout
3. **Marketing pages only**: Add to marketing layout
4. **Specific pages**: Add to individual page components

See `GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md` for code examples.

### Multiple Calendars

You can have different calendars for different purposes:

```bash
# Set multiple calendar IDs
NEXT_PUBLIC_GHL_SALES_CALENDAR_ID=sales-id
NEXT_PUBLIC_GHL_SUPPORT_CALENDAR_ID=support-id
NEXT_PUBLIC_GHL_DEMO_CALENDAR_ID=demo-id
```

Then use tabs or separate pages for each. See examples in documentation.

### Custom Styling

The chat widget styling is controlled in GHL, but you can override with CSS:

```css
/* Add to your global CSS */
#ghl-chat-widget-container {
  bottom: 20px !important;
  right: 20px !important;
}
```

---

## 📊 Features Matrix

| Feature | Status | Component | Configuration |
|---------|--------|-----------|---------------|
| Contact Sync | ✅ Active | `GoHighLevelService` | `GHL_API_KEY`, `GHL_LOCATION_ID` |
| Live Chat | ✅ Ready | `GHLChatWidget` | `NEXT_PUBLIC_GHL_WIDGET_ID` |
| Calendar Booking | ✅ Ready | `GHLCalendarEmbed` | `NEXT_PUBLIC_GHL_CALENDAR_ID` |
| Calendar Dialog | ✅ Ready | `GHLCalendarDialog` | `NEXT_PUBLIC_GHL_CALENDAR_ID` |
| Domain Tagging | ✅ Active | `GoHighLevelService` | Automatic |

---

## 🚀 Quick Commands Reference

```bash
# Check environment variables
echo $NEXT_PUBLIC_GHL_WIDGET_ID
echo $NEXT_PUBLIC_GHL_CALENDAR_ID

# Start dev server
pnpm run dev

# Build for production
pnpm run build

# Run with Docker
export NEXT_PUBLIC_GHL_WIDGET_ID=your-widget-id
export NEXT_PUBLIC_GHL_CALENDAR_ID=your-calendar-id
docker-compose up

# Add to AWS Parameter Store
aws ssm put-parameter --name "/dentia/production/NEXT_PUBLIC_GHL_WIDGET_ID" --value "your-id" --type "String"
aws ssm put-parameter --name "/dentia/production/NEXT_PUBLIC_GHL_CALENDAR_ID" --value "your-id" --type "String"
```

---

## 📚 Documentation Guide

- **Quick Start**: Read `GOHIGHLEVEL_QUICK_START_CHAT_CALENDAR.md` first
- **Detailed Setup**: See `GOHIGHLEVEL_CHAT_CALENDAR_INTEGRATION.md`
- **Code Examples**: Browse `GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md`
- **Contact Sync**: Refer to `GOHIGHLEVEL_INTEGRATION.md` (existing)
- **This Summary**: `GOHIGHLEVEL_SETUP_SUMMARY.md`

---

## ✨ What's Next?

After setting up the basics, you can:

1. **Customize chat appearance** in GHL dashboard
2. **Create multiple calendars** for different services
3. **Set up automations** in GHL for follow-ups
4. **Track bookings** with custom analytics
5. **Pre-fill user data** in calendar forms
6. **Add chat conditionally** based on user type or subscription

See the implementation examples documentation for code samples.

---

## 🤝 Support

- **GHL API Docs**: https://highlevel.stoplight.io/
- **GHL Help Center**: https://help.gohighlevel.com/
- **Dentia Documentation**: See files in `/docs` folder
- **Console Logs**: Look for `[GHL Chat]` and `[GHL Calendar]` messages

---

## Summary Checklist

Before going live, ensure:

- [ ] Widget ID obtained from GHL
- [ ] Calendar ID obtained from GHL
- [ ] Environment variables set correctly
- [ ] Chat widget added to layout
- [ ] Booking page created (optional)
- [ ] Navigation link added (optional)
- [ ] Translations added
- [ ] Chat tested successfully
- [ ] Calendar tested successfully
- [ ] Both features working in production environment

---

**Status**: ✅ Implementation Complete  
**Version**: 1.0.0  
**Last Updated**: November 2024

**You're all set! Just add your GHL credentials and the features will work.**

