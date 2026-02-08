# GoHighLevel Integration - Complete Guide

Welcome to the GoHighLevel integration documentation for Dentia! This README serves as your entry point to all GHL features.

## 🎯 Overview

Dentia integrates with GoHighLevel to provide three key features:

1. **Contact Sync** - Automatically sync registered users to GHL CRM ✅ Active
2. **Live Chat** - Real-time chat widget for customer communication ✅ Ready
3. **Calendar Booking** - Embedded appointment scheduling ✅ Ready

---

## 📖 Documentation Structure

### Quick Start Guides

1. **[Contact Sync Quick Start](./GOHIGHLEVEL_QUICK_START.md)**
   - 5-minute setup for existing contact sync feature
   - Already implemented and working

2. **[Chat & Calendar Quick Start](./GOHIGHLEVEL_QUICK_START_CHAT_CALENDAR.md)** ⭐ **Start Here**
   - 5-minute setup for chat and calendar
   - New features ready to configure

### Detailed Guides

3. **[Contact Sync Integration](./GOHIGHLEVEL_INTEGRATION.md)**
   - Complete guide for contact sync
   - Includes domain-based tagging
   - Testing and troubleshooting

4. **[Chat & Calendar Integration](./GOHIGHLEVEL_CHAT_CALENDAR_INTEGRATION.md)**
   - Complete guide for chat and calendar
   - GHL setup instructions
   - Configuration and customization
   - Security best practices

### Reference Documentation

5. **[Implementation Examples](./GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md)**
   - 14+ practical code examples
   - Different use cases and patterns
   - Testing examples

6. **[Domain Tagging Reference](./GOHIGHLEVEL_DOMAIN_TAGGING.md)**
   - How domain-based tagging works
   - Tag usage in workflows

7. **[Setup Summary](./GOHIGHLEVEL_SETUP_SUMMARY.md)**
   - Overview of implementation
   - Checklist for setup
   - File structure reference

8. **[Implementation Summary](./GOHIGHLEVEL_IMPLEMENTATION_SUMMARY.md)**
   - Technical implementation details
   - Contact sync feature overview

9. **[Testing Guide](./GOHIGHLEVEL_TESTING.md)**
   - Test scenarios for contact sync
   - Verification steps

---

## 🚀 Getting Started

### For Contact Sync (Already Working)

Contact sync is already implemented and working. When users sign up, they're automatically added to your GHL account.

**Configuration**:
```bash
GHL_API_KEY=your-key
GHL_LOCATION_ID=your-location-id
```

**Status**: ✅ Active

### For Chat & Calendar (New Features)

These features are implemented but need your GHL credentials to activate.

**Follow these steps**:

1. **Get Credentials from GHL** (5 minutes)
   - Widget ID for chat
   - Calendar ID for booking
   - See: [Chat & Calendar Quick Start](./GOHIGHLEVEL_QUICK_START_CHAT_CALENDAR.md)

2. **Set Environment Variables**
   ```bash
   NEXT_PUBLIC_GHL_WIDGET_ID=your-widget-id
   NEXT_PUBLIC_GHL_CALENDAR_ID=your-calendar-id
   ```

3. **Add Chat Widget to Layout** (1 line of code)
   ```tsx
   import { GHLChatWidget } from '@kit/shared/gohighlevel';
   
   // Add to your layout
   <GHLChatWidget />
   ```

4. **Use the Booking Page** (already created)
   - Navigate to `/home/booking`
   - Or use `<GHLCalendarEmbed />` anywhere

**Status**: ✅ Ready (needs configuration)

---

## 🔑 Required Credentials

### What You Need from GoHighLevel

| Credential | Purpose | Where to Get It |
|------------|---------|-----------------|
| `GHL_API_KEY` | Contact sync (server-side) | GHL Settings → Company → API Keys |
| `GHL_LOCATION_ID` | Contact sync (server-side) | GHL Settings → Business Profile |
| `NEXT_PUBLIC_GHL_WIDGET_ID` | Live chat (client-side) | GHL Settings → Chat Widget → Embed Code |
| `NEXT_PUBLIC_GHL_CALENDAR_ID` | Calendar (client-side) | GHL Calendars → Your Calendar → Share |

### Security Notes

- `GHL_API_KEY` and `GHL_LOCATION_ID` are server-only (never exposed to client)
- `NEXT_PUBLIC_*` variables are safe to expose publicly
- Widget/Calendar IDs only allow users to interact, not access your data

---

## 📦 Components Available

### Server-Side (Contact Sync)

