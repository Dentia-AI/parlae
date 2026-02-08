# GoHighLevel Activity Tracking

## Overview

This document describes the GoHighLevel CRM integration for tracking user activity in DentiaHub (Discourse forum).

When users perform certain actions in DentiaHub, their contact in GoHighLevel is automatically updated with relevant tags. The integration uses **upsert** to ensure existing tags and data are preserved.

## Tracked Activities

### 1. Joining a Group

**Event**: User joins any Discourse group

**Tags Added**:
- `joined-group-{group-name}` (e.g., `joined-group-moderators`, `joined-group-vip-members`)
- `hub-engaged` (indicates active hub participation)

**Example**:
```
User: john@example.com
Action: Joins "VIP Members" group
Tags Added: ["joined-group-vip-members", "hub-engaged"]
Result: Tags are MERGED with existing tags in GoHighLevel
```

### 2. Watching or Tracking a Category

**Event**: User sets notification level to "Watching" or "Tracking" for a category

**Tags Added**:
- `watching-category-{category-slug}` or `tracking-category-{category-slug}`
- `hub-engaged`

**Notification Levels**:
- **Watching** (Level 3): User wants all notifications from this category
- **Tracking** (Level 2): User wants to track new topics in this category
- Normal (Level 1): Not tracked
- Muted (Level 0): Not tracked

**Example**:
```
User: jane@example.com
Action: Watches "Announcements" category
Tags Added: ["watching-category-announcements", "hub-engaged"]
Result: Tags are MERGED with existing tags in GoHighLevel
```

## Tag Preservation

The integration uses GoHighLevel's **upsert** endpoint with the following behavior:

✅ **Existing tags are preserved** - New tags are added to the contact's existing tags  
✅ **Existing data is preserved** - Contact name, phone, custom fields remain unchanged  
✅ **Duplicate prevention** - If a tag already exists, it won't be duplicated  

### Example Tag Merging

**Before:**
```json
{
  "email": "user@example.com",
  "tags": ["registered user", "main-app-signup", "domain-dentiaapp-com"]
}
```

**User joins "Beta Testers" group:**

**After:**
```json
{
  "email": "user@example.com",
  "tags": [
    "registered user",
    "main-app-signup", 
    "domain-dentiaapp-com",
    "joined-group-beta-testers",  ← New tag
    "hub-engaged"                  ← New tag
  ]
}
```

## Architecture

### Flow

```
┌──────────────┐
│  DentiaHub   │
│  (Discourse) │
└──────┬───────┘
       │ 1. User joins group/watches category
       │
       ▼
┌──────────────────────┐
│ Discourse Event Hook │
│  (plugin.rb)         │
└──────┬───────────────┘
       │ 2. Queue background job
       │
       ▼
┌──────────────────────┐
│  Background Job      │
│  (dentia_ghl_sync)   │
└──────┬───────────────┘
       │ 3. HTTP POST
       │
       ▼
┌──────────────────────────────┐
│ Dentia API                   │
│ /api/gohighlevel/add-tags    │
└──────┬───────────────────────┘
       │ 4. Call GHL service
       │
       ▼
┌──────────────────────────────┐
│ GoHighLevel Service          │
│ (gohighlevel.service.ts)     │
└──────┬───────────────────────┘
       │ 5. API call
       │
       ▼
┌──────────────────────────────┐
│ GoHighLevel API              │
│ /v1/contacts/upsert          │
└──────────────────────────────┘
```

## Implementation Details

### 1. GoHighLevel Service

**Location**: `apps/frontend/packages/shared/src/gohighlevel/gohighlevel.service.ts`

**New Method**:
```typescript
async addContactTags(params: {
  email: string;
  tags: string[];
  source?: string;
}): Promise<string | null>
```

This method:
- Validates email and tags
- Uses upsert endpoint to merge tags
- Logs success/failure
- Returns contact ID or null

### 2. Dentia API Endpoint

**Location**: `apps/frontend/apps/web/app/api/gohighlevel/add-tags/route.ts`

**Endpoint**: `POST /api/gohighlevel/add-tags`

**Request**:
```json
{
  "email": "user@example.com",
  "tags": ["joined-group-beta-testers", "hub-engaged"],
  "source": "DentiaHub - Joined Group: Beta Testers"
}
```

**Response**:
```json
{
  "success": true,
  "contactId": "ghl-contact-id",
  "email": "user@example.com",
  "tags": ["joined-group-beta-testers", "hub-engaged"]
}
```

**Security**: Requires `INTERNAL_API_KEY` header if configured

### 3. Discourse Plugin

**Location**: `dentiahub/plugins/dentiahub-gohighlevel-sync/plugin.rb`

**Event Hooks**:
1. `user_added_to_group` - Triggers when user joins a group
2. `category_notification_level_changed` - Triggers when user watches/tracks a category

**Background Job**: `Jobs::DentiaGhlSyncTags` - Processes tag sync asynchronously

## Configuration

### Environment Variables

#### Dentia App (Frontend)

Already configured - no changes needed if you have GHL integration working:

