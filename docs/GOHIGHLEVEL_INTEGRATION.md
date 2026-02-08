# GoHighLevel Integration

This document describes the GoHighLevel CRM integration for Dentia.

## Overview

When a user registers in Dentia, their contact information is automatically synced to GoHighLevel with the tag "registered user". The integration uses the **upsert** endpoint to ensure that:

- Existing contacts are updated (not replaced)
- Tags are **merged** with existing tags (not overwritten)
- Contact data is preserved and enriched

## Configuration

### Required Environment Variables

Add these variables to your environment configuration:

```bash
# GoHighLevel API Configuration
GHL_API_KEY=your-gohighlevel-api-key
GHL_LOCATION_ID=your-gohighlevel-location-id
```

### Where to Add Environment Variables

#### Local Development

Add to `apps/frontend/.env.local`:

```bash
# GoHighLevel Integration (Optional for local dev)
GHL_API_KEY=your-api-key
GHL_LOCATION_ID=your-location-id
```

#### Docker Compose

Already configured in `docker-compose.yml` - just set the environment variables:

```bash
export GHL_API_KEY=your-api-key
export GHL_LOCATION_ID=your-location-id
docker-compose up
```

#### Production (AWS)

Add to AWS Systems Manager Parameter Store or your production environment configuration:

```bash
/dentia/production/GHL_API_KEY
/dentia/production/GHL_LOCATION_ID
```

## How to Get GoHighLevel Credentials

### 1. Get Your API Key

1. Log in to your GoHighLevel account
2. Go to **Settings** → **Company** → **API Keys**
3. Click **Create API Key**
4. Give it a name (e.g., "Dentia Integration")
5. Copy the API key and save it securely

### 2. Get Your Location ID

1. In GoHighLevel, go to **Settings** → **Business Profile**
2. Your Location ID is visible in the URL or can be found in the API response when you query your locations
3. Alternatively, use the GoHighLevel API to list your locations:

```bash
curl -X GET "https://services.leadconnectorhq.com/locations" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Version: 2021-07-28"
```

## Features

### Automatic Contact Sync

When a user signs up:

1. User creates an account in Dentia
2. Contact is automatically synced to GoHighLevel
3. Multiple tags are added based on where they registered:
   - **"registered user"** - Always added
   - **Subdomain tag** - Either "hub-signup" (from hub.dentiaapp.com) or "main-app-signup" (from www.dentiaapp.com)
   - **Domain tag** - One of: "domain-dentia-ca", "domain-dentia-co", "domain-dentiaapp-com", or "domain-dentia-app"
4. If the contact already exists:
   - Existing data is preserved
   - Tags are merged (not replaced)
   - Name and other fields are updated if they were empty

### Tag Examples

**User signs up from hub.dentiaapp.com:**
- Tags: `["registered user", "hub-signup", "domain-dentiaapp-com"]`

**User signs up from www.dentia.ca:**
- Tags: `["registered user", "main-app-signup", "domain-dentia-ca"]`

**User signs up from hub.dentia.app:**
- Tags: `["registered user", "hub-signup", "domain-dentia-app"]`

### What Gets Synced

- **Email** (required)
- **Name** (first name and last name)
- **Tags**: Multiple tags based on registration context:
  - "registered user" (always added)
  - Subdomain tags: "hub-signup" or "main-app-signup"
  - Domain tags: "domain-dentia-ca", "domain-dentia-co", "domain-dentiaapp-com", or "domain-dentia-app"
- **Source**: "Dentia App Registration"
- **Custom Fields** (future enhancement)

### Graceful Degradation

The integration is designed to fail gracefully:

- If GHL credentials are not configured, integration is disabled
- If GHL API fails, user signup still succeeds
- All GHL operations are logged for debugging
- No user-facing errors from GHL failures

## Testing

### 1. Enable Integration

Set your environment variables:

```bash
export GHL_API_KEY=your-api-key
export GHL_LOCATION_ID=your-location-id
```

### 2. Register a Test User

