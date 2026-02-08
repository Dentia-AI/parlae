# GoHighLevel Integration - Quick Start 🚀

## 30-Second Setup

```bash
# 1. Add to apps/frontend/.env.local
GHL_API_KEY=your-api-key-here
GHL_LOCATION_ID=your-location-id-here

# 2. Restart server
cd apps/frontend && pnpm run dev

# 3. Test signup
# Go to http://localhost:3000/auth/sign-up
# Register a new user

# 4. Verify in GoHighLevel
# Contact should appear with "registered user" tag
```

## What It Does

✅ **When**: User registers in Dentia  
✅ **Action**: Contact automatically synced to GoHighLevel  
✅ **Tags Added**: 
  - "registered user" (always)
  - Subdomain tag: "hub-signup" or "main-app-signup"
  - Domain tag: "domain-dentia-ca", "domain-dentia-co", "domain-dentiaapp-com", or "domain-dentia-app"
✅ **Behavior**: Existing tags MERGED (not replaced)  
✅ **Failure**: User signup succeeds even if GHL fails

### Tag Examples

- **hub.dentiaapp.com** → `["registered user", "hub-signup", "domain-dentiaapp-com"]`
- **www.dentia.ca** → `["registered user", "main-app-signup", "domain-dentia-ca"]`
- **hub.dentia.app** → `["registered user", "hub-signup", "domain-dentia-app"]`  

## Get Your Credentials

### API Key
1. Log in to GoHighLevel
2. Settings → Company → API Keys
3. Create API Key → Copy

### Location ID
1. GoHighLevel → Settings → Business Profile
2. Or use API:
```bash
curl -X GET "https://services.leadconnectorhq.com/locations" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Verify It's Working

### Check Logs
Look for:
```
[GoHighLevel] Upserting contact
[GoHighLevel] Contact upserted successfully
```

### Check GoHighLevel
1. Go to Contacts
2. Search for test email
3. Verify tags: "registered user" + domain tags
   - Example: `["registered user", "main-app-signup", "domain-dentiaapp-com"]`
4. Verify source: "Dentia App Registration"

## Production Setup

```bash
# AWS Parameter Store (or equivalent)
/dentia/production/GHL_API_KEY
/dentia/production/GHL_LOCATION_ID
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Integration not working | Check env vars are set |
| "Integration disabled" | Set GHL_API_KEY and GHL_LOCATION_ID |
| 401 Error | Verify API key is correct |
| Contact not found | Check location ID |

## Documentation

📚 **Full Docs**:
- `GOHIGHLEVEL_INTEGRATION.md` - Complete guide
- `GOHIGHLEVEL_TESTING.md` - Testing scenarios
- `GOHIGHLEVEL_IMPLEMENTATION_SUMMARY.md` - Technical details

## Key Features

- ✅ Automatic sync on signup
- ✅ Non-blocking (doesn't slow signup)
- ✅ **Domain-based tagging** (tracks where users register from)
- ✅ Tag merging (preserves existing tags)
- ✅ Graceful failure (signup never breaks)
- ✅ Server-side only (secure)
- ✅ Works for employees and account managers

## Test It Now

```bash
# Set your credentials
export GHL_API_KEY=your-key
export GHL_LOCATION_ID=your-location

# Start dev server
cd apps/frontend
pnpm run dev

# Register at http://localhost:3000/auth/sign-up
# Check GoHighLevel Contacts
```

---

**Status**: ✅ Ready to Use  
**Support**: See full documentation in `GOHIGHLEVEL_INTEGRATION.md`

