# Your GoHighLevel Credentials

This file contains your actual GHL credentials for easy reference.

## 🔑 Credentials

**⚠️ SECURITY NOTE**: This file is a template. Get your actual credentials from:
1. Your team lead or admin
2. The private `dentia-infra` repo
3. AWS SSM Parameter Store (production)

### API Key (Server-side only)
```
YOUR_GHL_API_KEY_HERE
```

**Usage**: Used in server-side API calls with `Authorization: Bearer ${GHL_API_KEY}`

### Location ID
```
YOUR_GHL_LOCATION_ID_HERE
```

**Usage**: Passed in the body of all API requests and as a widget attribute

### Widget ID (Chat)
```
YOUR_GHL_WIDGET_ID_HERE
```

**Usage**: Used to initialize the live chat widget on client-side

### Calendar ID
```
YOUR_GHL_CALENDAR_ID_HERE
```

**Usage**: Used to embed the booking calendar on client-side

---

## 🚀 Quick Setup

### Option 1: Automated Setup (Recommended)

Run the setup script:

```bash
cd /Users/shaunk/Projects/Dentia/dentia
./scripts/setup-ghl.sh
```

This will:
- ✅ Add credentials to `apps/frontend/.env.local`
- ✅ Export variables for current shell
- ✅ Create Docker export script

### Option 2: Manual Setup

#### For Local Development

Create or update `apps/frontend/.env.local`:

```bash
# GoHighLevel Integration
GHL_API_KEY=your-ghl-api-key-here
GHL_LOCATION_ID=your-location-id-here

# Client-side
NEXT_PUBLIC_GHL_WIDGET_ID=your-widget-id-here
NEXT_PUBLIC_GHL_LOCATION_ID=your-location-id-here
NEXT_PUBLIC_GHL_CALENDAR_ID=your-calendar-id-here
```

#### For Docker Compose

Export variables before running:

```bash
export GHL_API_KEY=your-api-key-here
export GHL_LOCATION_ID=your-location-id-here
export NEXT_PUBLIC_GHL_WIDGET_ID=your-widget-id-here
export NEXT_PUBLIC_GHL_LOCATION_ID=your-location-id-here
export NEXT_PUBLIC_GHL_CALENDAR_ID=your-calendar-id-here

docker-compose up
```

#### For Production (AWS)

The GHL credentials are included in the main secrets script. Just run:

```bash
cd /Users/shaunk/Projects/Dentia/dentia-infra
./infra/scripts/put-ssm-secrets.sh
```

This adds all secrets including GHL to AWS Systems Manager Parameter Store:
- `/dentia/shared/GHL_API_KEY` (SecureString)
- `/dentia/shared/GHL_LOCATION_ID`
- `/dentia/frontend/GHL_API_KEY` (SecureString)
- `/dentia/frontend/GHL_LOCATION_ID`
- `/dentia/frontend/NEXT_PUBLIC_GHL_WIDGET_ID`
- `/dentia/frontend/NEXT_PUBLIC_GHL_LOCATION_ID`
- `/dentia/frontend/NEXT_PUBLIC_GHL_CALENDAR_ID`

---

## ⚠️ IMPORTANT: Git and Credentials

### Files That Should NEVER Be Committed

The following files contain your actual credentials and are in `.gitignore`:

- `.env.ghl` - Contains actual GHL credentials
- `.env.ghl.sh` - Generated script with actual credentials
- `apps/frontend/.env.local` - Contains actual environment variables

### Files Safe to Commit

These files contain placeholders and examples only:

- `.env.ghl.example` - Template with placeholders
- `apps/frontend/.env.local.example` - Template with placeholders
- `scripts/setup-ghl.sh` - Setup script (contains credentials but should be replaced with variables in the future)

**Always double-check before committing!**

```bash
# Check what's staged
git status

# If you accidentally staged credential files:
git reset .env.ghl .env.ghl.sh apps/frontend/.env.local
```

---

## 🔒 Security Notes

### Server-side vs Client-side

