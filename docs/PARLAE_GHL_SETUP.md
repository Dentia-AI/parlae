# Parlae - GoHighLevel Setup Guide

## Overview

This guide walks you through setting up GoHighLevel (GHL) integration for Parlae, specifically configured for AI voice agent features.

---

## 🔑 Step 1: Get Your GHL Credentials

### 1. API Key (Required)

1. Log in to your GoHighLevel account at https://app.gohighlevel.com
2. Navigate to **Settings** → **Company** → **API Keys**
3. Click **"Create API Key"**
4. Give it a name: `Parlae Integration`
5. Select appropriate permissions (minimum required):
   - **Contacts**: Read, Write
   - **Conversations**: Read, Write (for voice agents)
   - **Calendars**: Read (if using booking)
6. Copy the API key immediately (you won't see it again!)

### 2. Location ID (Required)

**Option A: From URL**
1. Go to your GoHighLevel dashboard
2. Look at the browser URL: `https://app.gohighlevel.com/location/YOUR_LOCATION_ID`
3. Copy the `YOUR_LOCATION_ID` part

**Option B: From API**
```bash
curl -X GET "https://services.leadconnectorhq.com/locations" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### 3. Widget ID (Optional - for live chat)

1. Go to **Settings** → **Chat Widget**
2. Look at the embed code provided
3. Find the line: `widgetId: "YOUR_WIDGET_ID"`
4. Copy the widget ID

### 4. Calendar ID (Optional - for booking)

1. Go to **Calendars** in your GHL dashboard
2. Select the calendar you want to use for Parlae
3. Click **"Share"** or **"Embed"**
4. Find the calendar ID in the embed code or URL

---

## 📝 Step 2: Add Credentials to config.sh

Open your `config.sh` file and fill in the GHL section (around line 70):

```bash
#=============================================================================
# GOHIGHLEVEL (GHL) INTEGRATION
#=============================================================================
# Required for AI voice agent configuration and CRM integration
export GHL_API_KEY="your-api-key-here"                    # From Step 1.1
export GHL_LOCATION_ID="your-location-id-here"            # From Step 1.2
export GHL_WIDGET_ID="your-widget-id-here"                # From Step 1.3 (optional)
export GHL_CALENDAR_ID="your-calendar-id-here"            # From Step 1.4 (optional)
```

**Save the file!**

---

## 🔄 Step 3: Update Deployment Scripts

The GHL credentials need to be added to your AWS deployment scripts.

### Update put-ssm-secrets.sh

Edit `/Users/shaunk/Projects/dentia/dentia-infra/infra/scripts/put-ssm-secrets.sh`:

Replace the hardcoded GHL values (lines 94-98) with your actual credentials:

```bash
echo "⚙️  Writing GoHighLevel secrets (PRODUCTION)"
GHL_API_KEY="your-actual-api-key-here"
GHL_LOCATION_ID="your-actual-location-id-here"
GHL_WIDGET_ID="your-actual-widget-id-here"
GHL_CALENDAR_ID="your-actual-calendar-id-here"
```

Or even better, source from config.sh:

```bash
# At the top of put-ssm-secrets.sh, add:
# Source configuration
if [[ -f "../../../config.sh" ]]; then
  source "../../../config.sh"
else
  echo "ERROR: config.sh not found"
  exit 1
fi

echo "⚙️  Writing GoHighLevel secrets (PRODUCTION)"
# Now use the environment variables from config.sh
# GHL_API_KEY, GHL_LOCATION_ID, etc. are already set
```

---

## 💻 Step 4: Configure Local Development

### 🎯 Automated Setup (Recommended)

We've created a script that automatically configures all your local environment files from `config.sh`:

```bash
cd dentia
./setup-local-env.sh
```

This will:
- ✅ Create `apps/frontend/.env.local` with your GHL credentials
- ✅ Create `.env` for docker-compose
- ✅ Create `apps/backend/.env.local` for backend
- ✅ Use all your Parlae settings from `config.sh`
- ✅ Configure GHL integration properly

### Manual Setup (Alternative)

If you prefer to set up manually:

#### For Native Development (./dev.sh)

Add to `dentia/apps/frontend/.env.local`:

```bash
# GoHighLevel Integration
GHL_API_KEY=pit-05c59416-70a6-4e2f-9cb6-466a18410676
GHL_LOCATION_ID=dIKzdXsNArISLRIrOnHI

# Client-side (for chat widget and calendar)
NEXT_PUBLIC_GHL_WIDGET_ID=69795c937894ccd5ccb0ff29
NEXT_PUBLIC_GHL_LOCATION_ID=dIKzdXsNArISLRIrOnHI
NEXT_PUBLIC_GHL_CALENDAR_ID=B2oaZWJp94EHuPRt1DQL
```

#### For Docker Development

The `docker-compose.yml` is already configured to read from environment variables.

Export them before running docker-compose:

```bash
# Source your config
source config.sh

# Start services
cd dentia
docker-compose up
```

Or run the setup script (recommended):

```bash
cd dentia
./setup-local-env.sh
docker-compose up
```

---

## ✅ Step 5: Verify Configuration

### Test Locally

```bash
cd dentia
./dev.sh

# In another terminal, test the configuration
curl http://localhost:4001/health
```

**Check logs for:**
```
[GoHighLevel] Integration enabled
```

If you see:
```
[GoHighLevel] Integration disabled - missing configuration
```

Then credentials are not being loaded properly.

### Test Contact Sync

1. Go to http://localhost:3000/auth/sign-up
2. Register a new test user
3. Check your terminal logs for:
   ```
   [GoHighLevel] Upserting contact for: test@example.com
   [GoHighLevel] Contact upserted successfully: contact_id_here
   ```
4. Verify in GoHighLevel dashboard → Contacts
5. The contact should have the tag: `"registered user"`

---

## 🚀 Step 6: Deploy to Production

Once everything is tested locally:

```bash
# 1. Push secrets to AWS Parameter Store
cd dentia-infra
./infra/scripts/put-ssm-secrets.sh

# 2. Deploy infrastructure (if needed)
cd ../
./setup.sh
# Choose option [4] Deploy Everything

# 3. Verify deployment
# Check ECS logs for GHL integration messages
```

---

## 🎙️ AI Voice Agent Configuration

### Where to Add Voice Agent Logic

Since you mentioned AI voice agent configuration, here are the integration points:

#### 1. **Contact Sync** (Already Working)
When users sign up, they're automatically added to GHL with appropriate tags.

File: `dentia/apps/frontend/packages/shared/src/gohighlevel/gohighlevel.service.ts`

#### 2. **Webhook Handler** (Needs Implementation)
Create a webhook endpoint to receive events from GHL voice agents:

```typescript
// dentia/apps/frontend/apps/web/app/api/gohighlevel/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const payload = await req.json();
  
  // Handle voice agent events
  if (payload.type === 'VoiceCall') {
    // Process voice call data
    // Update user preferences
    // Store conversation logs
  }
  
  return NextResponse.json({ success: true });
}
```

#### 3. **Voice Agent Selection UI** (Needs Implementation)
Create a page for users to configure voice agents:

```typescript
// dentia/apps/frontend/apps/web/app/home/voice-agents/page.tsx
export default function VoiceAgentsPage() {
  // Fetch available voice agents from GHL
  // Display in selection UI
  // Allow user to choose preferred agent
  // Save preferences to database
}
```

#### 4. **GHL API Service Extension**
Extend the existing GHL service to support voice agent operations:

```typescript
// Add to gohighlevel.service.ts
async getVoiceAgents(): Promise<VoiceAgent[]> {
  // Fetch voice agents from GHL API
}

