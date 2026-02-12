# Chat Widget Fix - Production Deployment

**Date**: February 11, 2026  
**Status**: ⚠️ Requires GitHub Secrets Setup

## Issue

The GoHighLevel chat widget was not loading in production at parlae.ca because the environment variables were not being passed during the Docker build process.

## Root Cause

- ✅ Widget is correctly implemented in code (`GHLChatWidget` component)
- ✅ Widget is correctly included in root layout
- ✅ Dockerfile has ARG and ENV declarations for GHL variables
- ❌ **GitHub Actions workflow was NOT passing the build arguments**
- ❌ **GitHub Secrets were NOT configured**

## Fix Applied

Updated `.github/workflows/deploy-frontend.yml` to pass GHL build arguments:

```yaml
--build-arg NEXT_PUBLIC_GHL_WIDGET_ID="${{ secrets.GHL_WIDGET_ID }}" \
--build-arg NEXT_PUBLIC_GHL_LOCATION_ID="${{ secrets.GHL_LOCATION_ID }}" \
```

## Required GitHub Secrets

You need to add these secrets to your GitHub repository:

### How to Add Secrets:
1. Go to: https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions
2. Click "New repository secret"
3. Add each secret below

### Secrets to Add:

| Secret Name | Value | Source |
|-------------|-------|--------|
| `GHL_WIDGET_ID` | `691e8abd467a1f1c86f74fbf` | From `.env.local` |
| `GHL_LOCATION_ID` | `J37kckNEAfKpTFpUSEah` | From `.env.local` |

**Note**: The calendar ID is optional and not currently used by the widget.

## How the Widget Works

The `GHLChatWidget` component (line 65 in `app/layout.tsx`):

1. Checks if `NEXT_PUBLIC_GHL_WIDGET_ID` is set
2. If not set, logs warning: `[GHL Chat] Widget ID not configured - chat widget disabled`
3. If set, loads the GoHighLevel widget script from `https://widgets.leadconnectorhq.com/loader.js`
4. Creates a widget container with the widget ID
5. Widget appears as a floating chat button on the page

## Files Modified

1. `.github/workflows/deploy-frontend.yml` - Added GHL build arguments

## Next Steps

### 1. Add GitHub Secrets (REQUIRED)

Run these commands or add manually via GitHub UI:

```bash
# Using GitHub CLI (if installed)
gh secret set GHL_WIDGET_ID --body "691e8abd467a1f1c86f74fbf"
gh secret set GHL_LOCATION_ID --body "J37kckNEAfKpTFpUSEah"
```

OR add them manually at:
- https://github.com/YOUR_USERNAME/parlae/settings/secrets/actions

### 2. Deploy to Production

After adding the secrets:
1. Commit and push these changes
2. Trigger a new deployment
3. The chat widget will appear on app.parlae.ca

### 3. Verify

After deployment:
1. Visit https://app.parlae.ca
2. Look for the floating chat widget button (usually bottom-right corner)
3. Check browser console for: `[GHL Chat] Widget loaded successfully`

## Troubleshooting

If the widget still doesn't appear after deployment:

### Check Browser Console
Look for these messages:
- ✅ Success: `[GHL Chat] Widget loaded successfully`
- ⚠️ Warning: `[GHL Chat] Widget ID not configured - chat widget disabled`
- ❌ Error: `[GHL Chat] Failed to load chat widget script`

### Verify Build-Time Environment Variables
The widget ID must be available at **build time** (not runtime) because it's used in a client component with `process.env.NEXT_PUBLIC_GHL_WIDGET_ID`.

### Check Network Tab
Look for a request to:
- `https://widgets.leadconnectorhq.com/loader.js`
- If this fails, the widget script couldn't load

### Verify Widget ID
The widget ID `691e8abd467a1f1c86f74fbf` should match your GoHighLevel account's widget configuration.

## Local Development

The widget should already work locally since `.env.local` has the correct values:
```env
NEXT_PUBLIC_GHL_WIDGET_ID=691e8abd467a1f1c86f74fbf
NEXT_PUBLIC_GHL_LOCATION_ID=J37kckNEAfKpTFpUSEah
```

## Production Configuration Files

### Dockerfile (`infra/docker/frontend.Dockerfile`)
```dockerfile
# Build arguments
ARG NEXT_PUBLIC_GHL_WIDGET_ID
ARG NEXT_PUBLIC_GHL_LOCATION_ID
ARG NEXT_PUBLIC_GHL_CALENDAR_ID

# Environment variables
ENV NEXT_PUBLIC_GHL_WIDGET_ID=$NEXT_PUBLIC_GHL_WIDGET_ID
ENV NEXT_PUBLIC_GHL_LOCATION_ID=$NEXT_PUBLIC_GHL_LOCATION_ID
ENV NEXT_PUBLIC_GHL_CALENDAR_ID=$NEXT_PUBLIC_GHL_CALENDAR_ID
```

### GitHub Actions (`.github/workflows/deploy-frontend.yml`)
```yaml
--build-arg NEXT_PUBLIC_GHL_WIDGET_ID="${{ secrets.GHL_WIDGET_ID }}" \
--build-arg NEXT_PUBLIC_GHL_LOCATION_ID="${{ secrets.GHL_LOCATION_ID }}" \
```

## Widget Component Code

Located at: `packages/shared/src/gohighlevel/ghl-chat-widget.tsx`

Key features:
- Automatic script loading
- Duplicate prevention
- Error handling
- Console logging for debugging
- Cleanup on unmount
