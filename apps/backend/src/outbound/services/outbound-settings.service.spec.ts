import { Test, TestingModule } from '@nestjs/testing';
import { OutboundSettingsService } from './outbound-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../test/mocks/prisma.mock';

describe('OutboundSettingsService', () => {
  let service: OutboundSettingsService;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboundSettingsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<OutboundSettingsService>(OutboundSettingsService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSettings', () => {
    it('returns settings when they exist', async () => {
      const mockSettings = { accountId: 'acc-1', patientCareEnabled: true };
      prisma.outboundSettings.findUnique.mockResolvedValue(mockSettings);

      const result = await service.getSettings('acc-1');
      expect(result).toEqual(mockSettings);
      expect(prisma.outboundSettings.findUnique).toHaveBeenCalledWith({
        where: { accountId: 'acc-1' },
      });
    });

    it('returns null when no settings exist', async () => {
      prisma.outboundSettings.findUnique.mockResolvedValue(null);
      const result = await service.getSettings('acc-1');
      expect(result).toBeNull();
    });
  });

  describe('getOrCreateSettings', () => {
    it('returns existing settings', async () => {
      const existing = { accountId: 'acc-1', timezone: 'America/Chicago' };
      prisma.outboundSettings.findUnique.mockResolvedValue(existing);

      const result = await service.getOrCreateSettings('acc-1');
      expect(result).toEqual(existing);
      expect(prisma.outboundSettings.create).not.toHaveBeenCalled();
    });

    it('creates settings with account timezone when none exist', async () => {
      prisma.outboundSettings.findUnique.mockResolvedValue(null);
      prisma.account.findUnique.mockResolvedValue({ brandingTimezone: 'America/Chicago' });
      const created = { accountId: 'acc-1', timezone: 'America/Chicago' };
      prisma.outboundSettings.create.mockResolvedValue(created);

      const result = await service.getOrCreateSettings('acc-1');
      expect(result).toEqual(created);
      expect(prisma.outboundSettings.create).toHaveBeenCalledWith({
        data: { accountId: 'acc-1', timezone: 'America/Chicago' },
      });
    });

    it('defaults to America/New_York when account has no timezone', async () => {
      prisma.outboundSettings.findUnique.mockResolvedValue(null);
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.outboundSettings.create.mockResolvedValue({ accountId: 'acc-1', timezone: 'America/New_York' });

      await service.getOrCreateSettings('acc-1');
      expect(prisma.outboundSettings.create).toHaveBeenCalledWith({
        data: { accountId: 'acc-1', timezone: 'America/New_York' },
      });
    });
  });

  describe('updateSettings', () => {
    it('upserts settings data', async () => {
      const updated = { accountId: 'acc-1', timezone: 'America/Denver' };
      prisma.outboundSettings.upsert.mockResolvedValue(updated);

      const result = await service.updateSettings('acc-1', { timezone: 'America/Denver' });
      expect(result).toEqual(updated);
      expect(prisma.outboundSettings.upsert).toHaveBeenCalledWith({
        where: { accountId: 'acc-1' },
        update: { timezone: 'America/Denver' },
        create: { accountId: 'acc-1', timezone: 'America/Denver' },
      });
    });
  });

  describe('enableAgentGroup', () => {
    const mockSettings = {
      accountId: 'acc-1',
      channelDefaults: { recall: 'sms' },
      patientCareEnabled: false,
    };

    beforeEach(() => {
      prisma.account.findUnique.mockResolvedValue({ brandingTimezone: 'America/Chicago' });
      prisma.outboundSettings.findUnique.mockResolvedValue(mockSettings);
    });

    it('enables PATIENT_CARE group with smart defaults', async () => {
      prisma.outboundSettings.update.mockResolvedValue({ ...mockSettings, patientCareEnabled: true });

      await service.enableAgentGroup('acc-1', 'PATIENT_CARE');

      const call = prisma.outboundSettings.update.mock.calls[0][0];
      expect(call.where).toEqual({ accountId: 'acc-1' });
      expect(call.data.patientCareEnabled).toBe(true);
      expect(call.data.timezone).toBe('America/Chicago');
      expect(call.data.followUpConfig).toBeDefined();
      expect(call.data.reactivationConfig).toBeDefined();
      expect(call.data.reminderConfig).toBeDefined();
    });

    it('enables FINANCIAL group with defaults', async () => {
      prisma.outboundSettings.update.mockResolvedValue({ ...mockSettings, financialEnabled: true });

      await service.enableAgentGroup('acc-1', 'FINANCIAL');

      const call = prisma.outboundSettings.update.mock.calls[0][0];
      expect(call.data.financialEnabled).toBe(true);
      expect(call.data.followUpConfig).toBeUndefined();
    });

    it('preserves existing channel defaults', async () => {
      prisma.outboundSettings.update.mockResolvedValue({});

      await service.enableAgentGroup('acc-1', 'PATIENT_CARE');

      const call = prisma.outboundSettings.update.mock.calls[0][0];
      expect(call.data.channelDefaults.recall).toBe('sms');
    });
  });

  describe('disableAgentGroup', () => {
    it('disables PATIENT_CARE group', async () => {
      prisma.outboundSettings.update.mockResolvedValue({});
      await service.disableAgentGroup('acc-1', 'PATIENT_CARE');
      expect(prisma.outboundSettings.update).toHaveBeenCalledWith({
        where: { accountId: 'acc-1' },
        data: { patientCareEnabled: false },
      });
    });

    it('disables FINANCIAL group', async () => {
      prisma.outboundSettings.update.mockResolvedValue({});
      await service.disableAgentGroup('acc-1', 'FINANCIAL');
      expect(prisma.outboundSettings.update).toHaveBeenCalledWith({
        where: { accountId: 'acc-1' },
        data: { financialEnabled: false },
      });
    });
  });

  describe('isGroupEnabled', () => {
    it('returns true when PATIENT_CARE is enabled', async () => {
      prisma.outboundSettings.findUnique.mockResolvedValue({ patientCareEnabled: true, financialEnabled: false });
      expect(await service.isGroupEnabled('acc-1', 'PATIENT_CARE')).toBe(true);
    });

    it('returns true when FINANCIAL is enabled', async () => {
      prisma.outboundSettings.findUnique.mockResolvedValue({ patientCareEnabled: false, financialEnabled: true });
      expect(await service.isGroupEnabled('acc-1', 'FINANCIAL')).toBe(true);
    });

    it('returns false when no settings exist', async () => {
      prisma.outboundSettings.findUnique.mockResolvedValue(null);
      expect(await service.isGroupEnabled('acc-1', 'PATIENT_CARE')).toBe(false);
    });
  });

  describe('getChannelForCallType', () => {
    it('returns configured channel', () => {
      const settings = { channelDefaults: { recall: 'sms' } } as any;
      expect(service.getChannelForCallType(settings, 'recall')).toBe('sms');
    });

    it('defaults to phone for unknown call type', () => {
      const settings = { channelDefaults: {} } as any;
      expect(service.getChannelForCallType(settings, 'unknown')).toBe('phone');
    });

    it('defaults to phone when channelDefaults is null', () => {
      const settings = { channelDefaults: null } as any;
      expect(service.getChannelForCallType(settings, 'recall')).toBe('phone');
    });
  });
});
