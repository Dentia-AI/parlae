# New Multi-Account Management Architecture

## Overview

You're building a platform where:
- **Account Managers** (main users) can manage multiple client accounts
- **Employees/Admins** can be granted access to specific accounts
- **Ads/Campaigns** are tied to specific accounts
- **Permissions** are controlled by the account manager

## Database Schema Design

### 1. `users` Table (Account Managers & Employees)

All users in the system, whether they're account managers or employees.

```sql
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY,  -- Cognito UserSub
  email VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(255),
  role VARCHAR(50) NOT NULL CHECK (role IN ('account_manager', 'employee')),
  created_by_id UUID REFERENCES public.users(id) ON DELETE SET NULL,  -- For employees
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_created_by ON public.users(created_by_id);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can see themselves and employees they created
CREATE POLICY "users_read" ON public.users FOR SELECT
  TO authenticated USING (
    id = auth.uid() OR 
    created_by_id = auth.uid()
  );
```

### 2. `accounts` Table (Client Accounts)

Business accounts that are managed. Each account represents a client/project.

```sql
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}',  -- Custom fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_accounts_owner ON public.accounts(owner_id);
CREATE INDEX idx_accounts_slug ON public.accounts(slug);

-- Enable RLS
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- Users can see accounts they own or have access to
CREATE POLICY "accounts_read" ON public.accounts FOR SELECT
  TO authenticated USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.account_access
      WHERE account_id = accounts.id
      AND user_id = auth.uid()
    )
  );

-- Only owners can modify accounts
CREATE POLICY "accounts_modify" ON public.accounts FOR ALL
  TO authenticated USING (owner_id = auth.uid());
```

### 3. `account_access` Table (Permissions)

Links users (employees) to accounts with specific permissions.

```sql
-- Permission types enum
CREATE TYPE public.account_permission AS ENUM (
  'view_campaigns',
  'create_campaigns',
  'edit_campaigns',
  'delete_campaigns',
  'view_analytics',
  'manage_billing',
  'manage_settings'
);

-- Access role enum
CREATE TYPE public.access_role AS ENUM (
  'owner',      -- Full access
  'admin',      -- Can manage everything except billing
  'editor',     -- Can create/edit campaigns
  'viewer'      -- Can only view
);

CREATE TABLE IF NOT EXISTS public.account_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role public.access_role NOT NULL DEFAULT 'viewer',
  permissions public.account_permission[] DEFAULT '{}',  -- Specific permissions
  granted_by_id UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, user_id)
);

CREATE INDEX idx_account_access_user ON public.account_access(user_id);
CREATE INDEX idx_account_access_account ON public.account_access(account_id);

-- Enable RLS
ALTER TABLE public.account_access ENABLE ROW LEVEL SECURITY;

-- Account owners and granted users can see access
CREATE POLICY "account_access_read" ON public.account_access FOR SELECT
  TO authenticated USING (
    user_id = auth.uid() OR
    granted_by_id = auth.uid() OR
    account_id IN (
      SELECT id FROM public.accounts WHERE owner_id = auth.uid()
    )
  );

-- Only account owners can manage access
CREATE POLICY "account_access_manage" ON public.account_access FOR ALL
  TO authenticated USING (
    account_id IN (
      SELECT id FROM public.accounts WHERE owner_id = auth.uid()
    )
  );
```

### 4. `campaigns` Table (Example: Ads related to accounts)

```sql
CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  budget DECIMAL(10, 2),
  created_by_id UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campaigns_account ON public.campaigns(account_id);
CREATE INDEX idx_campaigns_created_by ON public.campaigns(created_by_id);

-- Enable RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Users can see campaigns for accounts they have access to
CREATE POLICY "campaigns_read" ON public.campaigns FOR SELECT
  TO authenticated USING (
    account_id IN (
      SELECT id FROM public.accounts WHERE owner_id = auth.uid()
      UNION
      SELECT account_id FROM public.account_access WHERE user_id = auth.uid()
    )
  );

-- Users can create campaigns if they have permission
CREATE POLICY "campaigns_create" ON public.campaigns FOR INSERT
  TO authenticated WITH CHECK (
    account_id IN (
      SELECT id FROM public.accounts WHERE owner_id = auth.uid()
      UNION
      SELECT account_id FROM public.account_access 
      WHERE user_id = auth.uid() 
      AND (role IN ('owner', 'admin', 'editor') 
           OR 'create_campaigns' = ANY(permissions))
    )
  );

-- Users can edit campaigns if they have permission
CREATE POLICY "campaigns_update" ON public.campaigns FOR UPDATE
  TO authenticated USING (
    account_id IN (
      SELECT id FROM public.accounts WHERE owner_id = auth.uid()
      UNION
      SELECT account_id FROM public.account_access 
      WHERE user_id = auth.uid() 
      AND (role IN ('owner', 'admin', 'editor') 
           OR 'edit_campaigns' = ANY(permissions))
    )
  );

-- Users can delete campaigns if they have permission
CREATE POLICY "campaigns_delete" ON public.campaigns FOR DELETE
  TO authenticated USING (
    account_id IN (
      SELECT id FROM public.accounts WHERE owner_id = auth.uid()
      UNION
      SELECT account_id FROM public.account_access 
      WHERE user_id = auth.uid() 
      AND (role IN ('owner', 'admin') 
           OR 'delete_campaigns' = ANY(permissions))
    )
  );
```

