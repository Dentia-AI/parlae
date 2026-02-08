import { prisma } from '@kit/prisma';
import { NotificationType, NotificationChannel } from '@prisma/client';

export interface CreateNotificationParams {
  accountId: string;
  body: string;
  type: NotificationType;
  channel?: NotificationChannel;
  link?: string;
  expiresAt?: Date;
}

/**
 * Creates a notification for an account
 */
export async function createNotification(params: CreateNotificationParams) {
  return prisma.notification.create({
    data: {
      accountId: params.accountId,
      body: params.body,
      type: params.type,
      channel: params.channel || 'IN_APP',
      link: params.link,
      expiresAt: params.expiresAt,
    },
  });
}

/**
 * Creates a notification and optionally sends an email
 */
export async function notifyUser(
  params: CreateNotificationParams & { sendEmail?: boolean }
) {
  // Create in-app notification
  const notification = await createNotification({
    ...params,
    channel: 'IN_APP',
  });

  // Optionally send email
  if (params.sendEmail) {
    await createNotification({
      ...params,
      channel: 'EMAIL',
    });

    // Send email notification
    const { sendNotificationEmail } = await import('./send-notification-email');
    await sendNotificationEmail(notification);
  }

  return notification;
}

/**
 * Gets unread notifications for an account
 */
export async function getUnreadNotifications(accountId: string) {
  return prisma.notification.findMany({
    where: {
      accountId,
      dismissed: false,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 50,
  });
}

/**
 * Marks a notification as dismissed
 */
export async function dismissNotification(notificationId: number) {
  return prisma.notification.update({
    where: { id: notificationId },
    data: { dismissed: true },
  });
}

/**
 * Marks all notifications as dismissed for an account
 */
export async function dismissAllNotifications(accountId: string) {
  return prisma.notification.updateMany({
    where: {
      accountId,
      dismissed: false,
    },
    data: {
      dismissed: true,
    },
  });
}

/**
 * Deletes old dismissed notifications (cleanup job)
 */
export async function cleanupOldNotifications(daysOld: number = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  return prisma.notification.deleteMany({
    where: {
      dismissed: true,
      createdAt: {
        lt: cutoffDate,
      },
    },
  });
}

