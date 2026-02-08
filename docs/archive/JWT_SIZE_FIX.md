# JWT Token Size Fix

## Problem
The NextAuth JWT is storing three large Cognito tokens:
- `accessToken` (~800-1200 bytes) - Contains user permissions, scopes, Cognito username/groups
- `idToken` (~700-1000 bytes) - Contains user profile data (email, name, etc.)
- `refreshToken` (~200-400 bytes) - Used to refresh the other tokens

**Why are Cognito tokens so large?**
- Each JWT has three parts: header + payload + signature
- RSA256 signatures alone are ~340 bytes each
- Base64 encoding adds ~33% overhead
- Cognito includes many claims: sub, email, cognito:username, cognito:groups, auth_time, etc.
- Custom user attributes add more size

**Why is NextAuth's JWT ~6KB?**
- It's a **JWT containing other JWTs** (Cognito tokens nested inside NextAuth JWT)
- NextAuth adds its own signature (~340 bytes)
- Session metadata (user info) adds ~500 bytes
- Total with encoding overhead: ~6KB

Combined with other JWT claims, this creates a ~6KB cookie that exceeds the 4KB browser limit, causing it to be chunked into multiple cookies. The middleware's `getToken` function may not properly reassemble these chunks.

## Solution Options

### Option 1: Remove Tokens from JWT (Recommended for Quick Fix)
If the Cognito tokens aren't needed in every request, remove them from the JWT and only fetch them when needed.

### Option 2: Store Tokens Server-Side
Use a database or cache (Redis) to store the Cognito tokens, and only store a reference ID in the JWT.

### Option 3: Switch to Database Sessions
Use NextAuth's database session strategy instead of JWT.

## Implementing Option 1 (Quick Fix)

**Question to answer first**: Where are the `accessToken`, `idToken`, and `refreshToken` actually used in the app?

If they're only needed for specific API calls (not every request), we can:
1. Remove them from the JWT
2. Store them in a server-side cache/database
3. Retrieve them when needed using the user's `sub` (ID)

## Implementing Option 2 (Recommended for Production)

Create a token storage service:

```typescript
// apps/frontend/packages/shared/src/auth/token-storage.ts
import { prisma } from '@kit/prisma';

export async function storeCognitoTokens(userId: string, tokens: {
  accessToken?: string;
  idToken?: string;
  refreshToken?: string;
}) {
  // Store in database or Redis
  await prisma.userCognitoTokens.upsert({
    where: { userId },
    create: { userId, ...tokens },
    update: tokens,
  });
}

export async function getCognitoTokens(userId: string) {
  return await prisma.userCognitoTokens.findUnique({
    where: { userId },
  });
}
```

Then modify NextAuth config:

```typescript
callbacks: {
  async jwt({ token, account, user }) {
    // Store tokens server-side instead of in JWT
    if (user && typeof user === 'object' && 'cognitoTokens' in user) {
      const tokens = (user as unknown as Record<string, unknown>).cognitoTokens;
      await storeCognitoTokens(token.sub!, tokens);
      // DON'T add tokens to JWT
    }
    
    return token; // Now much smaller!
  },
}
```

## Immediate Debugging Step

First, let's verify this is the issue by checking the actual JWT token size in the middleware logs.

After deploying the updated middleware debug code, check CloudWatch for:

```json
{
  "sessionCookies": [
    { "name": "__Secure-authjs.session-token.0", "length": 3967 },
    { "name": "__Secure-authjs.session-token.1", "length": 1928 }
  ],
  "hasToken": false  // ← If this is false, chunked cookies aren't being reassembled
}
```

If `hasToken` is `false`, the chunked cookies aren't being properly read by `getToken`, and we need to reduce the JWT size.

## Next Steps

1. **Deploy current middleware changes** with enhanced debugging
2. **Check if `hasToken` is true or false** in CloudWatch logs
3. **If false**, implement Option 2 to move tokens out of JWT
4. **If true**, the issue is elsewhere (likely in session validation)