1. Go to http://localhost:3000/auth/sign-up
2. Create a new account with a test email
3. Complete the signup process

### 3. Verify in GoHighLevel

1. Log in to GoHighLevel
2. Go to **Contacts**
3. Search for the test email
4. Verify:
   - Contact exists
   - Tag "registered user" is present
   - Name is correctly set
   - Source shows "Dentia App Registration"

### 4. Check Logs

View the logs to see the integration in action:

```bash
# Frontend logs (where the integration runs)
cd apps/frontend
pnpm run dev

# Look for log entries like:
# [GoHighLevel] Upserting contact
# [GoHighLevel] Contact upserted successfully
```

## Troubleshooting

### Integration Not Working

**Check if integration is enabled:**

```bash
# Ensure environment variables are set
echo $GHL_API_KEY
echo $GHL_LOCATION_ID
```

**Check logs for warnings:**

Look for: `[GoHighLevel] Integration disabled - missing configuration`

### API Errors

**Invalid API Key:**
- Error: 401 Unauthorized
- Solution: Verify your API key is correct and active

**Invalid Location ID:**
- Error: 400 Bad Request
- Solution: Verify your location ID is correct

**Rate Limiting:**
- Error: 429 Too Many Requests
- Solution: GoHighLevel has rate limits. Requests are logged and will be retried

### Contact Not Appearing in GoHighLevel

1. **Check if contact exists with different email**
   - Search in GoHighLevel by name
   - The upsert endpoint matches by email

2. **Check tags**
   - Contact might exist but tag wasn't added
   - Manually add "registered user" tag to test

3. **Check logs**
   - Look for error messages in console
   - Check `[GoHighLevel]` log entries

## Architecture

### Service Location

```
apps/frontend/packages/shared/src/gohighlevel/
├── gohighlevel.service.ts   # Main service implementation
└── index.ts                   # Exports
```

### Integration Point

The integration is called from the signup route:

```
apps/frontend/apps/web/app/api/auth/sign-up/route.ts
```

After successful user provisioning, the service syncs the contact to GoHighLevel.

### API Endpoint Used

```
POST https://services.leadconnectorhq.com/contacts/upsert
```

This endpoint ensures that:
- Existing contacts are updated
- Tags are merged (not replaced)
- Data is preserved and enriched

## Future Enhancements

### Potential Features

1. **Custom Fields**
   - Sync user metadata to GHL custom fields
   - Track signup source, plan type, etc.

2. **Tag Management**
   - Add tags based on user actions
   - Remove tags on certain events
   - Tag based on subscription status

3. **Webhook Integration**
   - Receive updates from GoHighLevel
   - Two-way sync for contact updates

4. **Batch Operations**
   - Bulk sync existing users
   - Scheduled sync jobs

5. **Advanced Tracking**
   - Track user activity in GHL
   - Create opportunities/deals
   - Update custom fields based on usage

### Extending the Service

To add custom functionality, modify:

```typescript
// apps/frontend/packages/shared/src/gohighlevel/gohighlevel.service.ts

class GoHighLevelService {
  // Add your custom methods here
  
  async addTagToContact(email: string, tag: string) {
    // Implementation
  }
  
  async trackEvent(email: string, eventName: string, metadata: any) {
    // Implementation
  }
}
```

## Security

### API Key Storage

- **Never commit API keys to git**
- Use environment variables
- In production, use AWS Parameter Store or similar
- Rotate keys periodically

### Service Implementation

- Runs server-side only (uses 'server-only' directive)
- API key never exposed to client
- All requests authenticated with Bearer token
- Errors logged without exposing sensitive data

## Support

For GoHighLevel API documentation, visit:
- API Docs: https://highlevel.stoplight.io/
- Support: https://help.gohighlevel.com/

For Dentia-specific issues:
- Check logs in the application
- Review error messages
- Contact your development team

---

**Integration Status**: ✅ Active (when configured)  
**Last Updated**: November 2025  
**Version**: 1.0.0

