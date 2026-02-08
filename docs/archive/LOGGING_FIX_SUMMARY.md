# Logging Fix Summary

## Issues Fixed

### 1. Missing Context in Logs ✅
**Problem:** CloudWatch logs were showing only the message without any context:
```json
{
  "level": 50,
  "time": 1762276314474,
  "env": "production",
  "msg": "[Auth][SignUpAPI] Cognito signup failed"
}
```

**Cause:** Pino logger expects parameters in a specific order: `logger.error(context_object, message)` but we were calling it as `logger.error(message, context_object)`.

**Fixed:** Updated all logger calls to use the correct signature:
```typescript
// ✅ Correct (now)
logger.error({
  email,
  cognitoErrorType: payload.__type,
  cognitoErrorMessage: payload.message,
  status: 400,
}, '[Auth][SignUpAPI] Cognito signup failed');

// ❌ Wrong (before)
logger.error('[Auth][SignUpAPI] Cognito signup failed', {
  email,
  cognitoErrorType: payload.__type,
  // ...
});
```

### 2. Missing "ERROR" Label ✅
**Problem:** Error logs showed `level: 50` instead of a clear "ERROR" label.

**Fixed:** Updated Pino logger configuration to include `levelLabel`:
```typescript
formatters: {
  level(label, number) {
    return { level: number, levelLabel: label.toUpperCase() };
  },
}
```

## What You'll See Now

After redeploying with these fixes, your CloudWatch logs will look like this:

### Complete Error Log Example
```json
{
  "level": 50,
  "levelLabel": "ERROR",
  "time": 1762276314474,
  "env": "production",
  "email": "user@example.com",
  "cognitoErrorType": "InvalidPasswordException",
  "cognitoErrorMessage": "Password does not conform to policy: Password must have numeric characters",
  "mappedError": {
    "status": 400,
    "field": "password",
    "message": "auth:errors.generic"
  },
  "status": 400,
  "msg": "[Auth][SignUpAPI] Cognito signup failed"
}
```

This gives you **all the information** you need to debug:
- ✅ Clear "ERROR" label (`levelLabel: "ERROR"`)
- ✅ User's email (sanitized sensitive fields)
- ✅ Specific Cognito error type
- ✅ Cognito's error message
- ✅ HTTP status code
- ✅ Mapped error details

## Files Modified

### Frontend
1. **`apps/frontend/packages/shared/src/logger/impl/pino.ts`**
   - Added `formatters` to include `levelLabel`
   - Added `serializers` for better error formatting

2. **`apps/frontend/apps/web/app/api/auth/sign-up/route.ts`**
   - Fixed all `logger.error()` calls to use correct parameter order
   - Fixed all `logger.info()` calls to use correct parameter order

3. **`apps/frontend/apps/web/lib/api-error-handler.ts`**
   - Fixed all `logger.error()` calls to use correct parameter order
   - Fixed all `logger.debug()` calls to use correct parameter order

4. **`LOGGING_IMPLEMENTATION.md`**
   - Updated with correct Pino usage examples
   - Added examples of new log format

5. **`SIGNUP_400_ERROR_DEBUG.md`**
   - Updated with correct log format examples

## Deployment Steps

To see these fixes in action:

### 1. Build and Deploy Frontend
```bash
cd apps/frontend
pnpm run build

cd ../..
docker build -f infra/docker/frontend.Dockerfile -t dentia-frontend:latest .

# Get your ECR URL from AWS Console or:
aws ecr describe-repositories --profile dentia --region us-east-2 --query 'repositories[?repositoryName==`dentia-frontend`].repositoryUri' --output text

# Login to ECR
aws ecr get-login-password --region us-east-2 --profile dentia | docker login --username AWS --password-stdin YOUR_ECR_URL

# Tag and push
docker tag dentia-frontend:latest YOUR_ECR_URL/dentia-frontend:latest
docker push YOUR_ECR_URL/dentia-frontend:latest

# Force new deployment
aws ecs update-service \
  --cluster dentia-cluster \
  --service dentia-frontend \
  --force-new-deployment \
  --profile dentia \
  --region us-east-2
```

### 2. Wait for Deployment
```bash
# Monitor deployment status
aws ecs wait services-stable \
  --cluster dentia-cluster \
  --services dentia-frontend \
  --profile dentia \
  --region us-east-2

echo "✅ Deployment complete!"
```

### 3. Test and Check Logs

1. **Reproduce the error:**
   - Go to your signup page
   - Try to sign up with the data that previously failed
   - Note the exact time

2. **Check CloudWatch logs:**
   ```bash
   # Get recent logs
   aws logs tail /ecs/dentia-frontend \
     --follow \
     --filter-pattern "[Auth][SignUpAPI]" \
     --profile dentia \
     --region us-east-2
   ```

3. **Or use AWS Console:**
   - Go to CloudWatch > Log Groups
   - Select `/ecs/dentia-frontend`
   - Filter by `[Auth][SignUpAPI]` or `levelLabel: ERROR`
   - Find the log entry around your test time

### 4. Identify the Root Cause

Based on the `cognitoErrorType` in the logs:

**If `InvalidPasswordException`:**
- Check your Cognito User Pool password policy
- Compare with your Zod schema validation
- The password requirements might not match

**If `InvalidParameterException`:**
- The `name` attribute might not be configured in Cognito
- Check User Pool > Attributes

**If `UsernameExistsException`:**
- Email already registered
- Try with a different email

## Common Cognito Password Policies

Check your Cognito password policy:
```bash
aws cognito-idp describe-user-pool \
  --user-pool-id YOUR_POOL_ID \
  --profile dentia \
  --region us-east-2 \
  --query 'UserPool.Policies.PasswordPolicy'
```

**Typical requirements:**
- Minimum length: 8 characters
- Require uppercase: Yes
- Require lowercase: Yes  
- Require numbers: Yes
- Require special characters: Yes

**Your Zod schema** (in `sign-up.schema.ts`):
```typescript
password: z
  .string()
  .min(8)                           // Minimum 8 chars
  .regex(/\d/)                      // Requires number
  .regex(/[^A-Za-z0-9]/)           // Requires special char
  .regex(/[A-Z]/)                   // Requires uppercase
```

If these don't match, you'll get `InvalidPasswordException`.

## Next Steps

Once you deploy and check the logs:

1. **Share the complete log entry** from CloudWatch
2. **Tell me the `cognitoErrorType` and `cognitoErrorMessage`**
3. **I'll help you fix the specific issue**

The logging is now comprehensive, so we'll know exactly what's wrong! 🎯

