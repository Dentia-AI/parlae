# ✅ GoHighLevel Integration - Complete!

Your GoHighLevel integration is fully implemented and ready to use.

---

## 🔑 Your Credentials

**⚠️ SECURITY NOTE**: Get your actual credentials from:
- Your team lead or admin
- The private `dentia-infra` repository  
- AWS SSM Parameter Store (for production)

```bash
API Key:     YOUR_GHL_API_KEY_HERE
Location ID: YOUR_GHL_LOCATION_ID_HERE
Widget ID:   YOUR_GHL_WIDGET_ID_HERE
Calendar ID: YOUR_GHL_CALENDAR_ID_HERE
```

---

## 🚀 Quick Start (2 Minutes!)

### Option 1: Automated Setup (Recommended)

```bash
cd /Users/shaunk/Projects/Dentia/dentia

# Set your credentials as environment variables
export GHL_API_KEY="your-api-key"
export GHL_LOCATION_ID="your-location-id"
export GHL_WIDGET_ID="your-widget-id"
export GHL_CALENDAR_ID="your-calendar-id"

# Run the setup script
./scripts/setup-ghl.sh

# Start your app
pnpm run dev
```

### Option 2: Manual Setup

1. **Add to `.env.local`:**

```bash
# Copy/paste this into apps/frontend/.env.local
GHL_API_KEY=your-api-key-here
GHL_LOCATION_ID=your-location-id-here
NEXT_PUBLIC_GHL_WIDGET_ID=your-widget-id-here
NEXT_PUBLIC_GHL_LOCATION_ID=your-location-id-here
NEXT_PUBLIC_GHL_CALENDAR_ID=your-calendar-id-here
```

2. **Add Chat Widget** to `apps/frontend/apps/web/app/layout.tsx`:

```tsx
import { GHLChatWidget } from '@kit/shared/gohighlevel';

// In your RootLayout return:
<body>
  {/* ... existing code ... */}
  <GHLChatWidget />  {/* Add this line */}
</body>
```

3. **Start and Test:**

```bash
pnpm run dev

# Test chat: http://localhost:3000
# Test calendar: http://localhost:3000/home/booking
```

---

## 📦 What's Been Implemented

### ✅ Components Created

1. **`GHLChatWidget`** - Live chat widget (matches your exact implementation)
2. **`GHLCalendarEmbed`** - Calendar booking embed
3. **`GHLCalendarDialog`** - Calendar in modal
4. **Booking Page** - Ready at `/home/booking`

### ✅ Features Available

| Feature | Status | How to Use |
|---------|--------|------------|
| Contact Sync | ✅ Active | Automatic on user registration |
| Live Chat | ✅ Ready | Add `<GHLChatWidget />` to layout |
| Calendar Booking | ✅ Ready | Visit `/home/booking` or use `<GHLCalendarEmbed />` |
| Domain Tagging | ✅ Active | Automatic tag assignment |

### ✅ Scripts Created

1. **`scripts/setup-ghl.sh`** - Automated local setup (prompts for credentials)
2. **`dentia-infra/infra/scripts/put-ssm-secrets.sh`** - AWS SSM deployment (in private repo)

### ✅ Documentation Created

| Document | Purpose |
|----------|---------|
| `GOHIGHLEVEL_README.md` | Main entry point |
| `GOHIGHLEVEL_YOUR_CREDENTIALS.md` | Setup guide (template) |
| `GOHIGHLEVEL_QUICK_START_CHAT_CALENDAR.md` | 5-minute quick start |
| `GOHIGHLEVEL_CHAT_CALENDAR_INTEGRATION.md` | Complete integration guide |
| `GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md` | 14+ code examples |
| `GOHIGHLEVEL_DEPLOYMENT_GUIDE.md` | Production deployment |
| `GOHIGHLEVEL_SECURITY.md` | Security best practices |
| `GOHIGHLEVEL_SETUP_SUMMARY.md` | Setup overview |

---

## 🎯 Next Steps

### Immediate (Local Development)

1. **Get Credentials** from your team lead or the private `dentia-infra` repo

2. **Run Setup:**
   ```bash
   # Option A: Let script prompt you
   ./scripts/setup-ghl.sh
   
   # Option B: Set env vars first
   export GHL_API_KEY="your-key"
   export GHL_LOCATION_ID="your-location"
   export GHL_WIDGET_ID="your-widget"
   export GHL_CALENDAR_ID="your-calendar"
   ./scripts/setup-ghl.sh
   ```

3. **Add Chat Widget** (one line of code):
   ```tsx
   <GHLChatWidget />
   ```

4. **Start Testing:**
   ```bash
   pnpm run dev
   ```

### Production Deployment

For production deployment, see the private `dentia-infra` repository which contains:
- All production credentials in `put-ssm-secrets.sh`
- AWS SSM deployment scripts
- ECS configuration

---

## 🧪 Testing Checklist

### Local Testing

- [ ] Get credentials from team/admin
- [ ] Run `./scripts/setup-ghl.sh`
- [ ] Add `<GHLChatWidget />` to layout
- [ ] Start dev server
- [ ] See chat button appear
- [ ] Send test message
- [ ] Check GHL dashboard for message
- [ ] Visit `/home/booking`
- [ ] Book test appointment
- [ ] Verify in GHL calendar

