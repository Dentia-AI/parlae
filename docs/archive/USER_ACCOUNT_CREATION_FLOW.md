# User Account Creation Flow

## What Happens When a User Signs Up?

Yes! When a user successfully signs up, they automatically get **THREE database entries** created:

1. **User entry** in the `users` table
2. **Personal Account entry** in the `accounts` table
3. **Account Membership** linking them as the owner

Let me break down exactly what happens:

## The Complete Sign-Up Flow

### Step 1: User Fills Out Sign-Up Form

```
User enters:
- Full Name: "John Doe"
- Email: "john.doe@example.com"
- Password: "Password123"
```

### Step 2: Cognito Creates Auth User

Your signup API route sends the data to AWS Cognito:

```typescript
// In sign-up/route.ts
const cognitoResponse = await fetch('cognito-idp', {
  body: JSON.stringify({
    Username: "john.doe_1762277263838",  // Generated unique username
    Password: "Password123",
    UserAttributes: [
      { Name: 'email', Value: 'john.doe@example.com' },
      { Name: 'name', Value: 'John Doe' },
    ],
  }),
});

// Cognito returns:
{
  UserSub: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  // Cognito user ID
  UserConfirmed: false  // Email confirmation required
}
```

### Step 3: Database Provisioning (`ensureUserProvisioned`)

After Cognito succeeds, the `ensureUserProvisioned` function creates the database entries:

#### 3a. Create User Entry

```sql
-- Table: users
INSERT INTO users (id, email, displayName)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',  -- From Cognito UserSub
  'john.doe@example.com',
  'John Doe'
);
```

#### 3b. Generate Slug for Personal Account

The system creates a unique slug (handle) for the account:

```typescript
// Slug generation logic:
const accountBaseName = "John Doe" || "john.doe@example.com";
const slug = generateUniqueAccountSlug(accountBaseName);

// Process:
1. Slugify: "John Doe" → "john-doe"
2. Check if "john-doe" exists in database
3. If exists, append suffix: "john-doe-2", "john-doe-3", etc.
4. Return first available slug
```

**Example slugs:**
- `john-doe` (if first John Doe)
- `john-doe-2` (if another John Doe exists)
- `jane-smith` (for Jane Smith)
- `rafa-inspired9` (for rafa.inspired9@gmail.com)

#### 3c. Create Personal Account Entry

```sql
-- Table: accounts
INSERT INTO accounts (id, name, slug, isPersonalAccount, primaryOwnerId, email)
VALUES (
  'generated-uuid',
  'John Doe\'s Workspace',        -- Account name
  'john-doe',                      -- Unique slug (handle)
  true,                            -- It's a personal account
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',  -- User ID
  'john.doe@example.com'
);
```

#### 3d. Create Owner Role (if doesn't exist)

```sql
-- Table: roles
INSERT INTO roles (name, hierarchyLevel)
VALUES ('owner', 100)
ON CONFLICT DO NOTHING;
```

#### 3e. Create Account Membership

```sql
-- Table: account_memberships
INSERT INTO account_memberships (accountId, userId, roleName)
VALUES (
  'account-uuid',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'owner'
);
```

## What is the User's Handle/Identifier?

The user has **multiple identifiers** depending on the context:

### 1. **Cognito Username** (for authentication)
- Format: `{email-local-part}_{timestamp}`
- Example: `john.doe_1762277263838`
- **Where used:** Internal Cognito authentication only
- **Users never see this**

### 2. **User ID** (database primary key)
- Format: UUID from Cognito
- Example: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
- **Where used:** Internal database relationships
- **Users never see this**

### 3. **Account Slug** (public handle) ⭐
- Format: Slugified name (lowercase, hyphens, unique)
- Example: `john-doe`, `jane-smith-2`
- **Where used:** 
  - URLs: `/home/john-doe`
  - Public profile links
  - Team workspace URLs
- **This is the user-facing handle!**

### 4. **Email** (for sign-in)
- Example: `john.doe@example.com`
- **Where used:** User signs in with their email
- **Users see and use this**

## How Users Access Their Account

### Personal Account Dashboard

After signing up and confirming email, users access their workspace via:

```
URL: /home/(user)/
```

This is their **personal account workspace**, where:
- They can access billing
- Manage their settings
- Use the application features

### Account Slug Usage

If you want to reference their personal account by slug:

```
URL: /home/john-doe
```

The system will route to their personal workspace.

## Database Schema Overview

```
┌─────────────────┐
│     users       │
├─────────────────┤
│ id (PK)         │ ← Cognito UserSub
│ email (unique)  │
│ displayName     │
└─────────────────┘
         │
         │ primaryOwnerId
         ▼
┌─────────────────┐
│    accounts     │
├─────────────────┤
│ id (PK)         │
│ name            │
│ slug (unique)   │ ← The public handle!
│ email           │
│ primaryOwnerId  │
│ isPersonalAccount │
└─────────────────┘
         │
         │ accountId
         ▼
┌────────────────────┐
│ account_memberships│
├────────────────────┤
│ accountId (FK)     │
│ userId (FK)        │
│ roleName           │ → 'owner'
└────────────────────┘
```