```bash
# .env.local or production environment
GHL_API_KEY=your-gohighlevel-api-key
GHL_LOCATION_ID=your-gohighlevel-location-id
```

#### DentiaHub (Discourse)

Add to `dentiahub/docker-compose.yml` or ECS environment:

```bash
# API endpoint for syncing tags
DENTIA_API_URL=https://app.dentiaapp.com

# Internal API key for secure communication
INTERNAL_API_KEY=your-secure-internal-api-key
```

#### Dentia API (For endpoint security)

Add to `dentia/apps/frontend/.env.local` or production:

```bash
# Internal API key (must match DentiaHub's INTERNAL_API_KEY)
INTERNAL_API_KEY=your-secure-internal-api-key
```

### Discourse Plugin Settings

Enable/disable via Discourse Admin UI:

1. Go to **Admin** → **Settings** → **Plugins**
2. Find **dentiahub-gohighlevel-sync**
3. Toggle `dentiahub_ghl_sync_enabled`

Default: **Enabled**

## Deployment

### 1. Deploy Dentia API Changes

```bash
cd dentia/apps/frontend

# Local testing
pnpm run dev

# Production
# Deploy via your CI/CD pipeline or ECS update
```

### 2. Deploy DentiaHub Plugin

```bash
cd dentiahub

# Build and push Docker image with plugin
./scripts/build-and-deploy-discourse.sh

# Or manually:
docker build -t your-registry/dentiahub:latest .
docker push your-registry/dentiahub:latest

# Update ECS service
aws ecs update-service \
  --cluster dentia-cluster \
  --service dentiahub-production-discourse \
  --force-new-deployment \
  --region us-east-2 \
  --profile dentia
```

### 3. Verify Installation

Check Discourse Admin UI:
1. Admin → Plugins
2. Verify "dentiahub-gohighlevel-sync" is listed

Check logs:
```bash
# DentiaHub logs
aws logs tail /ecs/dentiahub-production/discourse --follow

# Look for:
[DentiaHub GHL Sync] User user@example.com joined group Group Name
[DentiaHub GHL Sync] Successfully added tags to user@example.com
```

## Testing

### Test Group Join

1. Log in to DentiaHub as a test user
2. Join any group via user preferences
3. Check logs for sync messages
4. Verify in GoHighLevel that tags were added

### Test Category Watch

1. Log in to DentiaHub
2. Navigate to any category
3. Click notification bell → "Watching"
4. Check logs for sync messages
5. Verify in GoHighLevel that tags were added

### Test Tag Merging

1. Create a test user with existing tags in GHL
2. Have them join a group in DentiaHub
3. Verify in GHL that:
   - Old tags are still present
   - New tags were added
   - No tags were removed

## Tag Naming Convention

Tags use lowercase with hyphens for consistency:

- **Groups**: `joined-group-{group-name}`
  - Examples: `joined-group-moderators`, `joined-group-beta-testers`

- **Categories**: `{level}-category-{category-slug}`
  - Examples: `watching-category-announcements`, `tracking-category-support`

- **Engagement**: `hub-engaged` (added for any tracked activity)

## Troubleshooting

### Tags Not Appearing in GoHighLevel

**Check**:
1. ✅ `GHL_API_KEY` and `GHL_LOCATION_ID` are configured
2. ✅ `INTERNAL_API_KEY` matches in both DentiaHub and Dentia API
3. ✅ `DENTIA_API_URL` points to correct Dentia app domain
4. ✅ Plugin is enabled in Discourse Admin
5. ✅ Check logs for error messages

### API Returns 401 Unauthorized

**Solution**: Ensure `INTERNAL_API_KEY` is set and matches in both services

### API Returns 400 Bad Request

**Check**: Email and tags array are properly formatted in request

### GoHighLevel API Errors

**Check**: 
- GHL API key is valid
- GHL location ID is correct
- Contact email exists or can be created
- API rate limits not exceeded

### Tags Are Replaced Instead of Merged

**This should not happen** - The upsert endpoint merges tags. If this occurs:
- Check GoHighLevel API version (should be 2021-07-28)
- Verify upsert endpoint is being used (not create/update)
- Check GHL API documentation for changes

## Future Enhancements

Possible additions:
- Track topic creation: `created-topic-in-{category}`
- Track reply activity: `active-in-{category}`
- Track solution acceptance: `solution-provider`
- Track post reactions: `engaged-reactor`
- Configurable tag prefixes via settings
- Selective group/category tracking (whitelist)
- Remove tags when user leaves group/unwatches category

## Support

For issues or questions:
1. Check Discourse logs in CloudWatch
2. Check Dentia API logs
3. Verify GoHighLevel contact in GHL dashboard
4. Review this documentation

## Summary

✅ **Complete Integration**: Tags are added when users join groups or watch categories  
✅ **Safe Upsert**: Existing tags and contact data are preserved  
✅ **Non-Blocking**: Sync happens in background, won't break Discourse  
✅ **Configurable**: Can be enabled/disabled via Discourse Admin UI  
✅ **Logged**: All activity is logged for debugging and monitoring  

