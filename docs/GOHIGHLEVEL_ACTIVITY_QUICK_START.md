# GoHighLevel Activity Tracking - Quick Start 🚀

## What's New?

Your GoHighLevel integration now tracks user activity from DentiaHub (Discourse forum) and automatically adds tags when users:

1. **Join a Group** → Tags: `joined-group-{name}`, `hub-engaged`
2. **Watch/Track a Category** → Tags: `watching-category-{name}`, `hub-engaged`

✅ **All tags are MERGED** - existing tags and contact data are preserved  
✅ **Runs in background** - won't slow down Discourse  
✅ **Graceful failure** - GHL errors won't break the forum  

## 5-Minute Setup

### Step 1: Set Environment Variables

#### In DentiaHub (Discourse)

Add to `dentiahub/docker-compose.yml` or ECS task definition:

```bash
DENTIA_API_URL=https://app.dentiaapp.com
INTERNAL_API_KEY=generate-a-secure-random-key-here
```

Generate a secure key:
```bash
openssl rand -hex 32
```

#### In Dentia App

Add to `dentia/apps/frontend/.env.local` or production environment:

```bash
INTERNAL_API_KEY=same-key-as-above
```

### Step 2: Deploy

#### Deploy Dentia API (has new endpoint)

```bash
cd dentia/apps/frontend
pnpm run dev  # For local testing

# For production, deploy via your normal process
```

#### Deploy DentiaHub (has new plugin)

```bash
cd dentiahub
./scripts/build-and-deploy-discourse.sh
```

Or manually:
```bash
docker build -t your-registry/dentiahub:latest .
docker push your-registry/dentiahub:latest

aws ecs update-service \
  --cluster dentia-cluster \
  --service dentiahub-production-discourse \
  --force-new-deployment \
  --region us-east-2 \
  --profile dentia
```

### Step 3: Verify

1. **Check Plugin is Loaded**:
   - Go to Discourse Admin → Plugins
   - Look for "dentiahub-gohighlevel-sync"

2. **Test Group Join**:
   - Join any group in DentiaHub
   - Check logs:
     ```bash
     aws logs tail /ecs/dentiahub-production/discourse --follow
     # Look for: [DentiaHub GHL Sync] Successfully added tags
     ```
   - Check GoHighLevel contact has new tags

3. **Test Category Watch**:
   - Watch any category (click bell icon → "Watching")
   - Check logs for success message
   - Verify tags in GoHighLevel

## Tag Examples

### User Journey

**Step 1**: User signs up  
Tags: `["registered user", "main-app-signup", "domain-dentiaapp-com"]`

**Step 2**: User joins "Beta Testers" group in DentiaHub  
Tags: `["registered user", "main-app-signup", "domain-dentiaapp-com", "joined-group-beta-testers", "hub-engaged"]`

**Step 3**: User watches "Announcements" category  
Tags: `["registered user", "main-app-signup", "domain-dentiaapp-com", "joined-group-beta-testers", "hub-engaged", "watching-category-announcements"]`

## Configuration

### Enable/Disable Tracking

In Discourse Admin UI:
1. Admin → Settings → Plugins
2. Find `dentiahub_ghl_sync_enabled`
3. Toggle on/off

Default: **Enabled**

## What Gets Tracked?

### Groups
- ✅ User joins any group → `joined-group-{group-name}`
- ✅ Adds `hub-engaged` tag

### Categories
- ✅ User sets notification to "Watching" → `watching-category-{slug}`
- ✅ User sets notification to "Tracking" → `tracking-category-{slug}`
- ✅ Adds `hub-engaged` tag
- ❌ "Normal" and "Muted" levels are NOT tracked

## Files Changed

### New Files
- ✅ `dentia/apps/frontend/apps/web/app/api/gohighlevel/add-tags/route.ts` (API endpoint)
- ✅ `dentiahub/plugins/dentiahub-gohighlevel-sync/plugin.rb` (Discourse plugin)
- ✅ `dentiahub/plugins/dentiahub-gohighlevel-sync/settings.yml` (Plugin settings)

### Modified Files
- ✅ `dentia/apps/frontend/packages/shared/src/gohighlevel/gohighlevel.service.ts` (Added `addContactTags` method)

## Troubleshooting

### Tags Not Showing Up?

**Check these in order:**

1. ✅ GHL credentials configured?
   ```bash
   # In dentia app
   echo $GHL_API_KEY
   echo $GHL_LOCATION_ID
   ```

2. ✅ INTERNAL_API_KEY set and matching?
   ```bash
   # Must be same in both DentiaHub and Dentia API
   echo $INTERNAL_API_KEY
   ```

3. ✅ Plugin enabled?
   - Check Discourse Admin → Plugins

4. ✅ Check logs:
   ```bash
   # DentiaHub logs
   aws logs tail /ecs/dentiahub-production/discourse --follow
   
   # Look for errors or success messages
   ```

### Common Issues

| Problem | Solution |
|---------|----------|
| 401 Unauthorized | INTERNAL_API_KEY mismatch or not set |
| 400 Bad Request | Email/tags validation failed - check format |
| Plugin not listed | Plugin not loaded - check Dockerfile includes plugin directory |
| No logs appear | Check `DENTIA_API_URL` is correct |
| GHL API errors | Check GHL credentials and API limits |

## Testing Without Deployment

### Test the API Endpoint Locally

```bash
# Start Dentia app locally
cd dentia/apps/frontend
pnpm run dev

# In another terminal, test the endpoint
curl -X POST http://localhost:3000/api/gohighlevel/add-tags \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-internal-api-key" \
  -d '{
    "email": "test@example.com",
    "tags": ["test-tag", "hub-engaged"],
    "source": "Manual Test"
  }'

# Should return:
# {"success":true,"contactId":"...","email":"test@example.com","tags":["test-tag","hub-engaged"]}
```

### Test Without INTERNAL_API_KEY (Development)

If `INTERNAL_API_KEY` is not set, the endpoint allows unauthenticated access for local testing.

**Production**: Always set `INTERNAL_API_KEY` for security!

## Next Steps

Once working:
1. Monitor logs for 24-48 hours
2. Check GoHighLevel contacts have proper tags
3. Create GoHighLevel automations based on new tags:
   - Send welcome email to users who join groups
   - Notify sales team when users watch product categories
   - Create segments for "hub-engaged" users

## Need More Info?

See full documentation: `dentia/GOHIGHLEVEL_ACTIVITY_TRACKING.md`

