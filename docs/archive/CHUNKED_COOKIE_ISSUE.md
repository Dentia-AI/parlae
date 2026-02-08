# Chunked Cookie Issue - Session Token Split

## Problem
The NextAuth session token is being split into multiple cookies due to size limits:
- `__Secure-authjs.session-token.0` (3967 bytes)
- `__Secure-authjs.session-token.1` (1928 bytes)

Total size: ~5.9KB (exceeds the typical 4KB browser cookie limit)

## Root Cause
The JWT session token contains too much data, causing NextAuth.js to automatically chunk it into multiple cookies. The middleware needs to properly reassemble these chunks.

## Cookies Present
```
__Host-authjs.csrf-token: 155 bytes
__Secure-authjs.callback-url: 66 bytes (value: https://app.dentiaapp.com/home)
__Secure-authjs.session-token.0: 3967 bytes (first chunk)
__Secure-authjs.session-token.1: 1928 bytes (second chunk)
csrfSecret: 36 bytes
lang: 6 bytes
```

## Solution Applied

### 1. Updated Middleware Cookie Configuration
Modified `apps/frontend/apps/web/proxy.ts` to explicitly specify the cookie name:

```typescript
const token = await getToken({ 
  req: request, 
  secret: process.env.NEXTAUTH_SECRET,
  cookieName: process.env.NODE_ENV === 'production' 
    ? '__Secure-authjs.session-token' 
    : 'authjs.session-token'
});
```

**Note**: NextAuth's `getToken` should automatically handle chunked cookies with the `.0`, `.1` suffixes.

### 2. Enhanced Debugging
Added detailed logging to see if the token is being reassembled:
- Session cookie detection
- Cookie chunk sizes
- Token email (to verify successful decryption)

## Alternative Solutions if Issue Persists

### Option A: Reduce JWT Token Size
Modify `apps/frontend/packages/shared/src/auth/nextauth.ts`:

```typescript
callbacks: {
  async jwt({ token, user, account }) {
    // Only include essential data in JWT
    if (user) {
      token.sub = user.id;
      token.email = user.email;
      // Remove or minimize other claims
    }
    return token;
  },
}
```

### Option B: Use Database Sessions
Switch from JWT to database sessions in NextAuth config:

```typescript
export const nextAuthConfig: NextAuthConfig = {
  session: {
    strategy: 'database', // Instead of 'jwt'
  },
  // ... rest of config
};
```

This would require:
1. Adding a session adapter for Prisma
2. Creating session tables in the database
3. Much smaller cookies (only session ID stored)

### Option C: Verify Cookie Domain Configuration
Ensure NextAuth is configured with the correct cookie domain:

```typescript
cookies: {
  sessionToken: {
    name: process.env.NODE_ENV === 'production' 
      ? '__Secure-authjs.session-token' 
      : 'authjs.session-token',
    options: {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      domain: process.env.NODE_ENV === 'production' ? '.dentiaapp.com' : undefined
    }
  }
}
```

## Next Steps

1. **Deploy the middleware changes** with enhanced debugging
2. **Check CloudWatch logs** for the new debug output:
   - Look for `[Middleware][getSessionUserId]` logs
   - Verify `sessionCookies` shows both `.0` and `.1` chunks
   - Check if `hasToken` is true and `sub` is populated
3. **If token is still null**, the issue is with cookie reassembly:
   - Consider Option A (reduce JWT size) as the quickest fix
   - Or Option B (database sessions) for a more robust solution

## Testing Commands

```bash
# Rebuild and deploy frontend
cd /Users/shaunk/Projects/Dentia/dentia
docker build -f infra/docker/frontend.Dockerfile -t dentia-frontend:latest .

# Check logs after deployment
aws logs tail /ecs/dentia-frontend --follow --region us-east-1
```

## Expected Debug Output

After the fix, you should see logs like:
```json
{
  "hasToken": true,
  "hasSub": true,
  "sub": "user-uuid-here",
  "tokenEmail": "user@example.com",
  "sessionCookies": [
    { "name": "__Secure-authjs.session-token.0", "length": 3967 },
    { "name": "__Secure-authjs.session-token.1", "length": 1928 }
  ]
}
```

If you see `hasToken: false`, then NextAuth's `getToken` is not successfully reassembling the chunked cookies.

