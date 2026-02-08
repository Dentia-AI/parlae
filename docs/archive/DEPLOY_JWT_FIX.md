# Deploy JWT Fix - Action Plan

## What Was Fixed

**Problem**: Cognito tokens (~6KB) stored in JWT caused cookie chunking, breaking login.

**Solution**: Moved tokens to database. JWT now ~400 bytes (single cookie).

## Changes Applied ✅

1. ✅ Created `cognito_tokens` table in Prisma schema
2. ✅ Created token storage service (`token-storage.ts`)
3. ✅ Updated NextAuth to store tokens in DB (not JWT)
4. ✅ Updated backend API client to fetch tokens from DB
5. ✅ Updated middleware with explicit cookie configuration
6. ✅ Generated Prisma client
7. ✅ Created migration: `20251105050907_add_cognito_tokens_table`
8. ✅ Applied migration to local database

## Deployment Steps

### 1. Run Migration on Production Database

You have two options:

#### Option A: Using your existing migration script
```bash
cd /Users/shaunk/Projects/Dentia/dentia-infra
./infra/scripts/deploy-production-migrations-run-from-dentia.sh
```

#### Option B: Manually via AWS
```bash
# Connect to your RDS instance via bastion host and run:
psql -h <rds-endpoint> -U <username> -d dentia

# Then run the migration SQL:
CREATE TABLE "cognito_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "id_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cognito_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cognito_tokens_user_id_key" ON "cognito_tokens"("user_id");

ALTER TABLE "cognito_tokens" ADD CONSTRAINT "cognito_tokens_user_id_fkey" 
  FOREIGN KEY ("user_id") REFERENCES "users"("id") 
  ON DELETE CASCADE ON UPDATE CASCADE;
```

### 2. Commit and Push Changes
```bash
cd /Users/shaunk/Projects/Dentia/dentia

git add .
git commit -m "fix: move Cognito tokens from JWT to database to fix login redirect

- Created cognito_tokens table to store accessToken, idToken, refreshToken
- Updated NextAuth to store tokens in DB instead of JWT (reduces JWT from 6KB to 400 bytes)
- Updated backend-api.ts to fetch tokens from database when needed
- Fixed middleware cookie configuration for better chunked cookie handling
- Added migration: 20251105050907_add_cognito_tokens_table

Fixes login redirect issue caused by JWT cookie chunking"

git push origin main
```

### 3. Rebuild and Deploy Frontend Docker Image
```bash
cd /Users/shaunk/Projects/Dentia/dentia

# Rebuild Docker image
docker build -f infra/docker/frontend.Dockerfile -t dentia-frontend:latest .

# Tag for ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <your-ecr-url>
docker tag dentia-frontend:latest <your-ecr-url>/dentia-frontend:latest

# Push to ECR
docker push <your-ecr-url>/dentia-frontend:latest

# Force new deployment (if using ECS)
aws ecs update-service --cluster dentia --service dentia-frontend --force-new-deployment --region us-east-1
```

### 4. Verify Deployment

After deployment completes:

#### Test 1: Login Flow
1. Go to `https://app.dentiaapp.com/auth/sign-in`
2. Sign in with valid credentials
3. **Expected**: Stay on `/home` page (no redirect back to sign-in)

#### Test 2: Check Cookies
Open browser DevTools → Application → Cookies:

**Before Fix**:
```
__Secure-authjs.session-token.0: 3967 bytes
__Secure-authjs.session-token.1: 1928 bytes
```

**After Fix**:
```
__Secure-authjs.session-token: ~400 bytes (single cookie, no chunking!)
```

#### Test 3: Check Database
```sql
-- Verify tokens are being stored
SELECT user_id, expires_at, created_at 
FROM cognito_tokens 
LIMIT 5;

-- Should return rows for users who have logged in after deployment
```

#### Test 4: Check CloudWatch Logs
Look for these logs in `/ecs/dentia-frontend`:

