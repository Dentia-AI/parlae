jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from '@kit/prisma';
import { sendNotificationEmail } from './send-notification-email';

let warnSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  warnSpy = jest.spyOn(console, 'warn').mockImplementation();
  logSpy = jest.spyOn(console, 'log').mockImplementation();
});

describe('sendNotificationEmail', () => {
  const baseNotification = {
    id: 1,
    accountId: 'acc-1',
    body: 'Test notification body',
    type: 'INFO',
    channel: 'EMAIL',
    link: null,
    dismissed: false,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  it('looks up account email and logs that email would be sent', async () => {
    (prisma.account.findUnique as jest.Mock).mockResolvedValue({
      email: 'user@example.com',
      name: 'Test User',
    });

    await sendNotificationEmail(baseNotification);

    expect(prisma.account.findUnique).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      select: { email: true, name: true },
    });
    expect(logSpy).toHaveBeenCalledWith(
      'Email notification would be sent to:',
      'user@example.com',
    );
  });

  it('warns and returns early when no account is found', async () => {
    (prisma.account.findUnique as jest.Mock).mockResolvedValue(null);

    await sendNotificationEmail(baseNotification);

    expect(warnSpy).toHaveBeenCalledWith(
      'No email found for account:',
      'acc-1',
    );
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('warns and returns early when account has no email', async () => {
    (prisma.account.findUnique as jest.Mock).mockResolvedValue({
      email: null,
      name: 'No Email User',
    });

    await sendNotificationEmail(baseNotification);

    expect(warnSpy).toHaveBeenCalledWith(
      'No email found for account:',
      'acc-1',
    );
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('warns when account email is empty string', async () => {
    (prisma.account.findUnique as jest.Mock).mockResolvedValue({
      email: '',
      name: 'Empty Email',
    });

    await sendNotificationEmail(baseNotification);

    expect(warnSpy).toHaveBeenCalledWith(
      'No email found for account:',
      'acc-1',
    );
  });

  it('handles notifications with links', async () => {
    (prisma.account.findUnique as jest.Mock).mockResolvedValue({
      email: 'linked@example.com',
      name: 'Linked User',
    });

    await sendNotificationEmail({
      ...baseNotification,
      link: '/some/path',
    });

    expect(logSpy).toHaveBeenCalledWith(
      'Email notification would be sent to:',
      'linked@example.com',
    );
  });
});
