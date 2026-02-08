'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { randomUUID } from 'crypto';

import { prisma } from '@kit/prisma';
import { getSessionUser } from '@kit/shared/auth';

import { isAdminUser } from '~/lib/auth/admin';

const IMPERSONATION_TOKEN_COOKIE = 'impersonation-token';

const impersonateSchema = z.object({
  userId: z.string().uuid({ message: 'Invalid user id' }),
});

export async function impersonateUserAction(formData: FormData) {
  const parsed = impersonateSchema.safeParse({
    userId: formData.get('userId'),
  });

  if (!parsed.success) {
    throw new Error(JSON.stringify(parsed.error.issues));
  }

  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    redirect('/auth/sign-in');
  }

  if (!isAdminUser(sessionUser.id)) {
    throw new Error('Unauthorized');
  }

  const targetUser = await prisma.user.findUnique({
    where: {
      id: parsed.data.userId,
    },
    select: {
      id: true,
      email: true,
    },
  });

  if (!targetUser) {
    throw new Error('User not found');
  }

  // Get request info
  const headersList = await headers();
  const ipAddress = headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? null;
  const userAgent = headersList.get('user-agent') ?? null;

  // Create a unique session token
  const sessionToken = randomUUID();

  // End any existing active impersonation sessions for this admin
  await prisma.impersonationSession.updateMany({
    where: {
      adminId: sessionUser.id,
      isActive: true,
    },
    data: {
      isActive: false,
      endedAt: new Date(),
    },
  });

  // Create new impersonation session
  await prisma.impersonationSession.create({
    data: {
      adminId: sessionUser.id,
      targetUserId: targetUser.id,
      sessionToken,
      ipAddress,
      userAgent,
      isActive: true,
    },
  });

  // Store the impersonation token in a cookie
  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATION_TOKEN_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });

  redirect('/home');
}

export async function stopImpersonationAction() {
  const cookieStore = await cookies();
  const token = cookieStore.get(IMPERSONATION_TOKEN_COOKIE)?.value;

  if (!token) {
    redirect('/admin');
  }

  // End the impersonation session
  await prisma.impersonationSession.updateMany({
    where: {
      sessionToken: token,
      isActive: true,
    },
    data: {
      isActive: false,
      endedAt: new Date(),
    },
  });

  // Delete the cookie
  cookieStore.delete(IMPERSONATION_TOKEN_COOKIE);

  redirect('/admin');
}