```tsx
import { createGoHighLevelService } from '@kit/shared/gohighlevel';

const ghlService = createGoHighLevelService();

// Sync a user
await ghlService.syncRegisteredUser({
  email: user.email,
  displayName: user.name,
  hostname: 'www.dentiaapp.com'
});

// Add tags
await ghlService.addContactTags({
  email: user.email,
  tags: ['premium-user', 'active-subscription']
});
```

### Client-Side (Chat & Calendar)

```tsx
import { 
  GHLChatWidget,
  GHLCalendarEmbed,
  GHLCalendarDialog 
} from '@kit/shared/gohighlevel';

// Live chat
<GHLChatWidget />

// Calendar embed
<GHLCalendarEmbed calendarId="your-id" height="700px" />

// Calendar in modal
<GHLCalendarDialog 
  open={isOpen}
  onClose={() => setIsOpen(false)}
  calendarId="your-id"
/>
```

---

## 🎨 Use Cases & Examples

### Basic Implementations

1. **Global Chat Widget**
   - Add to root layout for all pages
   - Example: [GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md](./GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md#example-1)

2. **Simple Booking Page**
   - Already created at `/home/booking`
   - Example: [GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md](./GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md#example-5)

### Advanced Implementations

3. **Authenticated Users Only**
   - Show chat only to logged-in users
   - Example: [GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md](./GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md#example-2)

4. **Multiple Calendars**
   - Different calendars for sales, support, demos
   - Example: [GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md](./GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md#example-6)

5. **Calendar in Modal**
   - Show booking in a popup dialog
   - Example: [GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md](./GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md#example-7)

6. **Pre-filled Forms**
   - Auto-fill user data in calendar
   - Example: [GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md](./GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md#example-8)

See [GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md](./GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md) for 14+ more examples.

---

## 🧪 Testing

### Test Contact Sync

Contact sync is already active. Test by:

1. Register a new user
2. Check GHL Contacts for the new contact
3. Verify tags are applied correctly

See: [GOHIGHLEVEL_TESTING.md](./GOHIGHLEVEL_TESTING.md)

### Test Chat Widget

1. Add widget to layout
2. Start dev server
3. Look for chat button
4. Send test message
5. Check GHL dashboard

### Test Calendar

1. Navigate to `/home/booking`
2. Select a date and time
3. Complete booking
4. Check GHL for appointment

See: [GOHIGHLEVEL_CHAT_CALENDAR_INTEGRATION.md](./GOHIGHLEVEL_CHAT_CALENDAR_INTEGRATION.md#testing)

---

## 🐛 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Chat not showing | Check `NEXT_PUBLIC_GHL_WIDGET_ID` is set |
| Calendar not loading | Verify `NEXT_PUBLIC_GHL_CALENDAR_ID` is correct |
| Contact not syncing | Check `GHL_API_KEY` and `GHL_LOCATION_ID` |
| 401 Unauthorized | API key is invalid or expired |
| Widget loads but broken | Check GHL subscription is active |

### Debug Commands

```bash
# Check environment variables
echo $NEXT_PUBLIC_GHL_WIDGET_ID
echo $NEXT_PUBLIC_GHL_CALENDAR_ID
echo $GHL_API_KEY

# Test calendar URL directly
curl https://api.leadconnectorhq.com/widget/bookings/YOUR_CALENDAR_ID

# Check logs (look for [GHL] prefix)
pnpm run dev | grep GHL
```

See [Troubleshooting Section](./GOHIGHLEVEL_CHAT_CALENDAR_INTEGRATION.md#troubleshooting) for more details.

---

## 📁 File Locations

### Implementation Files

```
apps/frontend/packages/shared/src/gohighlevel/
├── gohighlevel.service.ts      # Contact sync service
├── ghl-chat-widget.tsx         # Chat widget component
├── ghl-calendar-embed.tsx      # Calendar components
└── index.ts                     # Exports

apps/frontend/apps/web/app/home/(user)/booking/
├── page.tsx                     # Booking page
└── loading.tsx                  # Loading state
```

### Documentation Files

```
docs/
├── GOHIGHLEVEL_README.md                         # This file
├── GOHIGHLEVEL_QUICK_START.md                   # Contact sync quick start
├── GOHIGHLEVEL_QUICK_START_CHAT_CALENDAR.md     # Chat/calendar quick start
├── GOHIGHLEVEL_INTEGRATION.md                    # Contact sync guide
├── GOHIGHLEVEL_CHAT_CALENDAR_INTEGRATION.md     # Chat/calendar guide
├── GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md        # Code examples
├── GOHIGHLEVEL_DOMAIN_TAGGING.md                # Tagging reference
├── GOHIGHLEVEL_SETUP_SUMMARY.md                  # Setup overview
├── GOHIGHLEVEL_IMPLEMENTATION_SUMMARY.md         # Technical details
└── GOHIGHLEVEL_TESTING.md                        # Testing guide
```

---

## 🔐 Security

### Best Practices

1. **Never commit credentials** to version control
2. **Use environment variables** for all credentials
3. **Server-side only** for API keys
4. **Client-safe** for widget/calendar IDs
5. **HTTPS only** in production

### Data Privacy

- Contact data is synced to GHL on user registration
- Chat messages are stored in GHL
- Calendar bookings create contacts in GHL
- All data follows GDPR guidelines (configure in GHL)

---

## 🚦 Feature Status

| Feature | Status | Configuration Required | Documentation |
|---------|--------|----------------------|---------------|
| Contact Sync | ✅ Active | Already configured | [Guide](./GOHIGHLEVEL_INTEGRATION.md) |
| Domain Tagging | ✅ Active | Automatic | [Reference](./GOHIGHLEVEL_DOMAIN_TAGGING.md) |
| Live Chat | ✅ Ready | Widget ID needed | [Guide](./GOHIGHLEVEL_CHAT_CALENDAR_INTEGRATION.md) |
| Calendar Booking | ✅ Ready | Calendar ID needed | [Guide](./GOHIGHLEVEL_CHAT_CALENDAR_INTEGRATION.md) |
| Tag Management | ✅ Active | Automatic | [Guide](./GOHIGHLEVEL_INTEGRATION.md) |

---

## 📚 Quick Links

### GHL Resources

- [GHL API Documentation](https://highlevel.stoplight.io/)
- [GHL Help Center](https://help.gohighlevel.com/)
- [GHL University](https://university.gohighlevel.com/)

### Dentia Documentation

- **New to GHL integration?** → Start with [Chat & Calendar Quick Start](./GOHIGHLEVEL_QUICK_START_CHAT_CALENDAR.md)
- **Need code examples?** → See [Implementation Examples](./GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md)
- **Having issues?** → Check [Troubleshooting](./GOHIGHLEVEL_CHAT_CALENDAR_INTEGRATION.md#troubleshooting)
- **Want details?** → Read [Complete Integration Guide](./GOHIGHLEVEL_CHAT_CALENDAR_INTEGRATION.md)

---

## 🎯 Next Steps

### To Activate Chat & Calendar

1. **Read**: [Chat & Calendar Quick Start](./GOHIGHLEVEL_QUICK_START_CHAT_CALENDAR.md)
2. **Get**: Widget ID and Calendar ID from GHL
3. **Set**: Environment variables
4. **Add**: `<GHLChatWidget />` to your layout
5. **Test**: Both features

### To Customize

- Browse [Implementation Examples](./GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md)
- Try different placement options
- Set up multiple calendars
- Add tracking and analytics

### To Learn More

- Read the [Complete Integration Guide](./GOHIGHLEVEL_CHAT_CALENDAR_INTEGRATION.md)
- Explore [Domain Tagging](./GOHIGHLEVEL_DOMAIN_TAGGING.md)
- Review [Testing Guide](./GOHIGHLEVEL_TESTING.md)

---

## 💡 Pro Tips

1. **Start Simple**: Add global chat first, then add calendar
2. **Test Locally**: Verify everything works before deploying
3. **Customize in GHL**: Configure appearance, hours, notifications
4. **Monitor Logs**: Watch for `[GHL]` messages during testing
5. **Use Staging**: Test with a GHL sandbox account if available

---

## 📞 Support

**GoHighLevel Support**:
- Documentation: https://highlevel.stoplight.io/
- Help Center: https://help.gohighlevel.com/
- Community: https://www.facebook.com/groups/gohighlevel

**Dentia Integration**:
- Check documentation in `/docs` folder
- Review console logs for `[GHL]` messages
- Verify environment variables are set
- Test in different environments

---

## ✅ Quick Checklist

Before going live:

- [ ] Contact sync tested and working
- [ ] Widget ID obtained from GHL
- [ ] Calendar ID obtained from GHL  
- [ ] Environment variables set
- [ ] Chat widget added to layout
- [ ] Booking page accessible
- [ ] Chat tested successfully
- [ ] Calendar tested successfully
- [ ] Production credentials configured
- [ ] Team members trained on GHL dashboard

---

**Ready to get started?** → [Chat & Calendar Quick Start](./GOHIGHLEVEL_QUICK_START_CHAT_CALENDAR.md)

**Last Updated**: November 2024  
**Version**: 1.0.0  
**Status**: ✅ Ready for Configuration