**Server-side Only (Secure)**:
- `GHL_API_KEY` - Full API access, never expose to client
- `GHL_LOCATION_ID` - Used in API calls (also used client-side for widget)

**Client-side Safe (Public)**:
- `NEXT_PUBLIC_GHL_WIDGET_ID` - Only allows chat interaction
- `NEXT_PUBLIC_GHL_LOCATION_ID` - Used as widget attribute
- `NEXT_PUBLIC_GHL_CALENDAR_ID` - Only allows booking interaction

### Best Practices

1. ✅ **Never commit** API keys to Git
2. ✅ **Use environment variables** for all credentials
3. ✅ **Use SecureString** in AWS SSM for API keys
4. ✅ **Rotate API keys** periodically
5. ✅ **Monitor API usage** in GHL dashboard

---

## 📝 Implementation Checklist

### 1. Environment Setup
- [ ] Run `./scripts/setup-ghl.sh` or manually add to `.env.local`
- [ ] Verify variables are set: `echo $NEXT_PUBLIC_GHL_WIDGET_ID`

### 2. Add Chat Widget

Edit `apps/frontend/apps/web/app/layout.tsx`:

```tsx
import { GHLChatWidget } from '@kit/shared/gohighlevel';

export default async function RootLayout({ children }) {
  // ... existing code ...
  
  return (
    <html>
      <body>
        {/* ... existing providers ... */}
        {children}
        
        {/* Add this */}
        <GHLChatWidget />
      </body>
    </html>
  );
}
```

### 3. Test Features

```bash
# Start dev server
pnpm run dev

# Test chat
open http://localhost:3000

# Test calendar
open http://localhost:3000/home/booking
```

### 4. Verify Integration

**Chat Widget**:
- [ ] Chat button appears (usually bottom-right)
- [ ] Click opens chat interface
- [ ] Can send messages
- [ ] Messages appear in GHL dashboard

**Calendar**:
- [ ] Calendar loads with available dates
- [ ] Can select date and time
- [ ] Form collects required information
- [ ] Booking completes successfully
- [ ] Appointment appears in GHL

**Contact Sync** (already active):
- [ ] New user registration syncs to GHL
- [ ] Contact has correct tags
- [ ] Data is merged not replaced

---

## 🧪 Testing Commands

```bash
# Check environment variables
echo $GHL_API_KEY
echo $GHL_LOCATION_ID
echo $NEXT_PUBLIC_GHL_WIDGET_ID
echo $NEXT_PUBLIC_GHL_LOCATION_ID
echo $NEXT_PUBLIC_GHL_CALENDAR_ID

# Test API connection (from server-side)
curl -X GET "https://services.leadconnectorhq.com/contacts" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json"

# Test calendar URL (should open in browser)
open "https://api.leadconnectorhq.com/widget/bookings/YOUR_CALENDAR_ID"

# Check logs for GHL messages
pnpm run dev | grep GHL
```

---

## 📚 Documentation

- **Quick Start**: [GOHIGHLEVEL_QUICK_START_CHAT_CALENDAR.md](./GOHIGHLEVEL_QUICK_START_CHAT_CALENDAR.md)
- **Full Guide**: [GOHIGHLEVEL_CHAT_CALENDAR_INTEGRATION.md](./GOHIGHLEVEL_CHAT_CALENDAR_INTEGRATION.md)
- **Examples**: [GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md](./GOHIGHLEVEL_IMPLEMENTATION_EXAMPLES.md)
- **Main README**: [GOHIGHLEVEL_README.md](./GOHIGHLEVEL_README.md)

---

## 🔄 Your Chat Widget Code

For reference, this is your actual chat widget implementation:

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

The `GHLChatWidget` component has been updated to match this exact implementation structure.

---

## ✅ Ready to Go!

Your credentials are configured and ready to use. Just:

1. Run the setup script or add to `.env.local`
2. Add `<GHLChatWidget />` to your layout
3. Start testing!

**Need help?** Check the documentation files listed above.

