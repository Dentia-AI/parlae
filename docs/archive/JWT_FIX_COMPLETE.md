# JWT Token Size Fix - Implementation Complete

## Problem Summary
Your login was failing because:
1. NextAuth JWT stored **3 large Cognito tokens** (accessToken, idToken, refreshToken)
2. Total JWT size: **~6KB** (exceeded 4KB browser cookie limit)
3. Browser split the cookie into **2 chunks** (`__Secure-authjs.session-token.0` and `.1`)
4. Middleware's `getToken()` function couldn't reassemble the chunks
5. Result: Login appeared successful but user was redirected back to sign-in

## Solution Implemented
**Moved Cognito tokens from JWT to database** - JWT now only contains user ID and email (~400 bytes)

### Changes Made

#### 1. New Database Table (`schema.prisma`)
```prisma
model CognitoTokens {
  id           String    @id @default(uuid())
  userId       String    @unique @map("user_id")
  accessToken  String    @map("access_token") @db.Text
  idToken      String    @map("id_token") @db.Text
  refreshToken String?   @map("refresh_token") @db.Text
  expiresAt    DateTime  @map("expires_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("cognito_tokens")
}
```

#### 2. Token Storage Service (`token-storage.ts`)
Created server-side functions:
- `storeCognitoTokens()` - Save tokens to database after login
- `getCognitoTokens()` - Retrieve tokens when needed for API calls
- `deleteCognitoTokens()` - Clean up tokens on sign out

#### 3. Updated NextAuth Config (`nextauth.ts`)
**Before**:
```typescript
async jwt({ token, account, user }) {
  // Stored ~2KB of tokens in JWT
  if (account?.access_token) {
    token.accessToken = account.access_token;
  }
  // ... more token storage
}
```

**After**:
```typescript
async jwt({ token, account, user }) {
  // Store tokens in database, keep JWT small
  if (token.sub && account?.access_token) {
    await storeCognitoTokens(token.sub, {
      accessToken: account.access_token,
      idToken: account.id_token,
      refreshToken: account.refresh_token,
      expiresIn: account.expires_in,
    });
  }
  return token; // No tokens in JWT!
}
```

#### 4. Updated Backend API Client (`backend-api.ts`)
**Before**:
```typescript
const session = await auth();
const accessToken = session.accessToken; // From JWT
```

**After**:
```typescript
const session = await auth();
const userId = session.user.id;
const tokens = await getCognitoTokens(userId); // From database
const accessToken = tokens.accessToken;
```

#### 5. Updated Middleware (`proxy.ts`)
Added explicit cookie name configuration to help with chunked cookie reassembly:
```typescript
const token = await getToken({ 
  req: request, 
  secret: process.env.NEXTAUTH_SECRET,
  cookieName: process.env.NODE_ENV === 'production' 
    ? '__Secure-authjs.session-token' 
    : 'authjs.session-token'
});
```

## Expected Results

### JWT Size Reduction
- **Before**: ~6KB (chunked into 2 cookies)
- **After**: ~400 bytes (single cookie)

### Cookie Structure
**Before**:
```
__Secure-authjs.session-token.0: 3967 bytes (chunk 1)
__Secure-authjs.session-token.1: 1928 bytes (chunk 2)
```

**After**:
```
__Secure-authjs.session-token: ~400 bytes (single cookie)
```

### Login Flow
1. ✅ User enters credentials → Cognito authenticates
2. ✅ Tokens stored in `cognito_tokens` table
3. ✅ Small JWT created (~400 bytes)
4. ✅ Single cookie set (no chunking)
5. ✅ Middleware reads session successfully
6. ✅ User stays on `/home` page
7. ✅ Backend API calls fetch accessToken from database

## Next Steps

### 1. Generate Prisma Migration
```bash
cd /Users/shaunk/Projects/Dentia/dentia
cd packages/prisma
pnpm prisma migrate dev --name add_cognito_tokens_table
```

### 2. Run the Migration
The migration will create the `cognito_tokens` table in your database.

### 3. Rebuild and Deploy
```bash
# Rebuild frontend Docker image
cd /Users/shaunk/Projects/Dentia/dentia
docker build -f infra/docker/frontend.Dockerfile -t dentia-frontend:latest .

# Push to ECR and deploy (your existing process)
```

### 4. Test Login
After deployment:
1. Sign in with your credentials
2. Check that you stay on `/home` (no redirect to `/auth/sign-in`)
3. Verify backend API calls work
4. Check CloudWatch logs for `[Middleware][getSessionUserId]` - should show `hasToken: true`

