# GoHighLevel API Update Guide

## ⚠️ Action Required: Update Your GHL API Credentials

GoHighLevel has deprecated the old API token format (tokens starting with `pit-`). You need to generate new API credentials to continue using the GHL integration.

## Current Status

Your current configuration in `config.sh`:
- ❌ **Old API Key Format**: `pit-05c59416-70a6-4e2f-9cb6-466a18410676` (no longer valid)
- ✓ **Location ID**: `dIKzdXsNArISLRIrOnHI` (still valid)

## Quick Start: Get New API Key

### Step 1: Log in to GoHighLevel

Visit: https://app.gohighlevel.com/

### Step 2: Navigate to API Settings

**Option A - Direct Link:**
https://app.gohighlevel.com/settings/company

**Option B - Navigation Menu:**
1. Click on **Settings** (gear icon)
2. Select **Company Settings**
3. Click on **API Keys** tab

### Step 3: Create New API Key

1. Click the **"+ Create API Key"** or **"Create New"** button
2. Enter a name for the key:
   - Suggested name: `Parlae Integration` or `Parlae Production`
3. Click **Create** or **Save**
4. **Copy the API key immediately** - you won't be able to see it again!

### Step 4: Update config.sh

Edit your `config.sh` file:

```bash
# Update this line with your new API key
export GHL_API_KEY="your-new-api-key-here"  # Replace with the key you just copied
export GHL_LOCATION_ID="dIKzdXsNArISLRIrOnHI"  # Keep this the same
```

### Step 5: Verify Configuration

Run the test script to verify your new credentials:

```bash
./scripts/test-ghl-api.sh
```

You should see:
- ✓ Configuration loaded
- ✓ Authentication successful
- ✓ Location ID is valid
- ✓ Test contact created successfully

## What Changed?

### Old API Token Format
```
pit-05c59416-70a6-4e2f-9cb6-466a18410676
```
- Prefix: `pit-` (Private Integration Token)
- **Status**: ❌ Deprecated by GoHighLevel
- **Error**: "Unauthorized, Switch to the new API token."

### New API Token Format
```
Example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
- Format: JWT token or new key format
- **Status**: ✓ Current and supported
- **Location**: Settings → Company → API Keys

## Update Checklist

- [ ] Log in to GoHighLevel
- [ ] Navigate to Settings → Company → API Keys
- [ ] Create new API key with name "Parlae Integration"
- [ ] Copy the new API key
- [ ] Update `config.sh` with new `GHL_API_KEY`
- [ ] Run test script: `./scripts/test-ghl-api.sh`
- [ ] Verify all tests pass
- [ ] Update production environment variables (if deployed)

## Where to Update

### 1. Local Development (`config.sh`)

```bash
# /Users/shaunk/Projects/dentia/config.sh
export GHL_API_KEY="your-new-api-key"
```

### 2. Docker Environment

If using docker-compose, make sure the updated config.sh is sourced:

```bash
source config.sh
docker-compose up
```

### 3. Production (AWS)

Update AWS Systems Manager Parameter Store:

```bash
aws ssm put-parameter \
  --name "/parlae/production/GHL_API_KEY" \
  --value "your-new-api-key" \
  --type "SecureString" \
  --overwrite
```

### 4. Frontend Environment Variables

If you have a separate `.env.local` file:

```bash
# dentia/apps/frontend/.env.local
GHL_API_KEY=your-new-api-key
GHL_LOCATION_ID=dIKzdXsNArISLRIrOnHI
```

## Verifying the Location ID

Your Location ID is still valid. However, if you need to verify or find it:

### Method 1: From URL

When logged into GoHighLevel, look at the URL:
```
https://app.gohighlevel.com/location/[YOUR-LOCATION-ID]/dashboard
```

### Method 2: From Business Profile

1. Go to **Settings** → **Business Profile**
2. The Location ID is visible in the settings

### Method 3: Using API (after getting new key)

```bash
curl -X GET "https://services.leadconnectorhq.com/locations" \
  -H "Authorization: Bearer YOUR_NEW_API_KEY" \
  -H "Version: 2021-07-28"
