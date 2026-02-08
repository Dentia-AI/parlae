# Local Login Redirect Fix

## Problem
When clicking "Sign In" locally, you're redirected to `app.dentiaapp.com/home` instead of staying on `localhost:3009`.

## Root Cause
Your Cognito User Pool client is configured with production callback URLs only. Cognito won't redirect to localhost unless it's explicitly allowed.

---

## Solution 1: Add Localhost to Cognito Callback URLs (Recommended for Development)

### Via AWS Console:

1. **Go to Cognito Console**: https://console.aws.amazon.com/cognito/v2/
2. **Select your User Pool**
3. **Go to "App integration" tab**
4. **Click on your App client**
5. **Edit "Hosted UI" settings**
6. **Add localhost callback URLs**:

```
Allowed callback URLs:
- https://app.dentiaapp.com/api/auth/callback/cognito  (existing)
- http://localhost:3009/api/auth/callback/cognito       (ADD THIS)
- http://localhost:3000/api/auth/callback/cognito       (ADD THIS)

Allowed sign-out URLs:
- https://app.dentiaapp.com  (existing)
- http://localhost:3009       (ADD THIS)
- http://localhost:3000       (ADD THIS)
```

7. **Save changes**

### Via Terraform (if you manage infrastructure with Terraform):

Edit `dentia-infra/infra/ecs/cognito.tf`:

```terraform
resource "aws_cognito_user_pool_client" "frontend" {
  name                                 = "${local.project_id}-frontend-client"
  user_pool_id                         = aws_cognito_user_pool.main.id
  generate_secret                      = true
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  supported_identity_providers         = ["COGNITO"]

  callback_urls = [
    "https://${var.alb_hostname}/api/auth/callback/cognito",
    "http://localhost:3000/api/auth/callback/cognito",    # ADD THIS
    "http://localhost:3009/api/auth/callback/cognito",    # ADD THIS
  ]
  
  logout_urls = [
    "https://${var.alb_hostname}",
    "http://localhost:3000",    # ADD THIS
    "http://localhost:3009",    # ADD THIS
  ]

  # ... rest of config
}
```

Then apply:
```bash
cd dentia-infra/infra/ecs
terraform apply
```

---

## Solution 2: Create a Separate Cognito Client for Development

This is cleaner and keeps dev/prod separated.

### Via AWS Console:

1. **Go to Cognito Console**
2. **Select your User Pool**
3. **App integration → Create app client**
4. **Configure**:
   - Name: `dentia-local-dev-client`
   - App type: `Confidential client`
   - Generate client secret: `Yes`
   - Allowed callback URLs:
     ```
     http://localhost:3000/api/auth/callback/cognito
     http://localhost:3009/api/auth/callback/cognito
     ```
   - Allowed sign-out URLs:
     ```
     http://localhost:3000
     http://localhost:3009
     ```
   - OAuth flows: `Authorization code grant`
   - OAuth scopes: `email`, `openid`, `profile`

5. **Create**
6. **Copy the Client ID and Client Secret**

### Update your `.env`:

```bash
# Use the NEW local dev client
COGNITO_CLIENT_ID=your-new-local-dev-client-id
COGNITO_CLIENT_SECRET=your-new-local-dev-client-secret
COGNITO_USER_POOL_ID=us-east-2_YourPoolId  # Same pool
COGNITO_ISSUER=https://cognito-idp.us-east-2.amazonaws.com/us-east-2_YourPoolId  # Same issuer
```

### Restart:
```bash
docker-compose down
docker-compose up
```

---

## Solution 3: Use Credentials Provider (No Cognito Redirect)

Bypass Cognito OAuth flow entirely for local development.

### Already enabled in your docker-compose.yml!

```yaml
ENABLE_CREDENTIALS_SIGNIN=true
```

### How to use:

1. **Go to**: http://localhost:3009/auth/sign-in
2. **Look for email/password form** (not the Cognito OAuth button)
3. **Enter**:
   - Email: `test@example.com` (or any email from your database)
   - Password: Your Cognito password

