# Cognito Sign-In Fix

## Problem

Users were unable to sign in after successfully signing up and verifying their email. All attempts resulted in an `InvalidParameterException` error:

```
Error: InvalidParameterException
at async Object.authorize
```

## Root Cause

The issue stemmed from a mismatch in how usernames were handled during signup vs. sign-in:

### During Signup
1. Cognito is configured with **email as an alias** (not as the username format)
2. To comply with this, the signup process generates a unique username: `${emailPrefix}_${timestamp}`
   - Example: For `rafa.inspired9@gmail.com`, the username becomes `rafa_1762296718775`
3. The `SECRET_HASH` is calculated using this generated username
4. User is created in Cognito with:
   - `Username`: `rafa_1762296718775`
   - `Email`: `rafa.inspired9@gmail.com` (as an attribute)

### During Sign-In (Before Fix)
1. User enters their email address
2. System attempts to authenticate using the **email** as the username
3. System calculates `SECRET_HASH` using the **email**
4. **MISMATCH**: Cognito rejects the request because:
   - The actual username is `rafa_1762296718775`
   - But the `SECRET_HASH` was calculated with `rafa.inspired9@gmail.com`
   - The `SECRET_HASH` formula is: `HMAC_SHA256(username + clientId, clientSecret)`
   - Even a small difference in the username causes complete mismatch

## Solution

Store the Cognito username in the database and look it up during sign-in.

### Changes Made

#### 1. Database Schema (`packages/prisma/schema.prisma`)
Added a new field to the `User` model:
```prisma
model User {
  id              String    @id @default(uuid())
  email           String    @unique
  displayName     String?
  avatarUrl       String?
  cognitoUsername String?   @unique @map("cognito_username")  // NEW FIELD
  role            UserRole  @default(ACCOUNT_MANAGER) @map("role")
  // ...
}
```

#### 2. Migration (`packages/prisma/migrations/.../migration.sql`)
```sql
ALTER TABLE "users" ADD COLUMN "cognito_username" TEXT;
CREATE UNIQUE INDEX "users_cognito_username_key" ON "users"("cognito_username");
```

#### 3. User Provisioning (`apps/frontend/packages/shared/src/auth/ensure-user.ts`)
Updated to accept and save the `cognitoUsername`:
```typescript
type EnsureUserParams = {
  userId: string;
  email: string;
  displayName?: string | null;
  cognitoUsername?: string | null;  // NEW FIELD
};

// Save it during user creation
user = await tx.user.create({
  data: {
    id: intendedUserId,
    email,
    displayName,
    cognitoUsername: params.cognitoUsername,  // SAVED HERE
    role: 'ACCOUNT_MANAGER',
  },
});
```

#### 4. Signup Route (`apps/frontend/apps/web/app/api/auth/sign-up/route.ts`)
Pass the generated username to the provisioning function:
```typescript
const username = email.split('@')[0] + '_' + Date.now();

// Later...
await ensureUserProvisioned({
  userId: payload.UserSub,
  email,
  displayName: fullName,
  cognitoUsername: username,  // PASS IT HERE
});
```

#### 5. Employee Invitation (`apps/frontend/packages/shared/src/employee-management/invite-employee.ts`)
Updated to also store the `cognitoUsername` for employees:
```typescript
export async function acceptInvitation(params: {
  inviteToken: string;
  userId: string;
  email: string;
  displayName?: string;
  cognitoUsername?: string;  // NEW FIELD
}) {
  // ...
  employee = await tx.user.create({
    data: {
      id: userId,
      email: email.toLowerCase(),
      displayName: displayName || email.split('@')[0],
      cognitoUsername,  // SAVED HERE
      role: 'EMPLOYEE',
      createdById: inviterId,
    },
  });
}
```