## Updated Sign-Up Flow

### Modified `ensureUserProvisioned` Function

```typescript
// packages/shared/src/auth/ensure-user.ts

export async function ensureUserProvisioned(
  params: EnsureUserParams, 
  db: PrismaClient = prisma
) {
  const email = params.email.trim().toLowerCase();
  const userId = params.userId.trim();
  const displayName = fallbackDisplayName(email, params.displayName);

  return db.$transaction(async (tx) => {
    // 1. Create or update user as account_manager
    let user = await tx.user.findUnique({
      where: { email },
    });

    if (!user) {
      user = await tx.user.create({
        data: {
          id: userId,
          email,
          displayName,
          role: 'account_manager',  // New users are account managers
          createdById: null,
        },
      });
    }

    // 2. Create a default account for the account manager (optional)
    // You might want to skip this and let them create accounts manually
    let defaultAccount = await tx.account.findFirst({
      where: {
        ownerId: user.id,
        slug: `${slugify(displayName)}-default`,
      },
    });

    if (!defaultAccount) {
      const slug = await generateUniqueAccountSlug(tx, displayName);
      
      defaultAccount = await tx.account.create({
        data: {
          name: `${displayName}'s Account`,
          slug,
          ownerId: user.id,
        },
      });

      // Grant owner access to the default account
      await tx.accountAccess.create({
        data: {
          accountId: defaultAccount.id,
          userId: user.id,
          role: 'owner',
          grantedById: user.id,
        },
      });
    }

    return {
      user,
      defaultAccount,
    };
  });
}
```

## User Workflows

### 1. Account Manager Creates an Account

```typescript
// Server action: create-account.ts
'use server';

import { enhanceAction } from '@kit/next/actions';
import { z } from 'zod';
import { prisma } from '@kit/prisma';

const CreateAccountSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});

export const createAccountAction = enhanceAction(
  async function(data, user) {
    // Generate unique slug
    const slug = await generateUniqueSlug(data.name);

    const account = await prisma.account.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        ownerId: user.id,
      },
    });

    // Grant owner access
    await prisma.accountAccess.create({
      data: {
        accountId: account.id,
        userId: user.id,
        role: 'owner',
        grantedById: user.id,
      },
    });

    return { account };
  },
  {
    auth: true,
    schema: CreateAccountSchema,
  }
);
```

### 2. Account Manager Invites an Employee

```typescript
// Server action: invite-employee.ts
'use server';

import { enhanceAction } from '@kit/next/actions';
import { z } from 'zod';
import { prisma } from '@kit/prisma';

const InviteEmployeeSchema = z.object({
  email: z.string().email(),
  displayName: z.string().optional(),
  accountIds: z.array(z.string().uuid()),  // Accounts to grant access to
  role: z.enum(['admin', 'editor', 'viewer']),
  permissions: z.array(z.string()).optional(),
});

