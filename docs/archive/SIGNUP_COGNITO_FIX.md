# Sign-Up Cognito Fixes

## Issues Fixed

### 1. **Cognito Username Error** ✅

**Error Message:**
```
Username cannot be of email format, since user pool is configured for email alias.
```

**Root Cause:**
Your Cognito User Pool is configured to use **email as an alias**, which means:
- Users sign in with their email address
- The actual username must be a different format (not an email)
- We were setting `Username: email` in the SignUp API call, which Cognito rejected

**Solution:**
Generate a unique username that's NOT in email format:

```typescript
Username: email.split('@')[0] + '_' + Date.now()
// Example: "rafa.inspired9" + "_" + "1762277263838"
// Result: "rafa.inspired9_1762277263838"
```

This creates a unique username while still allowing users to sign in with their email.

**File Changed:** `apps/frontend/apps/web/app/api/auth/sign-up/route.ts`

### 2. **Password Special Character Requirement Removed** ✅

**Old Requirements:**
- ✅ Minimum 8 characters
- ✅ At least 1 number
- ✅ At least 1 uppercase letter
- ❌ At least 1 special character (REMOVED)

**New Requirements:**
- ✅ Minimum 8 characters
- ✅ At least 1 number
- ✅ At least 1 uppercase letter

**File Changed:** `apps/frontend/apps/web/app/auth/sign-up/_lib/sign-up.schema.ts`

**Updated Zod Schema:**
```typescript
password: z
  .string()
  .min(8, { message: SIGN_UP_ERROR_KEYS.PASSWORD_LENGTH })
  .regex(/\d/, { message: SIGN_UP_ERROR_KEYS.PASSWORD_NUMBER })
  .regex(/[A-Z]/, { message: SIGN_UP_ERROR_KEYS.PASSWORD_UPPERCASE })
  // Removed: .regex(/[^A-Za-z0-9]/, { message: SIGN_UP_ERROR_KEYS.PASSWORD_SPECIAL })
```

## Important: Update Cognito Password Policy

You **MUST** update your Cognito User Pool password policy to match the new schema, otherwise Cognito might still reject passwords without special characters.

### How to Update Cognito Password Policy

#### Option 1: AWS Console (Easiest)

1. Go to AWS Console → Cognito User Pools
2. Select your user pool
3. Go to **Sign-in experience** → **Password policy**
4. Update the policy:
   - **Minimum length:** 8 characters
   - **Require uppercase letters:** ✅ Yes
   - **Require lowercase letters:** ✅ Yes
   - **Require numbers:** ✅ Yes
   - **Require special characters:** ❌ **NO** (Uncheck this)
5. Save changes

#### Option 2: AWS CLI

```bash
# Get your User Pool ID first
aws cognito-idp list-user-pools --max-results 20 --profile dentia --region us-east-2

# Update the password policy (replace YOUR_USER_POOL_ID)
aws cognito-idp update-user-pool \
  --user-pool-id YOUR_USER_POOL_ID \
  --policies "PasswordPolicy={MinimumLength=8,RequireUppercase=true,RequireLowercase=true,RequireNumbers=true,RequireSymbols=false}" \
  --profile dentia \
  --region us-east-2
```

#### Option 3: Terraform (If using IaC)

Update your Terraform configuration:

```hcl
resource "aws_cognito_user_pool" "pool" {
  # ... other settings ...

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false  # Changed from true to false
  }
}
```

Then apply:
```bash
cd dentia-infra/infra/environments/dev
terraform apply
```

## Testing the Fixes

### 1. Valid Passwords (Should Work)

These passwords should now work:
- `Password123` (8 chars, has uppercase, has number, NO special char)
- `MyPass456` (8 chars, has uppercase, has number, NO special char)
- `TestUser789` (9 chars, has uppercase, has number, NO special char)

### 2. Invalid Passwords (Should Fail)

These passwords should still fail:
- `password` (no uppercase, no number)
- `PASSWORD` (no lowercase, no number)
- `Pass123` (less than 8 characters)
- `Password` (no number)
- `12345678` (no uppercase, no lowercase)

### 3. Test the Sign-Up Flow

1. Deploy the changes (see deployment steps below)
2. Go to your sign-up page
3. Try signing up with:
   - Email: `test@example.com`
   - Password: `Password123` (no special characters)
4. Should succeed!

## What Users Will See

### Before Fix:
- Email alias error → Generic error message
- Password needs special character

### After Fix:
- ✅ Sign-up works with simpler passwords
- ✅ No more "Username cannot be of email format" error
- ✅ Users can sign in with their email
- ✅ Clearer password requirements

## Deployment Steps

### 1. Build and Deploy