## Accessing User Data in Your App

### In Server Components

```typescript
import { requireUser } from '~/lib/server/require-user-in-server-component';

async function MyServerComponent() {
  const user = await requireUser();
  
  console.log(user.id);          // Cognito UUID
  console.log(user.email);       // john.doe@example.com
  console.log(user.displayName); // "John Doe"
}
```

### In Client Components (Personal Account Context)

```typescript
'use client';

import { useUserWorkspace } from '@kit/accounts/hooks/use-user-workspace';

function MyClientComponent() {
  const { user, account } = useUserWorkspace();
  
  console.log(user.id);          // Cognito UUID
  console.log(user.email);       // john.doe@example.com
  console.log(user.displayName); // "John Doe"
  
  console.log(account.slug);     // "john-doe" ← The handle!
  console.log(account.name);     // "John Doe's Workspace"
  console.log(account.id);       // Account UUID
}
```

## Example: Complete User Record

After signup for `rafa.inspired9@gmail.com`:

**Cognito:**
```json
{
  "Username": "rafa.inspired9_1762277263838",
  "UserSub": "abc123-def456-...",
  "Attributes": [
    { "Name": "email", "Value": "rafa.inspired9@gmail.com" },
    { "Name": "name", "Value": "Rafa" }
  ]
}
```

**Database - users table:**
```json
{
  "id": "abc123-def456-...",
  "email": "rafa.inspired9@gmail.com",
  "displayName": "Rafa"
}
```

**Database - accounts table:**
```json
{
  "id": "xyz789-uvw012-...",
  "name": "Rafa's Workspace",
  "slug": "rafa",                    ← The handle!
  "email": "rafa.inspired9@gmail.com",
  "isPersonalAccount": true,
  "primaryOwnerId": "abc123-def456-..."
}
```

**Database - account_memberships table:**
```json
{
  "accountId": "xyz789-uvw012-...",
  "userId": "abc123-def456-...",
  "roleName": "owner"
}
```

## Important Notes

### 1. Slug Generation Rules

The slug (handle) is generated by:
1. Taking the display name or email local part
2. Converting to lowercase
3. Replacing non-alphanumeric characters with hyphens
4. Removing leading/trailing hyphens
5. Truncating to 64 characters max
6. Adding suffix if duplicate exists

**Examples:**
- "John Doe" → `john-doe`
- "Jane Smith" → `jane-smith`
- "rafa.inspired9@gmail.com" → `rafa-inspired9`
- "TestUser123" → `testuser123`
- "User@#$123" → `user-123`

### 2. Duplicate Handling

If a slug already exists, a suffix is added:
- First user: `john-doe`
- Second user: `john-doe-2`
- Third user: `john-doe-3`

### 3. Idempotent Operations

The `ensureUserProvisioned` function is **safe to call multiple times**:
- It checks if the user exists before creating
- It checks if the account exists before creating
- It uses `upsert` for memberships and roles

This means:
- Safe for retries
- Safe for simultaneous logins (e.g., OAuth + email confirmation)
- No duplicate entries

### 4. Personal vs Team Accounts

**Personal Accounts:**
- `isPersonalAccount: true`
- One per user (automatically created)
- User is the primary owner
- Slug is based on user's name

**Team Accounts:**
- `isPersonalAccount: false`
- Created manually by users
- Can have multiple members
- Slug is based on team name

## Where to Find User's Slug/Handle

### Method 1: From UserWorkspaceContext

```typescript
const { account } = useUserWorkspace();
const userHandle = account.slug; // "john-doe"
```

### Method 2: Query Database

```typescript
import { prisma } from '@kit/prisma';

const account = await prisma.account.findFirst({
  where: {
    primaryOwnerId: userId,
    isPersonalAccount: true,
  },
  select: {
    slug: true,
  },
});

console.log(account.slug); // "john-doe"
```

### Method 3: Via URL

After login, check the browser URL:
```
/home/(user) → Personal account (slug not in URL)
/home/john-doe → Team account "john-doe"
```

## Summary

✅ **Yes, users get an account table entry automatically**

The user's **handle** in the app is the **`slug`** field from the `accounts` table:
- Format: `lowercase-with-hyphens`
- Unique across all accounts
- Based on their name or email
- Used in URLs and public references

**Example for your user `rafa.inspired9@gmail.com`:**
- Cognito Username: `rafa.inspired9_1762277263838` (internal)
- User ID: `abc123...` (internal)
- **Account Slug (Handle): `rafa-inspired9` or `rafa`** ⭐
- Email: `rafa.inspired9@gmail.com` (for sign-in)