export const inviteEmployeeAction = enhanceAction(
  async function(data, user) {
    // 1. Create employee user (or find existing)
    let employee = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!employee) {
      // Create a "pending" employee
      // You'll need to handle Cognito user creation separately
      employee = await prisma.user.create({
        data: {
          id: generateTempId(), // Replace with actual Cognito flow
          email: data.email,
          displayName: data.displayName || data.email,
          role: 'employee',
          createdById: user.id,
        },
      });
    }

    // 2. Grant access to specified accounts
    const accessRecords = data.accountIds.map(accountId => ({
      accountId,
      userId: employee.id,
      role: data.role,
      permissions: data.permissions || [],
      grantedById: user.id,
    }));

    await prisma.accountAccess.createMany({
      data: accessRecords,
      skipDuplicates: true,
    });

    // 3. Send invitation email (implement separately)
    // await sendInvitationEmail(employee.email, inviteLink);

    return { employee };
  },
  {
    auth: true,
    schema: InviteEmployeeSchema,
  }
);
```

### 3. Employee Accesses Accounts

```typescript
// Helper function to get user's accounts
export async function getUserAccounts(userId: string) {
  const accounts = await prisma.account.findMany({
    where: {
      OR: [
        { ownerId: userId },  // Accounts they own
        {
          accountAccess: {
            some: {
              userId: userId,  // Accounts they have access to
            },
          },
        },
      ],
    },
    include: {
      accountAccess: {
        where: { userId },
        select: {
          role: true,
          permissions: true,
        },
      },
    },
  });

  return accounts;
}
```

### 4. Check Permissions

```typescript
// Helper function to check if user has permission
export async function hasPermission(
  userId: string,
  accountId: string,
  requiredPermission: string
): Promise<boolean> {
  // Check if user is the owner
  const account = await prisma.account.findFirst({
    where: {
      id: accountId,
      ownerId: userId,
    },
  });

  if (account) return true;  // Owners have all permissions

  // Check access record
  const access = await prisma.accountAccess.findFirst({
    where: {
      accountId,
      userId,
    },
  });

  if (!access) return false;

  // Check role-based permissions
  if (access.role === 'owner' || access.role === 'admin') {
    return true;
  }

  // Check specific permissions
  return access.permissions.includes(requiredPermission);
}
```

## Prisma Schema Updates

```prisma
// packages/prisma/schema.prisma

model User {
  id            String    @id
  email         String    @unique
  displayName   String?   @map("display_name")
  role          UserRole
  createdById   String?   @map("created_by_id")
  createdBy     User?     @relation("EmployeeManager", fields: [createdById], references: [id])
  employees     User[]    @relation("EmployeeManager")
  
  ownedAccounts Account[] @relation("AccountOwner")
  accountAccess AccountAccess[]
  campaigns     Campaign[]
  
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  @@map("users")
}

enum UserRole {
  account_manager
  employee
}

model Account {
  id          String   @id @default(uuid())
  name        String
  slug        String   @unique
  description String?
  ownerId     String   @map("owner_id")
  owner       User     @relation("AccountOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  metadata    Json     @default("{}")
  
  accountAccess AccountAccess[]
  campaigns     Campaign[]
  
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@map("accounts")
}

model AccountAccess {
  id          String            @id @default(uuid())
  accountId   String            @map("account_id")
  account     Account           @relation(fields: [accountId], references: [id], onDelete: Cascade)
  userId      String            @map("user_id")
  user        User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  role        AccessRole
  permissions AccountPermission[]
  grantedById String            @map("granted_by_id")
  
  createdAt   DateTime          @default(now()) @map("created_at")
  updatedAt   DateTime          @updatedAt @map("updated_at")

  @@unique([accountId, userId])
  @@map("account_access")
}

enum AccessRole {
  owner
  admin
  editor
  viewer
}

enum AccountPermission {
  view_campaigns
  create_campaigns
  edit_campaigns
  delete_campaigns
  view_analytics
  manage_billing
  manage_settings
}

model Campaign {
  id          String   @id @default(uuid())
  accountId   String   @map("account_id")
  account     Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  name        String
  description String?
  status      String   @default("draft")
  budget      Decimal? @db.Decimal(10, 2)
  createdById String   @map("created_by_id")
  createdBy   User     @relation(fields: [createdById], references: [id])
  
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@map("campaigns")
}
```

## UI Component Example

```typescript
// components/account-selector.tsx
'use client';

import { useEffect, useState } from 'react';
import { Select } from '@kit/ui/select';

export function AccountSelector() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);

  useEffect(() => {
    // Fetch user's accounts
    fetch('/api/accounts')
      .then(res => res.json())
      .then(data => setAccounts(data.accounts));
  }, []);

  return (
    <Select
      value={selectedAccount}
      onChange={setSelectedAccount}
      options={accounts.map(acc => ({
        label: acc.name,
        value: acc.id,
      }))}
    />
  );
}
```

## Summary

### Key Changes:

1. **✅ Single `users` table** for both account managers and employees
2. **✅ `accounts` table** for client accounts (not personal workspaces)
3. **✅ `account_access` table** with granular permissions
4. **✅ Account managers control** who has access to what
5. **✅ Employees can access** only assigned accounts
6. **✅ All data (campaigns, ads, etc.)** tied to accounts

### Benefits:

- ✅ Scalable multi-tenant architecture
- ✅ Flexible permission system
- ✅ Clear separation of concerns
- ✅ RLS policies for data security
- ✅ Easy to add new permission types

Would you like me to generate the migration files and update the sign-up route to implement this new architecture?