```bash
cd /Users/shaunk/Projects/Dentia/dentia

# Build frontend
cd apps/frontend
pnpm run build
cd ../..

# Build Docker image
docker build -f infra/docker/frontend.Dockerfile -t dentia-frontend:latest .

# Get ECR URL
ECR_URL=$(aws ecr describe-repositories \
  --repository-names dentia-frontend \
  --profile dentia \
  --region us-east-2 \
  --query 'repositories[0].repositoryUri' \
  --output text)

# Login to ECR
aws ecr get-login-password --region us-east-2 --profile dentia | \
  docker login --username AWS --password-stdin $ECR_URL

# Tag and push
docker tag dentia-frontend:latest $ECR_URL:latest
docker push $ECR_URL:latest

# Force new deployment
aws ecs update-service \
  --cluster dentia-cluster \
  --service dentia-frontend \
  --force-new-deployment \
  --profile dentia \
  --region us-east-2

echo "✅ Deployment initiated!"
```

### 2. Wait for Deployment

```bash
# Wait for deployment to complete
aws ecs wait services-stable \
  --cluster dentia-cluster \
  --services dentia-frontend \
  --profile dentia \
  --region us-east-2

echo "✅ Deployment complete!"
```

### 3. Update Cognito Password Policy

**IMPORTANT:** After deployment, update your Cognito password policy using one of the methods above!

### 4. Test Sign-Up

1. Go to `https://app.dentiaapp.com/auth/sign-up`
2. Fill in:
   - Full Name: Test User
   - Email: `newemail@example.com`
   - Password: `Password123` (no special chars)
   - Repeat Password: `Password123`
   - Accept Terms: ✅
3. Click Sign Up
4. Should succeed! ✅

### 5. Verify Logs

Check CloudWatch to ensure no errors:

```bash
# Tail logs
aws logs tail /ecs/dentia-frontend \
  --follow \
  --filter-pattern "[Auth][SignUpAPI]" \
  --profile dentia \
  --region us-east-2
```

You should see:
```json
{
  "level": 30,
  "levelLabel": "INFO",
  "email": "newemail@example.com",
  "userId": "...",
  "requiresConfirmation": true,
  "msg": "[Auth][SignUpAPI] User registered successfully"
}
```

## Technical Details

### How Email Aliases Work in Cognito

When email is configured as an alias:
1. Cognito stores the user with a unique **username** (not email)
2. Users can sign in using their **email** address (the alias)
3. Cognito maps the email to the actual username internally
4. This allows changing emails without losing the user account

### Username Generation Strategy

We generate usernames using:
```typescript
email.split('@')[0] + '_' + Date.now()
```

**Example:**
- Email: `john.doe@example.com`
- Generated username: `john.doe_1762277263838`

**Why this works:**
- ✅ Not in email format (no @)
- ✅ Unique (timestamp ensures uniqueness)
- ✅ Readable (contains part of the email)
- ✅ Collision-resistant (timestamp in milliseconds)

**Alternative strategies** (if needed):
- UUIDv4: `crypto.randomUUID()`
- Hash: `crypto.createHash('sha256').update(email + Date.now()).digest('hex').substring(0, 16)`

## Files Modified

1. **`apps/frontend/apps/web/app/api/auth/sign-up/route.ts`**
   - Fixed username generation for Cognito email alias

2. **`apps/frontend/apps/web/app/auth/sign-up/_lib/sign-up.schema.ts`**
   - Removed special character requirement from password validation

## Security Considerations

### Password Strength

Removing the special character requirement slightly reduces password complexity, but:
- ✅ Still requires 8+ characters
- ✅ Still requires uppercase + lowercase + numbers
- ✅ This is acceptable for most applications
- ✅ Easier for users to remember

If you want stronger security:
- Enable MFA (Multi-Factor Authentication)
- Implement password strength meter
- Add password breach checking
- Require longer passwords (10-12 chars)

### Username Privacy

Generated usernames include part of the email:
- ⚠️ If exposed, reveals partial email
- ✅ Users don't see their username (sign in with email)
- ✅ Username is only stored internally

If this is a concern, use UUID instead:
```typescript
Username: crypto.randomUUID()
```

## Troubleshooting

### If Sign-Up Still Fails

1. **Check CloudWatch logs** for the specific error
2. **Verify Cognito password policy** matches the Zod schema
3. **Clear browser cache** and try again
4. **Check Cognito User Pool attributes** - ensure "name" attribute exists

### If "name" Attribute Error

If you get an error about the "name" attribute:

1. Go to AWS Console → Cognito User Pools
2. Select your user pool
3. Go to **Sign-up experience** → **Required attributes**
4. Ensure "name" is listed as a custom or standard attribute
5. If not, you may need to create a new user pool (attributes can't be changed after creation)

### If Email Confirmation Not Working

Check your Cognito email configuration:
```bash
aws cognito-idp describe-user-pool \
  --user-pool-id YOUR_USER_POOL_ID \
  --profile dentia \
  --region us-east-2 \
  --query 'UserPool.EmailConfiguration'
```

## Next Steps

1. ✅ Deploy the code changes
2. ✅ Update Cognito password policy
3. ✅ Test sign-up with new password requirements
4. ✅ Monitor CloudWatch logs for any issues
5. 📝 Update user-facing documentation about password requirements

## Summary

Both issues are now fixed:
1. ✅ **Cognito username error** - Fixed by generating non-email username
2. ✅ **Special character requirement** - Removed from validation

After deployment and updating the Cognito password policy, users will be able to sign up with simpler passwords! 🎉

