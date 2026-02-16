import type { Prisma, PrismaClient } from '@kit/prisma';
import { prisma } from '@kit/prisma';

type EnsureUserParams = {
  userId: string;
  email: string;
  displayName?: string | null;
  cognitoUsername?: string | null;
};

/**
 * Normalizes a string into a slug-safe identifier.
 */
function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

async function generateUniqueAccountSlug(tx: PrismaClient | Prisma.TransactionClient, base: string) {
  const normalized = slugify(base) || 'account';
  let candidate = normalized;
  let suffix = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await tx.account.findUnique({
      where: {
        slug: candidate,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return candidate;
    }

    suffix += 1;
    candidate = `${normalized}-${suffix}`;
  }
}

function fallbackDisplayName(email: string, provided?: string | null) {
  if (provided && provided.trim().length > 0) {
    return provided.trim();
  }

  const [local] = email.split('@');

  if (!local) {
    return email;
  }

  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

/**
 * Ensures the given user exists in the database together with a personal account and owner membership.
 * Safe to call multiple times; operations are idempotent.
 */
export async function ensureUserProvisioned(params: EnsureUserParams, db: PrismaClient = prisma) {
  const email = params.email.trim().toLowerCase();

  if (!email) {
    throw new Error('Email is required to provision a user');
  }

  const intendedUserId = params.userId.trim();

  if (!intendedUserId) {
    throw new Error('User ID is required to provision a user');
  }

  const displayName = fallbackDisplayName(email, params.displayName);

  return db.$transaction(async (tx) => {
    let user = await tx.user.findUnique({
      where: { email },
    });

    if (!user) {
      user = await tx.user.create({
        data: {
          id: intendedUserId,
          email,
          displayName,
          cognitoUsername: params.cognitoUsername,
          role: 'ACCOUNT_MANAGER', // New users are account managers
        },
      });
    } else {
      // Update user if there are missing or email-as-name fields
      const updates: Partial<{ displayName: string; cognitoUsername: string }> = {};

      // Update displayName if:
      // 1. It's currently empty, OR
      // 2. It's currently set to the email address (from a previous login that
      //    didn't have the real name) AND we now have a real name
      const hasRealName = displayName && !displayName.includes('@');
      const currentIsEmail =
        user.displayName &&
        (user.displayName === email ||
          user.displayName === params.displayName ||
          user.displayName.includes('@'));

      if (!user.displayName && displayName) {
        updates.displayName = displayName;
      } else if (currentIsEmail && hasRealName) {
        updates.displayName = displayName;
      }

      if (!user.cognitoUsername && params.cognitoUsername) {
        updates.cognitoUsername = params.cognitoUsername;
      }

      if (Object.keys(updates).length > 0) {
        user = await tx.user.update({
          where: { id: user.id },
          data: updates,
        });
      }

      // Also update the account name if it was set to the email
      if (updates.displayName) {
        const personalAccount = await tx.account.findFirst({
          where: {
            primaryOwnerId: user.id,
            isPersonalAccount: true,
          },
        });

        if (
          personalAccount &&
          (personalAccount.name === email || personalAccount.name.includes('@'))
        ) {
          await tx.account.update({
            where: { id: personalAccount.id },
            data: { name: updates.displayName },
          });
        }
      }
    }

    let account = await tx.account.findFirst({
      where: {
        primaryOwnerId: user.id,
        isPersonalAccount: true,
      },
    });

    if (!account) {
      const accountBaseName = displayName || email;
      const slug = await generateUniqueAccountSlug(tx, accountBaseName);

      // Create default account with the same name as the user
      // Most users will have just this one account for their ads/campaigns
      account = await tx.account.create({
        data: {
          name: accountBaseName, // Account name matches user's name
          slug,
          isPersonalAccount: true, // This is their default personal account
          primaryOwnerId: user.id,
          email,
        },
      });
    }

    await tx.role.upsert({
      where: { name: 'owner' },
      update: {},
      create: {
        name: 'owner',
        hierarchyLevel: 100,
      },
    });

    await tx.accountMembership.upsert({
      where: {
        accountId_userId: {
          accountId: account.id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        accountId: account.id,
        userId: user.id,
        roleName: 'owner',
      },
    });

    return {
      user,
      account,
    };
  });
}
