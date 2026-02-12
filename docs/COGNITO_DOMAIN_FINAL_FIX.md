# Cognito Domain Issue - Final Fix

## What We Discovered

The actual Cognito domain is **`parlae-auth.auth.us-east-2.amazoncognito.com`**, not `parlae-auth-2026`.

### Investigation Results:

1. **User Pool**: `us-east-2_DiKONDdME` (name: `parlae-user-pool`)
2. **Domain**: `parlae-auth` 
3. **Full Hosted UI Domain**: `parlae-auth.auth.us-east-2.amazoncognito.com`
4. **App Client ID**: `389m79tk1dhn1v5122ivajamdm`
5. **Google Identity Provider**: ✅ Configured
6. **Callback URL**: ✅ `https://app.parlae.ca/api/auth/callback/cognito`

## The Fix Applied

Updated SSM Parameter:
```bash
aws ssm put-parameter \
  --name "/parlae/frontend/COGNITO_DOMAIN" \
  --value "parlae-auth.auth.us-east-2.amazoncognito.com" \
  --type "SecureString" \
  --overwrite \
  --region us-east-2 \
  --profile parlae
```

## Verification

Test the Cognito domain directly:
```bash
curl -I "https://parlae-auth.auth.us-east-2.amazoncognito.com/oauth2/authorize?response_type=code&client_id=389m79tk1dhn1v5122ivajamdm&redirect_uri=https://app.parlae.ca/api/auth/callback/cognito"
```

Should return HTTP 302 (redirect) - ✅ Confirmed working!

## Wait for Deployment

The ECS service has been restarted, but old tasks may still be serving traffic during the drain period (up to 5 minutes).

Check when it's fully deployed:
```bash
# Should show: "parlae-auth.auth.us-east-2.amazoncognito.com"
curl -s https://app.parlae.ca/version | jq -r '.cognitoDomain'
```

Once the new tasks are live, Google OAuth will work correctly!

## Why parlae-auth-2026 Didn't Work

- The domain `parlae-auth-2026` was never created in Cognito
- The actual domain registered is `parlae-auth`
- AWS Cognito adds `.auth.{region}.amazoncognito.com` automatically
- Full URL: `https://parlae-auth.auth.us-east-2.amazoncognito.com`

## Next Steps

Wait 2-5 minutes for:
1. Old ECS tasks to drain
2. New tasks to become healthy
3. Load balancer to route to new tasks

Then test Google sign-up at https://app.parlae.ca/auth/sign-up