#### 6. Sign-In Logic (`apps/frontend/packages/shared/src/auth/cognito-helpers.ts`)
**This is the key fix**. Look up the Cognito username before authenticating:
```typescript
export async function initiateUserPasswordAuth(params: {
  email: string;
  password: string;
  clientId: string;
  clientSecret: string;
  issuer: string;
}) {
  const { email, password, clientId, clientSecret, issuer } = params;

  // 🔍 LOOKUP: Get the stored Cognito username from database
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { cognitoUsername: true },
  });

  // Use the stored Cognito username if available
  // Falls back to email for backwards compatibility
  const username = user?.cognitoUsername || email;

  const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      'X-Amz-User-Agent': 'aws-sdk-js/3.x',
    },
    body: JSON.stringify({
      ClientId: clientId,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: username,  // ✅ NOW USES CORRECT USERNAME
        PASSWORD: password,
        SECRET_HASH: createSecretHash(clientId, clientSecret, username),  // ✅ MATCHES!
      },
    }),
  });
  // ...
}
```

## How It Works Now

### Signup Flow
```
User enters: rafa.inspired9@gmail.com
              ↓
Generate username: rafa_1762296718775
              ↓
Create in Cognito with username: rafa_1762296718775
              ↓
Save in database:
  - email: rafa.inspired9@gmail.com
  - cognitoUsername: rafa_1762296718775
```

### Sign-In Flow
```
User enters: rafa.inspired9@gmail.com
              ↓
Look up in database → find cognitoUsername: rafa_1762296718775
              ↓
Authenticate with Cognito using:
  - USERNAME: rafa_1762296718775 ✅
  - SECRET_HASH: HMAC(rafa_1762296718775 + clientId) ✅
              ↓
SUCCESS! 🎉
```

## Deployment

Run the automated deployment script:
```bash
cd /Users/shaunk/Projects/Dentia/dentia
./scripts/fix-cognito-signin.sh
```

The script will:
1. Apply the database migration (add `cognitoUsername` column)
2. Build and push new Docker images for frontend and backend
3. Update ECS services with the new images

## Backwards Compatibility

The fix includes backwards compatibility:
- **New users**: Will have `cognitoUsername` stored and sign-in will work perfectly
- **Existing users** (created before this fix): 
  - If `cognitoUsername` is `NULL`, the system falls back to using the email
  - However, if those users were created with the custom username format, they won't be able to sign in
  - **Resolution**: Those users should either:
    1. Be deleted from Cognito and re-signup, OR
    2. Have their `cognitoUsername` manually updated in the database

## Testing

### 1. Test New Signup
```bash
# 1. Sign up with a new email
# 2. Verify email with the code
# 3. Sign in with email and password
# ✅ Should work!
```

### 2. Check Database
```sql
SELECT id, email, cognito_username FROM users 
WHERE email = 'test@example.com';
```
You should see the `cognito_username` populated like `test_1762296718775`.

### 3. Check CloudWatch Logs
Look for successful auth logs:
```
[Auth][NextAuth] Cognito password auth successful
```

No more `InvalidParameterException` errors!

## Files Changed

- ✅ `packages/prisma/schema.prisma`
- ✅ `packages/prisma/migrations/20251104212242_add_cognito_username/migration.sql`
- ✅ `apps/frontend/packages/shared/src/auth/ensure-user.ts`
- ✅ `apps/frontend/apps/web/app/api/auth/sign-up/route.ts`
- ✅ `apps/frontend/packages/shared/src/employee-management/invite-employee.ts`
- ✅ `apps/frontend/packages/shared/src/auth/cognito-helpers.ts`
- ✅ `scripts/fix-cognito-signin.sh` (new deployment script)

## Related Issues

This fix also resolves:
- The missing `VerifyEmailForm` import error (fixed in same deployment)
- Employee invitation signup flow (now also stores `cognitoUsername`)

## Key Takeaway

**When using Cognito with email aliases, the `SECRET_HASH` must ALWAYS be calculated using the actual Cognito username, not the email alias!**