### Production Testing

See deployment guide in the private `dentia-infra` repository.

---

## 📚 Documentation Quick Links

**Start Here:**
- [Setup Guide (Template)](./docs/GOHIGHLEVEL_YOUR_CREDENTIALS.md) ⭐
- [Security Guidelines](./docs/GOHIGHLEVEL_SECURITY.md) 🔒

**Quick Guides:**
- [5-Minute Quick Start](./docs/GOHIGHLEVEL_QUICK_START_CHAT_CALENDAR.md)
- [Main README](./docs/GOHIGHLEVEL_README.md)

**Detailed Guides:**
- [Complete Integration Guide](./docs/GOHIGHLEVEL_CHAT_CALENDAR_INTEGRATION.md)
- [Deployment Guide](./docs/GOHIGHLEVEL_DEPLOYMENT_GUIDE.md)

**Reference:**
- [Implementation Examples](./docs/GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md)
- [Setup Summary](./docs/GOHIGHLEVEL_SETUP_SUMMARY.md)

---

## 💡 Usage Examples

### Global Chat (All Pages)

```tsx
// apps/frontend/apps/web/app/layout.tsx
import { GHLChatWidget } from '@kit/shared/gohighlevel';

export default async function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <GHLChatWidget />
      </body>
    </html>
  );
}
```

### Calendar Embed

```tsx
import { GHLCalendarEmbed } from '@kit/shared/gohighlevel';

<GHLCalendarEmbed 
  calendarId={process.env.NEXT_PUBLIC_GHL_CALENDAR_ID}
  height="700px"
/>
```

### Calendar in Modal

```tsx
import { GHLCalendarDialog } from '@kit/shared/gohighlevel';

<GHLCalendarDialog 
  open={isOpen}
  onClose={() => setIsOpen(false)}
  calendarId={process.env.NEXT_PUBLIC_GHL_CALENDAR_ID}
/>
```

---

## 🔧 Technical Details

### Chat Widget Implementation

The widget uses this structure (already implemented in `GHLChatWidget`):

```html
<div 
  data-chat-widget 
  data-widget-id="YOUR_WIDGET_ID" 
  data-location-id="YOUR_LOCATION_ID">
</div>

<script 
  src="https://widgets.leadconnectorhq.com/loader.js"
  data-resources-url="https://widgets.leadconnectorhq.com/chat-widget/loader.js"
  data-widget-id="YOUR_WIDGET_ID">
</script>
```

### API Authentication

All API calls use:

```typescript
Authorization: Bearer YOUR_GHL_API_KEY
```

Location ID is passed in request body:

```json
{
  "locationId": "YOUR_LOCATION_ID",
  // ... other fields
}
```

---

## 🐛 Troubleshooting

### Chat Not Showing

```bash
# 1. Check env variable
echo $NEXT_PUBLIC_GHL_WIDGET_ID

# 2. Check browser console for errors
# 3. Verify widget is enabled in GHL

# 4. Check logs
pnpm run dev | grep GHL
```

### Calendar Not Loading

```bash
# 1. Check env variable
echo $NEXT_PUBLIC_GHL_CALENDAR_ID

# 2. Test URL directly
open "https://api.leadconnectorhq.com/widget/bookings/YOUR_CALENDAR_ID"

# 3. Verify calendar is published in GHL
```

### Contact Sync Issues

```bash
# Check API key
echo $GHL_API_KEY

# Test API connection
curl -X GET "https://services.leadconnectorhq.com/contacts" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## 📞 Support Resources

### GoHighLevel
- Dashboard: https://app.gohighlevel.com/
- API Docs: https://highlevel.stoplight.io/
- Help Center: https://help.gohighlevel.com/

### Your Integration
- All documentation in `/docs` folder
- Setup script in `/scripts` folder
- Component code in `apps/frontend/packages/shared/src/gohighlevel/`

---

## ✅ Summary

**You Have:**
- ✅ All components implemented
- ✅ Chat widget matching your exact setup
- ✅ Calendar booking ready
- ✅ Contact sync already working
- ✅ Setup scripts created
- ✅ Comprehensive documentation
- ✅ Deployment scripts ready (in private repo)

**You Need To:**
1. Get credentials from team/admin
2. Run `./scripts/setup-ghl.sh` with your credentials
3. Add `<GHLChatWidget />` to layout (1 line)
4. Test locally (2 minutes)
5. Deploy to production when ready (see dentia-infra repo)

**Total Setup Time: ~3 minutes** ⚡

---

## 🔒 Security Note

**This repository does NOT contain actual credentials.**  
All sensitive information is stored in:
- Local `.env.local` files (gitignored)
- Private `dentia-infra` repository
- AWS SSM Parameter Store (production)

Never commit actual API keys, tokens, or credentials to this repository.

---

**Last Updated**: November 2024  
**Status**: ✅ Complete & Ready to Use  
**Credentials**: Available in private `dentia-infra` repo