This logs you in directly without OAuth redirects!

**To test with the seeded user:**

```bash
# First, make sure you've seeded the database
cd /Users/shaunk/Projects/Dentia/dentia
./scripts/prepare-testing.sh

# The seed creates: test@example.com
# But you need to set a password in Cognito first
```

---

## Solution 4: Update NEXTAUTH_URL in Environment

Make sure your `.env` has the correct URL:

### Check your `.env` file:

```bash
cat .env
```

### Should have:

```bash
NEXTAUTH_URL=http://localhost:3009
# NOT https://app.dentiaapp.com
```

### Check docker-compose.yml URLs match:

```yaml
frontend:
  environment:
    NEXTAUTH_URL: http://localhost:3009
    APP_BASE_URL: http://localhost:3009
    NEXT_PUBLIC_APP_BASE_URL: http://localhost:3009
```

These should match your port (3009 in your case).

---

## Quick Test

### 1. Check what's configured:

```bash
# View frontend environment
docker-compose exec frontend env | grep -E "(NEXTAUTH_URL|COGNITO)"

# Should show:
# NEXTAUTH_URL=http://localhost:3009
# COGNITO_CLIENT_ID=...
# COGNITO_ISSUER=...
```

### 2. Check Cognito redirect:

When you click "Sign In", check the browser URL bar. You'll see something like:

```
https://dentia-auth.auth.us-east-2.amazoncognito.com/oauth2/authorize?
  client_id=...
  &redirect_uri=http%3A%2F%2Flocalhost%3A3009%2Fapi%2Fauth%2Fcallback%2Fcognito
  ...
```

The `redirect_uri` parameter should be `localhost:3009`.

**If it shows `app.dentiaapp.com`:**
- Your NEXTAUTH_URL is wrong (check .env)
- Or the frontend container didn't pick up the new environment

---

## Recommended Approach

**For Quick Local Development:**

Use **Solution 3** (Credentials Provider) - it's already enabled!

1. Go to http://localhost:3009/auth/sign-in
2. Use email/password form (not OAuth button)
3. Login with: `test@example.com` + your Cognito password

**For Testing OAuth Flow:**

Use **Solution 1** or **Solution 2** to add localhost to Cognito callbacks.

---

## Troubleshooting

### Still redirecting to production?

**Clear browser cache and cookies:**
```bash
# Chrome DevTools (F12) → Application → Clear site data
# Or use Incognito/Private window
```

**Rebuild frontend container:**
```bash
docker-compose down
docker-compose build frontend --no-cache
docker-compose up
```

### "redirect_uri_mismatch" error?

This confirms Cognito doesn't allow localhost.

**Fix**: Add localhost to Cognito callback URLs (Solution 1 or 2)

### Can't find credentials login form?

Check `ENABLE_CREDENTIALS_SIGNIN` is set:

```bash
docker-compose exec frontend env | grep ENABLE_CREDENTIALS_SIGNIN
# Should show: ENABLE_CREDENTIALS_SIGNIN=true
```

If not set, add to `.env`:
```bash
echo "ENABLE_CREDENTIALS_SIGNIN=true" >> .env
docker-compose restart frontend
```

### "User not found" with credentials login?

The user doesn't exist in your local database.

**Option A: Use seeded test user**
```bash
./scripts/prepare-testing.sh
# Creates: test@example.com
```

**Option B: Sign up a new user**
- Go to http://localhost:3009/auth/sign-up
- Create account
- Check backend logs for verification link

---

## Summary

**Fastest Solution**: Use credentials provider (already enabled)
```bash
# 1. Go to http://localhost:3009/auth/sign-in
# 2. Use email/password form
# 3. Login with test@example.com
```

**Best Solution**: Add localhost to Cognito callbacks (via AWS Console)
```
Callback URLs: http://localhost:3009/api/auth/callback/cognito
Sign-out URLs: http://localhost:3009
```

**Cleanest Solution**: Create separate dev Cognito client with localhost URLs

Pick the one that works best for your workflow!

