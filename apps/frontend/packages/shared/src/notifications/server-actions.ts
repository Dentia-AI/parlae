'use server';

import { enhanceAction } from '@kit/next/actions';
import { prisma } from '@kit/prisma';
import {
  getUnreadNotifications,
  dismissNotification,
  dismissAllNotifications,
} from './notification-service';
import { z } from 'zod';

const DismissNotificationSchema = z.object({
  notificationId: z.number(),
});

/**
 * Gets unread notifications for the current user's account
 */
export const getNotificationsAction = enhanceAction(
  async (_, user) => {
    // Get user's primary account
    const account = await prisma.account.findFirst({
      where: { primaryOwnerId: user.id },
    });

    if (!account) {
      throw new Error('No account found');
    }

    const notifications = await getUnreadNotifications(account.id);

    return {
      data: notifications,
      success: true,
    };
  },
  {
    auth: true,
  }
);

/**
 * Dismisses a notification
 */
export const dismissNotificationAction = enhanceAction(
  async (data) => {
    await dismissNotification(data.notificationId);

    return {
      success: true,
    };
  },
  {
    auth: true,
    schema: DismissNotificationSchema,
  }
);

/**
 * Dismisses all notifications for the current user
 */
export const dismissAllNotificationsAction = enhanceAction(
  async (_, user) => {
    const account = await prisma.account.findFirst({
      where: { primaryOwnerId: user.id },
    });

    if (!account) {
      throw new Error('No account found');
    }

    await dismissAllNotifications(account.id);

    return {
      success: true,
    };
  },
  {
    auth: true,
  }
);

