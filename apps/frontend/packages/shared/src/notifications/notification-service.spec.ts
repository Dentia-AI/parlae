jest.mock('@kit/prisma', () => ({
  prisma: {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import { prisma } from '@kit/prisma';
import {
  createNotification,
  notifyUser,
  getUnreadNotifications,
  dismissNotification,
  dismissAllNotifications,
  cleanupOldNotifications,
} from './notification-service';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('notification-service', () => {
  describe('createNotification', () => {
    it('creates a notification with required fields', async () => {
      const mockNotification = { id: 1, accountId: 'acc-1', body: 'Hello', type: 'INFO', channel: 'IN_APP' };
      (prisma.notification.create as jest.Mock).mockResolvedValue(mockNotification);

      const result = await createNotification({
        accountId: 'acc-1',
        body: 'Hello',
        type: 'INFO' as any,
      });

      expect(result).toEqual(mockNotification);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          accountId: 'acc-1',
          body: 'Hello',
          type: 'INFO',
          channel: 'IN_APP',
          link: undefined,
          expiresAt: undefined,
        },
      });
    });

    it('uses provided channel instead of default', async () => {
      (prisma.notification.create as jest.Mock).mockResolvedValue({});

      await createNotification({
        accountId: 'acc-1',
        body: 'Test',
        type: 'WARNING' as any,
        channel: 'EMAIL' as any,
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ channel: 'EMAIL' }),
      });
    });

    it('passes optional link and expiresAt', async () => {
      const expiresAt = new Date('2026-12-31');
      (prisma.notification.create as jest.Mock).mockResolvedValue({});

      await createNotification({
        accountId: 'acc-1',
        body: 'Expiring',
        type: 'INFO' as any,
        link: '/dashboard',
        expiresAt,
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          link: '/dashboard',
          expiresAt,
        }),
      });
    });
  });

  describe('notifyUser', () => {
    it('creates an in-app notification without email by default', async () => {
      const mockNotification = { id: 1, accountId: 'acc-1', body: 'Test' };
      (prisma.notification.create as jest.Mock).mockResolvedValue(mockNotification);

      const result = await notifyUser({
        accountId: 'acc-1',
        body: 'Test',
        type: 'INFO' as any,
      });

      expect(result).toEqual(mockNotification);
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ channel: 'IN_APP' }),
      });
    });

    it('creates both in-app and email notifications when sendEmail is true', async () => {
      const mockNotification = { id: 1, accountId: 'acc-1', body: 'Test' };
      (prisma.notification.create as jest.Mock).mockResolvedValue(mockNotification);

      jest.mock('./send-notification-email', () => ({
        sendNotificationEmail: jest.fn().mockResolvedValue(undefined),
      }));

      const result = await notifyUser({
        accountId: 'acc-1',
        body: 'Test',
        type: 'INFO' as any,
        sendEmail: true,
      });

      expect(result).toEqual(mockNotification);
      // First call: IN_APP, second call: EMAIL
      expect(prisma.notification.create).toHaveBeenCalledTimes(2);
      expect(prisma.notification.create).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({ channel: 'IN_APP' }),
      });
      expect(prisma.notification.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({ channel: 'EMAIL' }),
      });
    });

    it('does not send email when sendEmail is false', async () => {
      (prisma.notification.create as jest.Mock).mockResolvedValue({ id: 1 });

      await notifyUser({
        accountId: 'acc-1',
        body: 'No email',
        type: 'INFO' as any,
        sendEmail: false,
      });

      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('getUnreadNotifications', () => {
    it('queries non-dismissed, non-expired notifications for the account', async () => {
      const mockNotifications = [
        { id: 1, body: 'First' },
        { id: 2, body: 'Second' },
      ];
      (prisma.notification.findMany as jest.Mock).mockResolvedValue(mockNotifications);

      const result = await getUnreadNotifications('acc-1');

      expect(result).toEqual(mockNotifications);
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          accountId: 'acc-1',
          dismissed: false,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: expect.any(Date) } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });

    it('returns empty array when no notifications exist', async () => {
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getUnreadNotifications('acc-empty');

      expect(result).toEqual([]);
    });
  });

  describe('dismissNotification', () => {
    it('marks a single notification as dismissed', async () => {
      const updated = { id: 5, dismissed: true };
      (prisma.notification.update as jest.Mock).mockResolvedValue(updated);

      const result = await dismissNotification(5);

      expect(result).toEqual(updated);
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { dismissed: true },
      });
    });
  });

  describe('dismissAllNotifications', () => {
    it('marks all undismissed notifications for an account as dismissed', async () => {
      const updateResult = { count: 3 };
      (prisma.notification.updateMany as jest.Mock).mockResolvedValue(updateResult);

      const result = await dismissAllNotifications('acc-1');

      expect(result).toEqual(updateResult);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { accountId: 'acc-1', dismissed: false },
        data: { dismissed: true },
      });
    });
  });

  describe('cleanupOldNotifications', () => {
    it('deletes dismissed notifications older than the default 30 days', async () => {
      const deleteResult = { count: 10 };
      (prisma.notification.deleteMany as jest.Mock).mockResolvedValue(deleteResult);

      const before = new Date();
      const result = await cleanupOldNotifications();
      const after = new Date();

      expect(result).toEqual(deleteResult);

      const callArgs = (prisma.notification.deleteMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where.dismissed).toBe(true);

      const cutoff = callArgs.where.createdAt.lt as Date;
      const expectedEarliest = new Date(before);
      expectedEarliest.setDate(expectedEarliest.getDate() - 30);
      const expectedLatest = new Date(after);
      expectedLatest.setDate(expectedLatest.getDate() - 30);

      expect(cutoff.getTime()).toBeGreaterThanOrEqual(expectedEarliest.getTime() - 1000);
      expect(cutoff.getTime()).toBeLessThanOrEqual(expectedLatest.getTime() + 1000);
    });

    it('uses a custom daysOld value', async () => {
      (prisma.notification.deleteMany as jest.Mock).mockResolvedValue({ count: 5 });

      const before = new Date();
      await cleanupOldNotifications(7);

      const callArgs = (prisma.notification.deleteMany as jest.Mock).mock.calls[0][0];
      const cutoff = callArgs.where.createdAt.lt as Date;
      const expectedCutoff = new Date(before);
      expectedCutoff.setDate(expectedCutoff.getDate() - 7);

      expect(cutoff.getTime()).toBeGreaterThanOrEqual(expectedCutoff.getTime() - 1000);
      expect(cutoff.getTime()).toBeLessThanOrEqual(expectedCutoff.getTime() + 1000);
    });
  });
});