```

## Testing After Update

### Automated Test

```bash
./scripts/test-ghl-api.sh
```

This will:
1. ✓ Verify API authentication
2. ✓ Validate location ID
3. ✓ Create a test contact
4. ✓ Update contact with tags
5. ✓ Verify tag merging works

### Manual Test

1. Start your application:
   ```bash
   cd dentia
   ./dev.sh
   ```

2. Register a new test user at: http://localhost:3000/auth/sign-up

3. Check GoHighLevel Contacts:
   - Log in to GHL
   - Go to **Contacts**
   - Search for the test user's email
   - Verify the contact exists with tags: `["registered user", "main-app-signup", ...]`

## Troubleshooting

### Still Getting 401 Unauthorized

**Possible Causes:**
1. API key wasn't copied correctly (has spaces or line breaks)
2. API key was copied from wrong location
3. API key hasn't been activated yet

**Solution:**
- Delete the old key and create a new one
- Copy directly to clipboard (avoid copy/paste from notes)
- Wait a few minutes for API key to activate

### API Key Not Working After Update

**Solution:**
```bash
# Clear any cached environment variables
unset GHL_API_KEY

# Re-source the config
source config.sh

# Verify it's set correctly
echo $GHL_API_KEY

# Run test again
./scripts/test-ghl-api.sh
```

### Can't Find API Keys Section

**GoHighLevel Interface Changes:**

If the API Keys section is in a different location:
1. Use search in GHL: Type "API" in the search bar
2. Check under: Settings → Integrations → API Keys
3. Check under: Settings → Advanced → API Keys
4. Contact GHL support if still can't find it

### Production Environment Not Updated

After updating config.sh locally, you need to:

1. **Update environment variables in AWS:**
   ```bash
   # Export from config
   source config.sh
   
   # Update AWS Parameter Store
   aws ssm put-parameter \
     --name "/parlae/production/GHL_API_KEY" \
     --value "$GHL_API_KEY" \
     --type "SecureString" \
     --overwrite \
     --profile parlae
   ```

2. **Restart production services:**
   ```bash
   # If using ECS, restart the frontend service
   aws ecs update-service \
     --cluster parlae-production \
     --service frontend \
     --force-new-deployment \
     --profile parlae
   ```

## Security Best Practices

### ✅ DO

- Store API keys in environment variables
- Keep `config.sh` in `.gitignore`
- Rotate API keys periodically
- Use different API keys for dev/staging/production
- Delete old API keys after migration

### ❌ DON'T

- Commit API keys to git
- Share API keys in Slack/email
- Use production API keys in development
- Store API keys in code files

## Support

### GoHighLevel Documentation
- **API Docs**: https://highlevel.stoplight.io/
- **Support**: https://help.gohighlevel.com/
- **Community**: https://community.gohighlevel.com/

### Parlae/Dentia Documentation
- **GHL Integration**: `/dentia/docs/GOHIGHLEVEL_INTEGRATION.md`
- **Setup Guide**: `/dentia/docs/GOHIGHLEVEL_SETUP_SUMMARY.md`
- **Testing Guide**: `/dentia/docs/GOHIGHLEVEL_TESTING.md`

## Quick Reference

### Test Command
```bash
./scripts/test-ghl-api.sh
```

### Config File Location
```bash
/Users/shaunk/Projects/dentia/config.sh
```

### Current Values
```bash
# Old (invalid)
GHL_API_KEY="pit-05c59416-70a6-4e2f-9cb6-466a18410676"

# Still valid
GHL_LOCATION_ID="dIKzdXsNArISLRIrOnHI"
GHL_WIDGET_ID="69795c937894ccd5ccb0ff29"
GHL_CALENDAR_ID="B2oaZWJp94EHuPRt1DQL"
```

---

**Status**: 🔴 Action Required  
**Priority**: High  
**Estimated Time**: 5 minutes  
**Last Updated**: January 28, 2026

