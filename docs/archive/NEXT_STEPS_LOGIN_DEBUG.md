# Next Steps: Login Debug

## What I Found

Your session cookies are being **split into chunks** because the JWT token is too large (~6KB):

```
__Secure-authjs.session-token.0: 3967 bytes
__Secure-authjs.session-token.1: 1928 bytes
```

**Root Cause**: The JWT is storing three large Cognito tokens (accessToken, idToken, refreshToken), causing it to exceed the 4KB browser cookie limit.

## Changes I Made

### 1. Updated Middleware (`apps/frontend/apps/web/proxy.ts`)
- Added explicit `cookieName` configuration to `getToken()`
- Added detailed debugging to show:
  - Whether the token is successfully reassembled
  - Session cookie chunk information
  - Token email (to verify decryption works)

### 2. Created Documentation
- `CHUNKED_COOKIE_ISSUE.md` - Explains the cookie chunking problem
- `JWT_SIZE_FIX.md` - Details solutions for reducing JWT size

## What to Do Next

### Step 1: Rebuild and Deploy Frontend

```bash
cd /Users/shaunk/Projects/Dentia/dentia

# Rebuild the Docker image
docker build -f infra/docker/frontend.Dockerfile -t dentia-frontend:latest .

# Push to ECR and deploy (your existing deployment process)
```

### Step 2: Check CloudWatch Logs

After deployment, sign in again and check the logs for:

```
[Middleware][getSessionUserId]
```

Look for these key fields:

```json
{
  "hasToken": false,  // ← CRITICAL: Is this true or false?
  "hasSub": false,
  "sub": null,
  "tokenEmail": null,
  "sessionCookies": [
    { "name": "__Secure-authjs.session-token.0", "length": 3967 },
    { "name": "__Secure-authjs.session-token.1", "length": 1928 }
  ]
}
```

### Step 3: Interpret the Results

#### Scenario A: `hasToken: false`
**This means**: The chunked cookies are NOT being properly reassembled by NextAuth's `getToken()`.

**Solution**: We need to reduce the JWT size by NOT storing the large Cognito tokens in it. I can help you:
1. Create a database table to store Cognito tokens
2. Modify the NextAuth config to store tokens server-side
3. Retrieve tokens when needed using the user's ID

#### Scenario B: `hasToken: true, hasSub: true`
**This means**: The middleware IS reading the session correctly!

**Solution**: The issue is elsewhere. Possible causes:
1. The session validation in `requireSessionUser` is failing
2. The `loadUserWorkspace` function is crashing (check for errors in logs)
3. The home page component is not handling the session correctly

#### Scenario C: `hasToken: true, hasSub: false`
**This means**: Token is decrypted but malformed (missing `sub` claim).

**Solution**: There's an issue with how the JWT is being created. Check the `jwt` callback in NextAuth config.

## Quick Test

To quickly verify the session is working, try accessing this URL after signing in:

```
https://app.dentiaapp.com/api/auth/session
```

You said it returns a valid session (200 OK). Now we need to see if the **middleware** can also read that same session.

## If You Want to Skip Debugging and Fix It Now

If you want to immediately fix the issue without more debugging, I can implement the JWT size reduction fix:

1. Create a database table for Cognito tokens
2. Modify NextAuth to store tokens server-side
3. Update any code that uses `accessToken`/`idToken` to fetch from the database

This will reduce the JWT to <1KB and eliminate the chunking issue entirely.

**Let me know**:
- The CloudWatch log output after deploying the updated middleware
- Or if you'd like me to implement the JWT size fix right now