async assignVoiceAgent(contactId: string, agentId: string): Promise<void> {
  // Assign voice agent to contact
}

async getCallHistory(contactId: string): Promise<CallLog[]> {
  // Retrieve call history
}
```

---

## 🔐 Security Best Practices

### ✅ DO:
- Keep `config.sh` in `.gitignore` (already configured)
- Use AWS SSM Parameter Store for production secrets
- Rotate API keys quarterly
- Use minimal permissions for API keys
- Monitor API usage in GHL dashboard

### ❌ DON'T:
- Never commit `config.sh` with real credentials
- Don't share API keys via email/Slack
- Don't use production keys in development
- Don't expose API keys in client-side code (only NEXT_PUBLIC_* vars)

---

## 📊 Configuration Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        config.sh                            │
│  (Your master configuration file - local only)              │
└────────────┬────────────────────────────────────────────────┘
             │
             ├──────────────────┬──────────────────┬───────────────────┐
             ▼                  ▼                  ▼                   ▼
   ┌──────────────────┐ ┌─────────────┐  ┌───────────────┐  ┌──────────────┐
   │ Local Dev        │ │ Docker      │  │ AWS SSM       │  │ ECS          │
   │ (.env.local)     │ │ (.env)      │  │ (Secrets)     │  │ (Production) │
   └──────────────────┘ └─────────────┘  └───────────────┘  └──────────────┘
             │                  │                  │                   │
             ▼                  ▼                  ▼                   ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │             Your Parlae Application                              │
   │  - Contact sync on user registration                             │
   │  - Voice agent integration (your custom logic)                   │
   │  - Chat widget (optional)                                        │
   │  - Calendar booking (optional)                                   │
   └──────────────────────────────────────────────────────────────────┘
```

---

## 🆘 Troubleshooting

### Issue: "Integration disabled - missing configuration"

**Solution:**
1. Verify `GHL_API_KEY` and `GHL_LOCATION_ID` are set in `.env.local`
2. Restart your development server
3. Check for typos in variable names

### Issue: "Contact upsert failed"

**Solution:**
1. Verify API key has correct permissions (Contacts: Write)
2. Check GHL API status: https://status.gohighlevel.com
3. Verify location ID is correct
4. Check API rate limits in GHL dashboard

### Issue: Voice agent not appearing

**Solution:**
1. This requires custom implementation (see Step 6)
2. Voice agents are accessed via GHL API - you'll need to build UI/logic
3. Reference: https://highlevel.stoplight.io/docs/integrations/

### Issue: Widget not loading

**Solution:**
1. Verify `NEXT_PUBLIC_GHL_WIDGET_ID` is set correctly
2. Check browser console for errors
3. Ensure widget ID is from the correct GHL location
4. Widget IDs must start with `NEXT_PUBLIC_` to be exposed to browser

---

## 📚 Next Steps

1. ✅ **Complete this setup guide**
2. ✅ **Test contact sync locally**
3. ⬜ **Build voice agent selection UI**
4. ⬜ **Implement webhook handler for voice agent events**
5. ⬜ **Add voice agent assignment logic**
6. ⬜ **Create admin dashboard for voice agent management**
7. ⬜ **Deploy to production**
8. ⬜ **Monitor and optimize**

---

## 🔗 Useful Links

- **GHL API Documentation**: https://highlevel.stoplight.io/docs/integrations/
- **GHL Support**: https://help.gohighlevel.com
- **API Status**: https://status.gohighlevel.com
- **Your GHL Dashboard**: https://app.gohighlevel.com

---

**Last Updated**: January 27, 2026  
**Project**: Parlae  
**Status**: Configuration Ready - Implementation Needed for Voice Agents

