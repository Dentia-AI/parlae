# Cognito Login Troubleshooting Guide

## Error: InvalidParameterException on Login

If you're seeing `InvalidParameterException` when trying to sign in, even with the correct password, here are the most common causes and solutions:

## 1. USER_PASSWORD_AUTH Not Enabled (MOST COMMON)

The `USER_PASSWORD_AUTH` authentication flow must be enabled in your Cognito User Pool app client settings.

### Solution:

1. Go to **AWS Console** → **Cognito** → **User Pools**
2. Select your User Pool
3. Go to **App integration** tab → **App clients and analytics**
4. Click on your app client
5. Click **Edit** under **Hosted UI settings** or **Authentication flows**
6. Make sure **ALLOW_USER_PASSWORD_AUTH** is **enabled**
7. Click **Save changes**

### Using AWS CLI:

```bash
aws cognito-idp update-user-pool-client \
  --user-pool-id <YOUR_USER_POOL_ID> \
  --client-id <YOUR_CLIENT_ID> \
  --explicit-auth-flows USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH
```

## 2. User Status Not CONFIRMED

The user might have verified their email, but their Cognito status might not be fully confirmed.

### Check User Status:

```bash
aws cognito-idp admin-get-user \
  --user-pool-id <YOUR_USER_POOL_ID> \
  --username <username_timestamp>  # e.g., "rafa.inspired9+2_1762314473250"
```

Look for the `UserStatus` field. It should be **`CONFIRMED`**.

### If Status is FORCE_CHANGE_PASSWORD or UNCONFIRMED:

```bash
# Manually confirm the user
aws cognito-idp admin-confirm-sign-up \
  --user-pool-id <YOUR_USER_POOL_ID> \
  --username <username_timestamp>
```

## 3. App Client Secret Configuration

Make sure your app client is configured correctly:

### Check if Secret Hash is Required:

1. Go to **AWS Console** → **Cognito** → **User Pools**
2. Select your User Pool → **App clients**
3. Check if **"Generate client secret"** is enabled for your app client

If it's enabled, make sure your `COGNITO_CLIENT_SECRET` environment variable is set correctly.

## 4. Password Policy Issues

The password might not meet Cognito's password policy requirements.

### Check Password Policy:

1. Go to **AWS Console** → **Cognito** → **User Pools**
2. Select your User Pool → **Sign-in experience** → **Password policy**
3. Verify the requirements (minimum length, special characters, etc.)

### Common Requirements:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

## 5. View Detailed Error Messages

I've added enhanced logging to help debug. After redeploying, check CloudWatch logs for:

```
[Auth][Cognito] InitiateAuth failed
```

This will show:
- The specific error type from Cognito
- The error message
- The username being used
- The full response payload

## Testing Your Fix

### Test 1: Check Cognito Configuration

```bash
# Get user pool details
aws cognito-idp describe-user-pool --user-pool-id <YOUR_USER_POOL_ID>

# Get app client details
aws cognito-idp describe-user-pool-client \
  --user-pool-id <YOUR_USER_POOL_ID> \
  --client-id <YOUR_CLIENT_ID>
```

Look for `ExplicitAuthFlows` - it should include `USER_PASSWORD_AUTH`.

### Test 2: Test Authentication Directly

```bash
# Get the username from your database
# It's in the format: email_prefix_timestamp
# e.g., "rafa.inspired9+2_1762314473250"

# Then test:
aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id <YOUR_CLIENT_ID> \
  --auth-parameters \
      USERNAME=<username>,PASSWORD=<password>,SECRET_HASH=<calculated_secret_hash>
```

### Test 3: Create a New Test User

```bash
# Create user
aws cognito-idp admin-create-user \
  --user-pool-id <YOUR_USER_POOL_ID> \
  --username test_user_$(date +%s) \
  --user-attributes Name=email,Value=test@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id <YOUR_USER_POOL_ID> \
  --username test_user_<timestamp> \
  --password "TestPassword123!" \
  --permanent

# Then try logging in with this user
```

## Common Error Messages

### "USER_PASSWORD_AUTH flow not enabled"
→ Enable USER_PASSWORD_AUTH in app client settings (see Solution #1)

### "User is not confirmed"
→ Run `admin-confirm-sign-up` (see Solution #2)

### "Incorrect username or password"
→ Password doesn't match or user doesn't exist

### "InvalidParameterException: Missing required parameter USERNAME"
→ Username format issue or missing from database

### "InvalidParameterException: Invalid user pool configuration"
→ App client configuration issue (check Solution #3)

## Quick Fix Checklist

- [ ] Verify USER_PASSWORD_AUTH is enabled in Cognito
- [ ] Check user status is CONFIRMED in Cognito
- [ ] Verify COGNITO_CLIENT_SECRET environment variable is set
- [ ] Check password meets policy requirements
- [ ] Verify user exists in database with cognitoUsername field populated
- [ ] Check CloudWatch logs for detailed error message
- [ ] Test with a fresh user account

## Still Having Issues?

Check the enhanced logs in CloudWatch after redeploying:

```
[Auth][Cognito] InitiateAuth failed
{
  error: "InvalidParameterException",
  message: "Detailed error message here",
  username: "user_1234567890",
  response: { full Cognito response }
}
```

This will tell you exactly what Cognito is complaining about.

