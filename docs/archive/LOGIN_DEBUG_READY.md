# Login Redirect Debug - Ready to Deploy

## Problem

Session endpoint returns valid tokens, but accessing `/home` redirects back to sign-in page.

## What We've Added

### 1. Middleware Debug Logging

**File:** `apps/frontend/apps/web/proxy.ts`

Added logging to see:
- Whether NextAuth token is being read from cookies
- Which cookies are present in the request
- Whether session user ID is found
- Why redirects are happening

### 2. Workspace Loading Debug Logging

**File:** `apps/frontend/apps/web/app/home/(user)/_lib/server/load-user-workspace.ts`

Added error handling for:
- Each individual database query (ads, files, campaigns, etc.)
- Overall workspace loading failures
- Graceful degradation (returns zeros if queries fail)

## Deploy and Check Logs

After deploying, check CloudWatch for these log patterns:

### Pattern 1: Middleware Not Reading Token
```
[Middleware][getSessionUserId] {
  hasToken: false,
  hasSub: false,
  cookies: [...]
}
[Middleware][homeMiddleware] {
  hasSession: false
}
[Middleware][homeMiddleware] Redirecting to sign-in
```

**This means:** NextAuth cookies aren't being read by middleware
**Likely cause:** Cookie domain/security mismatch

### Pattern 2: Token Present But No Sub
```
[Middleware][getSessionUserId] {
  hasToken: true,
  hasSub: false,
  cookies: [...]
}
```

**This means:** Token exists but doesn't have user ID
**Likely cause:** Token format issue or JWT parsing problem

### Pattern 3: Middleware Passes, Workspace Fails
```
[Middleware][homeMiddleware] {
  hasSession: true,
  userId: "614b5550-c041-7025-565e-158206e9f0fc"
}
[loadUserWorkspace] Failed to load workspace
```

**This means:** Middleware works, but page loading fails
**Likely cause:** Database query errors or missing tables

### Pattern 4: Database Query Errors
```
[loadUserStats] Failed to count ads { error: "..." }
[loadUserStats] Failed to count files { error: "..." }
```

**This means:** Ad-related tables have issues
**Solution:** May need to run migrations or fix table structure

## Most Likely Issues

### Issue 1: Cookie Domain Mismatch (MOST LIKELY)

NextAuth might be setting cookies for the wrong domain.

**Check in logs:** Are cookies present? What are their names?

**Expected cookies:**
- `next-auth.session-token` (or `__Secure-next-auth.session-token` if HTTPS)
- `next-auth.csrf-token`

**Solution if missing:** Add cookie configuration to NextAuth:

```typescript
// In nextauth.ts
export const { handlers, auth, signIn, signOut } = NextAuth({
  // ... existing config ...
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        domain: '.dentiaapp.com', // Note the leading dot for subdomains
      },
    },
  },
});
```

### Issue 2: NEXTAUTH_SECRET Mismatch

If the secret used to sign the JWT doesn't match the one used to verify it.

**Check:** Ensure `NEXTAUTH_SECRET` env var is the same in all environments

### Issue 3: Session Cookie Not Being Set After Login

The `/api/auth/session` endpoint returns valid data, but the browser might not be storing the cookie.

**Check in browser:**
1. Open DevTools → Application → Cookies
2. Look for `next-auth.session-token` or `__Secure-next-auth.session-token`
3. Check its domain, path, and expiry

## Next Steps

1. **Deploy these changes**
2. **Attempt to log in**
3. **Check CloudWatch logs** for the patterns above
4. **Check browser cookies** in DevTools
5. **Report back** what you see in the logs

The logs will tell us exactly what's failing and we can apply the right fix!

## Quick Browser Cookie Check

Before even deploying, you can check:

1. Go to `https://app.dentiaapp.com`
2. Open DevTools (F12)
3. Go to Application tab → Cookies
4. Check if you see `next-auth.session-token` or `__Secure-next-auth.session-token`
5. If you see it:
   - What's its Domain? (should be `app.dentiaapp.com` or `.dentiaapp.com`)
   - What's its Path? (should be `/`)
   - Is it marked as HttpOnly? (should be yes)
   - Is it marked as Secure? (should be yes for HTTPS)

This alone might reveal the issue!

