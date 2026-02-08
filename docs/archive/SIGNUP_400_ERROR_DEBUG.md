# Debugging the Sign-Up 400 Error

## Current Issue

The sign-up form is returning a 400 error with this response:
```json
{
  "error": {
    "status": 400,
    "message": "auth:errors.generic"
  }
}
```

## What We've Implemented

We've added comprehensive logging throughout the signup flow so we can now see **exactly** where the error is occurring and why.

## Where to Find Logs

### CloudWatch Logs

1. **Go to AWS CloudWatch Console**
2. **Navigate to Log Groups**
3. **Select `/ecs/dentia-frontend`** (or your frontend log group)
4. **Filter by:**
   - `[Auth][SignUpAPI]` - To see all sign-up related logs
   - `Schema validation failed` - If the Zod schema validation is failing
   - `Cognito signup failed` - If Cognito is rejecting the request
   - `Missing required environment variables` - If env vars are missing

### What Each Error Means

Based on the logs you'll see, here's what could be wrong:

#### 1. Schema Validation Failed
**Log:** `[Auth][SignUpAPI] Schema validation failed`

**What it means:** The form data didn't pass Zod validation

**Check:**
- The `errors` field in the log will show which field failed and why
- Common issues: password too short, missing special character, email format invalid

**Example log:**
```json
{
  "level": 50,
  "levelLabel": "ERROR",
  "time": 1762276314474,
  "env": "production",
  "errors": {
    "fieldErrors": {
      "password": ["Password must contain at least one special character"]
    }
  },
  "body": {
    "fullName": "John Doe",
    "email": "john@example.com",
    "password": "[REDACTED]"
  },
  "msg": "[Auth][SignUpAPI] Schema validation failed"
}
```

#### 2. Cognito Error
**Log:** `[Auth][SignUpAPI] Cognito signup failed`

**What it means:** AWS Cognito rejected the sign-up request

**Check:**
- `cognitoErrorType` - The specific Cognito error type
- `cognitoErrorMessage` - Cognito's error message
- Common issues:
  - `InvalidPasswordException` - Password doesn't meet Cognito's password policy
  - `UsernameExistsException` - Email already registered
  - `InvalidParameterException` - Invalid user attributes

**Example log:**
```json
{
  "level": 50,
  "levelLabel": "ERROR",
  "time": 1762276314474,
  "env": "production",
  "email": "john@example.com",
  "cognitoErrorType": "InvalidPasswordException",
  "cognitoErrorMessage": "Password does not conform to policy: Password not long enough",
  "mappedError": {
    "status": 400,
    "field": "password",
    "message": "auth:errors.generic"
  },
  "status": 400,
  "msg": "[Auth][SignUpAPI] Cognito signup failed"
}
```

#### 3. Missing Environment Variables
**Log:** `[Auth][SignUpAPI] Missing required environment variables`

**What it means:** Cognito credentials are not configured

**Check:**
- `hasClientId` - Should be true
- `hasClientSecret` - Should be true
- `hasIssuer` - Should be true

**Fix:** Set these in your ECS task definition or environment:
- `COGNITO_CLIENT_ID`
- `COGNITO_CLIENT_SECRET`
- `COGNITO_ISSUER`

#### 4. Missing UserSub
**Log:** `[Auth][SignUpAPI] Cognito did not return UserSub`

**What it means:** Cognito succeeded but didn't return a user ID (very rare)

**Check:** The `payload` field in the log

#### 5. General Exception
**Log:** `[Auth][SignUpAPI] Failed to register user`

**What it means:** An unexpected error occurred (network issue, Supabase issue, etc.)

**Check:**
- `error.name` - Type of error
- `error.message` - Error message
- `error.stack` - Stack trace

## How to Debug

### Step 1: Reproduce the Error

1. Open your sign-up page
2. Fill out the form with:
   - Full Name: Test User
   - Email: test@example.com
   - Password: TestPass123!
   - Confirm Password: TestPass123!
   - Accept Terms: Yes
3. Submit the form
4. Note the exact time the error occurred

### Step 2: Check CloudWatch Logs

1. Go to CloudWatch
2. Select your log group
3. Search for logs around the time of the error
4. Look for `[Auth][SignUpAPI]` messages
5. Find the error log with details

### Step 3: Identify the Root Cause

Based on the log entry, determine which scenario from above applies.

### Step 4: Fix the Issue

#### If Schema Validation Failed:
- The password requirements might be too strict
- Update the schema in `apps/frontend/apps/web/app/auth/sign-up/_lib/sign-up.schema.ts`
- Or ensure the form input meets the requirements

#### If Cognito Error:
- **InvalidPasswordException:**
  - Check Cognito User Pool password policy settings in AWS Console
  - Ensure your client-side validation matches Cognito's requirements
  - The Zod schema should match Cognito's password policy

- **UsernameExistsException:**
  - User already exists
  - Provide better error message to user

- **InvalidParameterException:**
  - Check the user attributes being sent
  - Ensure `name` attribute is allowed in Cognito User Pool

#### If Missing Environment Variables:
1. Check ECS Task Definition
2. Verify environment variables are set:
   ```bash
   aws ecs describe-task-definition \
     --task-definition dentia-frontend \
     --profile dentia \
     --region us-east-2 \
     --query 'taskDefinition.containerDefinitions[0].environment'
   ```
3. Update if missing

#### If General Exception:
- Check the error message and stack trace
- May need to check Supabase connectivity
- May need to check network/firewall rules

## Testing the Logging

To verify logging is working:

1. **Try with Known Invalid Data:**
   - Use password "123" (too short)
   - Should see: `[Auth][SignUpAPI] Schema validation failed`

2. **Try with Valid Data:**
   - Use a new email and strong password
   - Should see either:
     - `[Auth][SignUpAPI] User registered successfully` (success)
     - Or a Cognito error log if something is wrong

## Common Cognito Password Policy

Make sure your Zod schema matches your Cognito password policy.

**Check your Cognito policy:**
```bash
aws cognito-idp describe-user-pool \
  --user-pool-id YOUR_POOL_ID \
  --profile dentia \
  --region us-east-2 \
  --query 'UserPool.Policies.PasswordPolicy'
```

**Default Cognito requirements:**
- Minimum length: 8 characters
- Require uppercase letters
- Require lowercase letters
- Require numbers
- Require special characters

**Your current Zod schema:**
```typescript
password: z
  .string()
  .min(8, { message: SIGN_UP_ERROR_KEYS.PASSWORD_LENGTH })
  .regex(/\d/, { message: SIGN_UP_ERROR_KEYS.PASSWORD_NUMBER })
  .regex(/[^A-Za-z0-9]/, { message: SIGN_UP_ERROR_KEYS.PASSWORD_SPECIAL })
  .regex(/[A-Z]/, { message: SIGN_UP_ERROR_KEYS.PASSWORD_UPPERCASE })
```

This should match most Cognito policies, but verify yours.

## Next Steps

Once you check the CloudWatch logs, you'll know exactly which error is occurring. Please share:

1. The exact log entry from CloudWatch
2. The timestamp
3. Any additional context (what data was entered, etc.)

Then we can fix the specific issue!

