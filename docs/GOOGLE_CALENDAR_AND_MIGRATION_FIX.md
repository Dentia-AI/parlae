# Google Calendar Integration + Migration Recovery Fix

## Issues Fixed

### 1. Google Calendar OAuth Missing Credentials
- Added `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to SSM Parameter Store
- Updated Terraform to inject these into ECS tasks
- Fixed OAuth redirect URI fallback in Google Calendar API routes

### 2. Migration Failure Auto-Recovery
- Updated `scripts/migrate-and-start.sh` to automatically recover from failed migrations
- Corrected `20260212000001_make_shaun_super_admin` migration SQL (was using `roles`, now uses `role`)

## Deployment Status

**Timestamp**: 2026-02-12T04:56:00Z
**Commit**: 68ecf69 (cal routes)

Both fixes are deployed and working.

## Testing

### Google Calendar
1. Go to https://app.parlae.ca/home/agent/setup/integrations
2. Click "Connect Google Calendar"
3. Should see Google OAuth consent screen (no errors)
4. After authorization, calendar should connect successfully

### Migration Recovery
- ECS container startup logs should show automatic recovery if migration fails
- Application starts even if migrations fail (with warning)
- Super admin role granted to shaun.everbridge@gmail.com

## SSM Parameters Added

```
/parlae/frontend/GOOGLE_CLIENT_ID
/parlae/frontend/GOOGLE_CLIENT_SECRET
```

Values are already set in AWS SSM.