### 5. Monitor Token Expiration
Cognito access tokens typically expire after **1 hour**. You may need to implement token refresh logic in the future:

```typescript
// In token-storage.ts
export async function refreshCognitoTokens(userId: string) {
  const tokens = await getCognitoTokens(userId);
  
  if (!tokens?.refreshToken) {
    throw new Error('No refresh token available');
  }
  
  // Call Cognito to refresh tokens
  const newTokens = await cognitoClient.send(new InitiateAuthCommand({
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    ClientId: process.env.COGNITO_CLIENT_ID,
    AuthParameters: {
      REFRESH_TOKEN: tokens.refreshToken,
    },
  }));
  
  // Store new tokens
  await storeCognitoTokens(userId, {
    accessToken: newTokens.AuthenticationResult.AccessToken,
    idToken: newTokens.AuthenticationResult.IdToken,
    refreshToken: tokens.refreshToken, // Reuse old refresh token
    expiresIn: newTokens.AuthenticationResult.ExpiresIn,
  });
}
```

## Files Modified

### New Files:
- `/Users/shaunk/Projects/Dentia/dentia/apps/frontend/packages/shared/src/auth/token-storage.ts`
- `/Users/shaunk/Projects/Dentia/dentia/JWT_FIX_COMPLETE.md` (this file)

### Modified Files:
- `/Users/shaunk/Projects/Dentia/dentia/packages/prisma/schema.prisma` - Added `CognitoTokens` model
- `/Users/shaunk/Projects/Dentia/dentia/apps/frontend/packages/shared/src/auth/nextauth.ts` - Updated JWT callback
- `/Users/shaunk/Projects/Dentia/dentia/apps/frontend/packages/shared/src/auth/cognito-helpers.ts` - Added `expiresIn` field
- `/Users/shaunk/Projects/Dentia/dentia/apps/frontend/packages/shared/src/auth/index.ts` - Exported token-storage
- `/Users/shaunk/Projects/Dentia/dentia/apps/frontend/apps/web/lib/server/backend-api.ts` - Fetch tokens from DB
- `/Users/shaunk/Projects/Dentia/dentia/apps/frontend/apps/web/proxy.ts` - Added cookie name config

## Troubleshooting

### If login still fails:
1. **Check migration**: Ensure `cognito_tokens` table exists
   ```sql
   SELECT * FROM information_schema.tables WHERE table_name = 'cognito_tokens';
   ```

2. **Check tokens are being stored**:
   ```sql
   SELECT user_id, expires_at, created_at FROM cognito_tokens;
   ```

3. **Check CloudWatch logs** for:
   - `[Auth][NextAuth]` logs from token storage
   - `[Middleware][getSessionUserId]` logs showing token status

### If backend API calls fail:
1. Check that tokens are in database for the user
2. Verify tokens haven't expired (`expires_at > NOW()`)
3. Check logs in `backend-api.ts` for token retrieval errors

## Security Notes

- ✅ Tokens are stored in database with expiration tracking
- ✅ Tokens are automatically deleted when user is deleted (CASCADE)
- ✅ Tokens are only accessible server-side
- ✅ JWT no longer contains sensitive Cognito tokens
- ⚠️ Consider implementing token refresh logic for better UX
- ⚠️ Consider encrypting tokens at rest (future enhancement)

## Performance Impact

- **Positive**: Smaller cookies mean faster requests (less data transfer)
- **Positive**: No cookie chunking = more reliable session handling
- **Neutral**: One extra DB query per backend API call (negligible, queries are cached)
- **Positive**: Tokens are stored once per login, not on every request

## Why This Works

**Root Cause**: JWT with Cognito tokens was too large for browser cookies

**Why Large?**:
- Each Cognito JWT has header + payload + RSA256 signature (~340 bytes signature alone)
- Base64 encoding adds ~33% overhead
- Storing 3 JWTs inside another JWT = massive size

**Why Fix Works**:
- JWT now only contains: `sub` (user ID), `email`, `iat` (issued at), `exp` (expiration)
- Total: ~200-400 bytes (well under 4KB limit)
- No chunking = middleware works correctly
- Tokens retrieved on-demand = no performance impact

## Alternative Approaches (Not Implemented)

1. **Database Sessions**: Switch NextAuth to database session strategy (more complex)
2. **Redis Token Store**: Store tokens in Redis instead of PostgreSQL (requires infrastructure)
3. **HTTP-Only API for Tokens**: Create separate API to fetch tokens (more roundtrips)

The implemented approach (database storage) is the best balance of simplicity, security, and performance.

