jest.mock('server-only', () => ({}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findUnique: jest.fn(),
    },
    voiceProviderToggle: {
      findFirst: jest.fn(),
    },
  },
}));

import { prisma } from '@kit/prisma';
import { getAccountProvider, getAccountProviderFromOverride } from './resolve-provider';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getAccountProvider', () => {
  it('returns account-level override when set to VAPI', async () => {
    (prisma.account.findUnique as jest.Mock).mockResolvedValue({
      voiceProviderOverride: 'VAPI',
    });

    const result = await getAccountProvider('acc-1');

    expect(result).toBe('VAPI');
    expect(prisma.account.findUnique).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      select: { voiceProviderOverride: true },
    });
  });

  it('returns account-level override when set to RETELL', async () => {
    (prisma.account.findUnique as jest.Mock).mockResolvedValue({
      voiceProviderOverride: 'RETELL',
    });

    const result = await getAccountProvider('acc-2');

    expect(result).toBe('RETELL');
  });

  it('falls back to global toggle when no account override', async () => {
    (prisma.account.findUnique as jest.Mock).mockResolvedValue({
      voiceProviderOverride: null,
    });
    (prisma.voiceProviderToggle.findFirst as jest.Mock).mockResolvedValue({
      id: 1,
      activeProvider: 'VAPI',
    });

    const result = await getAccountProvider('acc-3');

    expect(result).toBe('VAPI');
    expect(prisma.voiceProviderToggle.findFirst).toHaveBeenCalledWith({
      where: { id: 1 },
    });
  });

  it('defaults to RETELL when no override and no global toggle', async () => {
    (prisma.account.findUnique as jest.Mock).mockResolvedValue({
      voiceProviderOverride: null,
    });
    (prisma.voiceProviderToggle.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await getAccountProvider('acc-4');

    expect(result).toBe('RETELL');
  });

  it('defaults to RETELL when account is not found', async () => {
    (prisma.account.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.voiceProviderToggle.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await getAccountProvider('acc-missing');

    expect(result).toBe('RETELL');
  });

  it('defaults to RETELL when voiceProviderToggle table throws', async () => {
    (prisma.account.findUnique as jest.Mock).mockResolvedValue({
      voiceProviderOverride: null,
    });
    (prisma.voiceProviderToggle.findFirst as jest.Mock).mockRejectedValue(
      new Error('Table does not exist'),
    );

    const result = await getAccountProvider('acc-5');

    expect(result).toBe('RETELL');
  });

  it('defaults to RETELL when global toggle has no activeProvider', async () => {
    (prisma.account.findUnique as jest.Mock).mockResolvedValue({
      voiceProviderOverride: null,
    });
    (prisma.voiceProviderToggle.findFirst as jest.Mock).mockResolvedValue({
      id: 1,
      activeProvider: null,
    });

    const result = await getAccountProvider('acc-6');

    expect(result).toBe('RETELL');
  });
});

describe('getAccountProviderFromOverride', () => {
  it('returns VAPI when override is VAPI', async () => {
    const result = await getAccountProviderFromOverride('VAPI');

    expect(result).toBe('VAPI');
    expect(prisma.voiceProviderToggle.findFirst).not.toHaveBeenCalled();
  });

  it('returns RETELL when override is RETELL', async () => {
    const result = await getAccountProviderFromOverride('RETELL');

    expect(result).toBe('RETELL');
    expect(prisma.voiceProviderToggle.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to global toggle when override is null', async () => {
    (prisma.voiceProviderToggle.findFirst as jest.Mock).mockResolvedValue({
      id: 1,
      activeProvider: 'VAPI',
    });

    const result = await getAccountProviderFromOverride(null);

    expect(result).toBe('VAPI');
  });

  it('falls back to global toggle when override is undefined', async () => {
    (prisma.voiceProviderToggle.findFirst as jest.Mock).mockResolvedValue({
      id: 1,
      activeProvider: 'RETELL',
    });

    const result = await getAccountProviderFromOverride(undefined);

    expect(result).toBe('RETELL');
  });

  it('defaults to RETELL when override is invalid and no toggle', async () => {
    (prisma.voiceProviderToggle.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await getAccountProviderFromOverride('INVALID');

    expect(result).toBe('RETELL');
  });

  it('defaults to RETELL when toggle table throws', async () => {
    (prisma.voiceProviderToggle.findFirst as jest.Mock).mockRejectedValue(
      new Error('Table does not exist'),
    );

    const result = await getAccountProviderFromOverride(null);

    expect(result).toBe('RETELL');
  });

  it('defaults to RETELL when toggle has null activeProvider', async () => {
    (prisma.voiceProviderToggle.findFirst as jest.Mock).mockResolvedValue({
      id: 1,
      activeProvider: null,
    });

    const result = await getAccountProviderFromOverride(null);

    expect(result).toBe('RETELL');
  });
});