```
[Middleware][getSessionUserId] {
  hasToken: true,  ← Should be TRUE now!
  hasSub: true,
  sub: "user-uuid",
  tokenEmail: "user@example.com",
  sessionCookies: [
    { name: "__Secure-authjs.session-token", length: ~400 }  ← Single cookie!
  ]
}
```

#### Test 5: Backend API Calls
After logging in, navigate to a page that calls the NestJS backend:
- **Expected**: API calls succeed with proper authentication
- **Check logs** for "Cognito tokens stored successfully" and "Cognito tokens retrieved"

## Rollback Plan (If Needed)

If something goes wrong:

### 1. Quick Rollback (Deploy Previous Version)
```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Redeploy previous version
aws ecs update-service --cluster dentia --service dentia-frontend --force-new-deployment
```

### 2. Database Rollback (Remove Table)
```sql
-- Only if absolutely necessary
DROP TABLE IF EXISTS cognito_tokens;
```

## Expected Improvements

1. **✅ Login works** - No more redirect loops
2. **✅ Faster requests** - Smaller cookies = less data transfer
3. **✅ More reliable sessions** - No cookie chunking issues
4. **✅ Better security** - Tokens in DB, not in cookies (though encrypted either way)

## Monitoring After Deployment

### CloudWatch Queries

```
# Check for token storage success
fields @timestamp, @message
| filter @message like /Cognito tokens stored/
| sort @timestamp desc
| limit 20

# Check for token retrieval
fields @timestamp, @message
| filter @message like /Cognito tokens/
| sort @timestamp desc
| limit 20

# Check for middleware session detection
fields @timestamp, @message
| filter @message like /Middleware.*getSessionUserId/
| sort @timestamp desc
| limit 20
```

### Database Queries

```sql
-- Check how many users have tokens stored
SELECT COUNT(*) FROM cognito_tokens;

-- Check for expired tokens
SELECT COUNT(*) FROM cognito_tokens WHERE expires_at < NOW();

-- Check token age distribution
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as tokens_created
FROM cognito_tokens
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

## Next Steps (Future Enhancements)

1. **Token Refresh Logic** (recommended within 1-2 weeks)
   - Cognito tokens expire after 1 hour
   - Implement auto-refresh using `refreshToken`
   - See `JWT_FIX_COMPLETE.md` for implementation example

2. **Token Cleanup** (optional)
   - Add cron job to delete expired tokens
   - Or rely on CASCADE delete when users are deleted

3. **Token Encryption at Rest** (optional security enhancement)
   - Encrypt tokens before storing in database
   - Use AWS KMS or application-level encryption

4. **Monitoring Dashboard**
   - Track token expiration rates
   - Monitor failed token retrievals
   - Alert on high failure rates

## Files Changed

### New Files:
- `apps/frontend/packages/shared/src/auth/token-storage.ts`
- `packages/prisma/migrations/20251105050907_add_cognito_tokens_table/migration.sql`
- `JWT_FIX_COMPLETE.md`
- `DEPLOY_JWT_FIX.md` (this file)

### Modified Files:
- `packages/prisma/schema.prisma`
- `apps/frontend/packages/shared/src/auth/nextauth.ts`
- `apps/frontend/packages/shared/src/auth/cognito-helpers.ts`
- `apps/frontend/packages/shared/src/auth/index.ts`
- `apps/frontend/apps/web/lib/server/backend-api.ts`
- `apps/frontend/apps/web/proxy.ts`

## Support

If you encounter issues:
1. Check CloudWatch logs for error messages
2. Verify migration was applied: `SELECT * FROM cognito_tokens LIMIT 1;`
3. Check browser DevTools → Network tab for session cookie size
4. Review `JWT_FIX_COMPLETE.md` for detailed troubleshooting

---

**Ready to deploy!** 🚀

Run the migration, commit the changes, rebuild Docker, and deploy.

