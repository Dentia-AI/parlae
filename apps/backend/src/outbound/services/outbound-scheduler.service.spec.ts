import { Test, TestingModule } from '@nestjs/testing';
import { OutboundSchedulerService } from './outbound-scheduler.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboundCampaignService } from './outbound-campaign.service';
import { OutboundSettingsService } from './outbound-settings.service';
import { createMockPrismaService } from '../../test/mocks/prisma.mock';

describe('OutboundSchedulerService', () => {
  let service: OutboundSchedulerService;
  let prisma: any;
  let campaignService: any;
  let settingsService: any;

  const mockSettings: any = {
    accountId: 'acc-1',
    patientCareEnabled: true,
    financialEnabled: false,
    timezone: 'America/New_York',
    callingWindowStart: '09:00',
    callingWindowEnd: '17:00',
    maxConcurrentCalls: 1,
    channelDefaults: { recall: 'phone', reminder: 'sms' },
    reminderConfig: { hoursBeforeAppointment: 24 },
    reactivationConfig: { inactiveMonths: 12 },
    autoApproveCampaigns: false,
  };

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboundSchedulerService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: OutboundCampaignService,
          useValue: {
            createCampaign: jest.fn().mockResolvedValue({ id: 'camp-1' }),
            addContacts: jest.fn().mockResolvedValue({ added: 2, skipped: 0 }),
            updateCampaignStatus: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: OutboundSettingsService,
          useValue: {
            getSettings: jest.fn().mockResolvedValue(mockSettings),
            getChannelForCallType: jest.fn().mockReturnValue('phone'),
          },
        },
      ],
    }).compile();

    service = module.get<OutboundSchedulerService>(OutboundSchedulerService);
    prisma = module.get(PrismaService);
    campaignService = module.get(OutboundCampaignService);
    settingsService = module.get(OutboundSettingsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('scanRecallCandidates', () => {
    it('processes recall for each enabled account', async () => {
      prisma.outboundSettings.findMany.mockResolvedValue([
        { accountId: 'acc-1', ...mockSettings, account: { featureSettings: {} } },
      ]);
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);

      await service.scanRecallCandidates();

      expect(prisma.outboundSettings.findMany).toHaveBeenCalledWith({
        where: { patientCareEnabled: true },
        include: { account: { select: { featureSettings: true } } },
      });
    });

    it('handles errors for individual accounts without stopping', async () => {
      prisma.outboundSettings.findMany.mockResolvedValue([
        { accountId: 'acc-1', account: { featureSettings: {} } },
        { accountId: 'acc-2', account: { featureSettings: {} } },
      ]);
      prisma.pmsIntegration.findFirst.mockRejectedValueOnce(new Error('DB error')).mockResolvedValueOnce(null);

      await expect(service.scanRecallCandidates()).resolves.toBeUndefined();
    });

    it('filters out accounts with ai-receptionist disabled', async () => {
      const spy = jest.spyOn(service as any, 'processRecallForAccount').mockResolvedValue(undefined);
      prisma.outboundSettings.findMany.mockResolvedValue([
        { ...mockSettings, accountId: 'acc-1', account: { featureSettings: { 'ai-receptionist': false } } },
        { ...mockSettings, accountId: 'acc-2', account: { featureSettings: {} } },
      ]);

      await service.scanRecallCandidates();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('acc-2', expect.anything());
      spy.mockRestore();
    });

    it('filters out accounts with outbound-calls disabled', async () => {
      const spy = jest.spyOn(service as any, 'processRecallForAccount').mockResolvedValue(undefined);
      prisma.outboundSettings.findMany.mockResolvedValue([
        { ...mockSettings, accountId: 'acc-1', account: { featureSettings: { 'outbound-calls': false } } },
        { ...mockSettings, accountId: 'acc-2', account: { featureSettings: { 'outbound-calls': true } } },
      ]);

      await service.scanRecallCandidates();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('acc-2', expect.anything());
      spy.mockRestore();
    });

    it('filters out accounts with both ai-receptionist and outbound-calls disabled', async () => {
      const spy = jest.spyOn(service as any, 'processRecallForAccount').mockResolvedValue(undefined);
      prisma.outboundSettings.findMany.mockResolvedValue([
        { ...mockSettings, accountId: 'acc-1', account: { featureSettings: { 'ai-receptionist': false, 'outbound-calls': false } } },
        { ...mockSettings, accountId: 'acc-2', account: { featureSettings: { 'ai-receptionist': true, 'outbound-calls': true } } },
      ]);

      await service.scanRecallCandidates();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('acc-2', expect.anything());
      spy.mockRestore();
    });
  });

  describe('scanReminderCandidates', () => {
    it('processes reminders for enabled accounts', async () => {
      prisma.outboundSettings.findMany.mockResolvedValue([]);
      await service.scanReminderCandidates();
      expect(prisma.outboundSettings.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ include: { account: { select: { featureSettings: true } } } }),
      );
    });
  });

  describe('scanNoShowCandidates', () => {
    it('processes no-shows for enabled accounts', async () => {
      prisma.outboundSettings.findMany.mockResolvedValue([]);
      await service.scanNoShowCandidates();
      expect(prisma.outboundSettings.findMany).toHaveBeenCalled();
    });
  });

  describe('scanReactivationCandidates', () => {
    it('processes reactivation for enabled accounts', async () => {
      prisma.outboundSettings.findMany.mockResolvedValue([]);
      await service.scanReactivationCandidates();
      expect(prisma.outboundSettings.findMany).toHaveBeenCalled();
    });
  });

  describe('bootstrapCampaignsForAccount', () => {
    it('runs recall, reminder, and noshow for PATIENT_CARE', async () => {
      settingsService.getSettings.mockResolvedValue(mockSettings);
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);

      await service.bootstrapCampaignsForAccount('acc-1', 'PATIENT_CARE');

      expect(settingsService.getSettings).toHaveBeenCalledWith('acc-1');
    });

    it('does nothing when settings not found', async () => {
      settingsService.getSettings.mockResolvedValue(null);
      await service.bootstrapCampaignsForAccount('acc-1', 'PATIENT_CARE');
      expect(prisma.pmsIntegration.findFirst).not.toHaveBeenCalled();
    });

    it('skips scans for FINANCIAL group', async () => {
      settingsService.getSettings.mockResolvedValue(mockSettings);
      await service.bootstrapCampaignsForAccount('acc-1', 'FINANCIAL');
      expect(prisma.pmsIntegration.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('triggerScansForAccount', () => {
    beforeEach(() => {
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
    });

    it('runs specific scan types', async () => {
      const scans = await service.triggerScansForAccount('acc-1', mockSettings, ['recall', 'reminder']);
      expect(scans).toEqual(['recall', 'reminder']);
    });

    it('runs all scans when "all" is specified', async () => {
      const scans = await service.triggerScansForAccount('acc-1', mockSettings, ['all']);
      expect(scans).toEqual(['recall', 'reminder', 'noshow', 'reactivation']);
    });

    it('runs only requested scan types', async () => {
      const scans = await service.triggerScansForAccount('acc-1', mockSettings, ['noshow']);
      expect(scans).toEqual(['noshow']);
    });
  });

  // ── Deep tests: full PMS → campaign flow ────────────────────────────

  describe('processRecallForAccount (full flow)', () => {
    const mockPmsProvider = {
      getAppointments: jest.fn(),
    };

    beforeEach(() => {
      jest.spyOn(service as any, 'getPmsServiceForAccount').mockResolvedValue(mockPmsProvider);
      prisma.outboundCampaign.findFirst.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({});
    });

    it('creates recall campaign from PMS appointments', async () => {
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [
          { patientId: 'p-1', patientPhone: '+15551001', patientName: 'Alice', date: '2025-06-01' },
          { patientId: 'p-2', patientPhone: '+15551002', patientName: 'Bob', date: '2025-05-15' },
        ],
      });

      await service.triggerScansForAccount('acc-1', mockSettings, ['recall']);

      expect(campaignService.createCampaign).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'acc-1',
          callType: 'RECALL',
          isAutoGenerated: true,
        }),
      );
      expect(campaignService.addContacts).toHaveBeenCalledWith('camp-1', expect.any(Array));
      const contacts = campaignService.addContacts.mock.calls[0][1];
      expect(contacts).toHaveLength(2);
      expect(contacts[0].patientId).toBe('p-1');
      expect(contacts[0].phoneNumber).toBe('+15551001');
      expect(contacts[0].callContext.patient_name).toBe('Alice');
    });

    it('deduplicates patients by patientId', async () => {
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [
          { patientId: 'p-1', patientPhone: '+15551001', patientName: 'Alice', date: '2025-06-01' },
          { patientId: 'p-1', patientPhone: '+15551001', patientName: 'Alice', date: '2025-04-01' },
        ],
      });

      await service.triggerScansForAccount('acc-1', mockSettings, ['recall']);
      const contacts = campaignService.addContacts.mock.calls[0][1];
      expect(contacts).toHaveLength(1);
    });

    it('skips appointments without phone number', async () => {
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [
          { patientId: 'p-1', patientName: 'NoPhone', date: '2025-06-01' },
          { patientId: 'p-2', patientPhone: '+15551002', patientName: 'HasPhone', date: '2025-05-01' },
        ],
      });

      await service.triggerScansForAccount('acc-1', mockSettings, ['recall']);
      const contacts = campaignService.addContacts.mock.calls[0][1];
      expect(contacts).toHaveLength(1);
      expect(contacts[0].patientId).toBe('p-2');
    });

    it('skips appointments without patientId', async () => {
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [
          { patientPhone: '+15551001', patientName: 'NoId', date: '2025-06-01' },
        ],
      });

      await service.triggerScansForAccount('acc-1', mockSettings, ['recall']);
      expect(campaignService.createCampaign).not.toHaveBeenCalled();
    });

    it('auto-approves and activates campaign when autoApproveCampaigns is true', async () => {
      const autoApproveSettings = { ...mockSettings, autoApproveCampaigns: true };
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [
          { patientId: 'p-1', patientPhone: '+15551001', patientName: 'Alice', date: '2025-06-01' },
        ],
      });

      await service.triggerScansForAccount('acc-1', autoApproveSettings, ['recall']);

      expect(campaignService.updateCampaignStatus).toHaveBeenCalledWith('camp-1', 'ACTIVE');
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'INFO',
            body: expect.stringContaining('started'),
          }),
        }),
      );
    });

    it('creates DRAFT campaign when autoApprove is false', async () => {
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [
          { patientId: 'p-1', patientPhone: '+15551001', patientName: 'Alice', date: '2025-06-01' },
        ],
      });

      await service.triggerScansForAccount('acc-1', mockSettings, ['recall']);

      expect(campaignService.updateCampaignStatus).not.toHaveBeenCalled();
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'WARNING',
            body: expect.stringContaining('pending approval'),
          }),
        }),
      );
    });

    it('skips when an active recall campaign already exists', async () => {
      prisma.outboundCampaign.findFirst.mockResolvedValue({ id: 'existing-camp' });

      await service.triggerScansForAccount('acc-1', mockSettings, ['recall']);

      expect(mockPmsProvider.getAppointments).not.toHaveBeenCalled();
      expect(campaignService.createCampaign).not.toHaveBeenCalled();
    });

    it('skips when PMS returns unsuccessful result', async () => {
      mockPmsProvider.getAppointments.mockResolvedValue({ success: false });

      await service.triggerScansForAccount('acc-1', mockSettings, ['recall']);
      expect(campaignService.createCampaign).not.toHaveBeenCalled();
    });

    it('skips when PMS returns empty data', async () => {
      mockPmsProvider.getAppointments.mockResolvedValue({ success: true, data: [] });

      await service.triggerScansForAccount('acc-1', mockSettings, ['recall']);
      expect(campaignService.createCampaign).not.toHaveBeenCalled();
    });

    it('handles PMS error gracefully', async () => {
      mockPmsProvider.getAppointments.mockRejectedValue(new Error('PMS down'));

      await expect(
        service.triggerScansForAccount('acc-1', mockSettings, ['recall']),
      ).resolves.toEqual(['recall']);
    });

    it('reads patient_id/patient_phone/patient_name (underscore variant)', async () => {
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [
          { patient_id: 'p-x', patient_phone: '+15559999', patient_name: 'Underscore', start_time: '2025-05-01' },
        ],
      });

      await service.triggerScansForAccount('acc-1', mockSettings, ['recall']);
      const contacts = campaignService.addContacts.mock.calls[0][1];
      expect(contacts[0].patientId).toBe('p-x');
      expect(contacts[0].phoneNumber).toBe('+15559999');
      expect(contacts[0].callContext.patient_name).toBe('Underscore');
    });

    it('handles notification creation failure gracefully', async () => {
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [{ patientId: 'p-1', patientPhone: '+15551001', patientName: 'Alice', date: '2025-06-01' }],
      });
      prisma.notification.create.mockRejectedValue(new Error('notification fail'));

      await expect(
        service.triggerScansForAccount('acc-1', mockSettings, ['recall']),
      ).resolves.toEqual(['recall']);
    });
  });

  describe('processRemindersForAccount (full flow)', () => {
    const mockPmsProvider = { getAppointments: jest.fn() };

    beforeEach(() => {
      jest.spyOn(service as any, 'getPmsServiceForAccount').mockResolvedValue(mockPmsProvider);
      prisma.notification.create.mockResolvedValue({});
    });

    it('creates reminder campaign from upcoming appointments', async () => {
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [
          {
            patientId: 'p-r1',
            patientPhone: '+15552001',
            patientName: 'Reminder Patient',
            date: '2026-03-04',
            startTime: '09:00',
            type: 'Cleaning',
            providerName: 'Dr. Smith',
          },
        ],
      });

      await service.triggerScansForAccount('acc-1', mockSettings, ['reminder']);

      expect(campaignService.createCampaign).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'acc-1',
          callType: 'REMINDER',
          isAutoGenerated: true,
        }),
      );
      const contacts = campaignService.addContacts.mock.calls[0][1];
      expect(contacts[0].callContext.appointment_type).toBe('Cleaning');
      expect(contacts[0].callContext.provider_name).toBe('Dr. Smith');
    });

    it('skips contacts without phone', async () => {
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [{ patientId: 'p-r2', patientName: 'NoPhone', date: '2026-03-04' }],
      });

      await service.triggerScansForAccount('acc-1', mockSettings, ['reminder']);
      expect(campaignService.createCampaign).not.toHaveBeenCalled();
    });

    it('uses default hoursBeforeAppointment when reminderConfig is missing', async () => {
      const noReminderConfig = { ...mockSettings, reminderConfig: null };
      mockPmsProvider.getAppointments.mockResolvedValue({ success: true, data: [] });

      await service.triggerScansForAccount('acc-1', noReminderConfig, ['reminder']);
      expect(mockPmsProvider.getAppointments).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'scheduled', limit: 100 }),
      );
    });

    it('auto-approves reminder campaign', async () => {
      const autoApproveSettings = { ...mockSettings, autoApproveCampaigns: true };
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [{ patientId: 'p-1', patientPhone: '+15551001', patientName: 'A', date: '2026-03-04' }],
      });

      await service.triggerScansForAccount('acc-1', autoApproveSettings, ['reminder']);
      expect(campaignService.updateCampaignStatus).toHaveBeenCalledWith('camp-1', 'ACTIVE');
    });
  });

  describe('processNoShowsForAccount (full flow)', () => {
    const mockPmsProvider = { getAppointments: jest.fn() };

    beforeEach(() => {
      jest.spyOn(service as any, 'getPmsServiceForAccount').mockResolvedValue(mockPmsProvider);
      prisma.notification.create.mockResolvedValue({});
    });

    it('creates no-show campaign from missed appointments', async () => {
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [
          { patientId: 'p-n1', patientPhone: '+15553001', patientName: 'NoShow Pat', date: '2026-03-02', startTime: '10:00', type: 'Checkup' },
        ],
      });

      await service.triggerScansForAccount('acc-1', mockSettings, ['noshow']);

      expect(campaignService.createCampaign).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'acc-1',
          callType: 'NOSHOW',
          isAutoGenerated: true,
        }),
      );
      const contacts = campaignService.addContacts.mock.calls[0][1];
      expect(contacts[0].callContext.patient_name).toBe('NoShow Pat');
    });

    it('handles PMS failure gracefully', async () => {
      mockPmsProvider.getAppointments.mockRejectedValue(new Error('PMS timeout'));

      await expect(
        service.triggerScansForAccount('acc-1', mockSettings, ['noshow']),
      ).resolves.toEqual(['noshow']);
    });
  });

  describe('processReactivationForAccount (full flow)', () => {
    const mockPmsProvider = { getAppointments: jest.fn() };

    beforeEach(() => {
      jest.spyOn(service as any, 'getPmsServiceForAccount').mockResolvedValue(mockPmsProvider);
      prisma.outboundCampaign.findFirst.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({});
    });

    it('creates reactivation campaign from inactive patients', async () => {
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [
          { patientId: 'p-re1', patientPhone: '+15554001', patientName: 'Inactive Pat', date: '2024-01-01' },
        ],
      });

      await service.triggerScansForAccount('acc-1', mockSettings, ['reactivation']);

      expect(campaignService.createCampaign).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'acc-1',
          callType: 'REACTIVATION',
          isAutoGenerated: true,
        }),
      );
      const contacts = campaignService.addContacts.mock.calls[0][1];
      expect(contacts[0].callContext.months_since_visit).toBeDefined();
    });

    it('skips when active reactivation campaign exists', async () => {
      prisma.outboundCampaign.findFirst.mockResolvedValue({ id: 'existing' });

      await service.triggerScansForAccount('acc-1', mockSettings, ['reactivation']);
      expect(mockPmsProvider.getAppointments).not.toHaveBeenCalled();
    });

    it('uses custom inactiveMonths from reactivationConfig', async () => {
      const customSettings = { ...mockSettings, reactivationConfig: { inactiveMonths: 18 } };
      mockPmsProvider.getAppointments.mockResolvedValue({ success: true, data: [] });

      await service.triggerScansForAccount('acc-1', customSettings, ['reactivation']);
      expect(mockPmsProvider.getAppointments).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed', limit: 200 }),
      );
    });

    it('defaults months_since_visit when date is missing', async () => {
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [{ patientId: 'p-re2', patientPhone: '+15554002', patientName: 'NoDate' }],
      });

      await service.triggerScansForAccount('acc-1', mockSettings, ['reactivation']);
      const contacts = campaignService.addContacts.mock.calls[0][1];
      expect(contacts[0].callContext.months_since_visit).toBe('12');
    });
  });

  describe('getPmsServiceForAccount', () => {
    it('returns null when no PMS integration exists', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      const result = await (service as any).getPmsServiceForAccount('acc-1');
      expect(result).toBeNull();
    });

    it('returns null when dynamic import fails', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        provider: 'sikka',
        config: {},
        status: 'ACTIVE',
      });

      const origImport = jest.spyOn(service as any, 'getPmsServiceForAccount');
      origImport.mockRestore();

      jest.mock('../../pms/pms.service', () => { throw new Error('Module not found'); });

      const result = await (service as any).getPmsServiceForAccount('acc-1');
      expect(result).toBeNull();
    });
  });

  describe('cron scanners with PMS flow', () => {
    const mockPmsProvider = { getAppointments: jest.fn() };

    beforeEach(() => {
      jest.spyOn(service as any, 'getPmsServiceForAccount').mockResolvedValue(mockPmsProvider);
      prisma.outboundCampaign.findFirst.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({});
    });

    it('scanRecallCandidates processes multiple accounts', async () => {
      prisma.outboundSettings.findMany.mockResolvedValue([
        { accountId: 'acc-1', ...mockSettings, account: { featureSettings: {} } },
        { accountId: 'acc-2', ...mockSettings, account: { featureSettings: {} } },
      ]);
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [{ patientId: 'p-1', patientPhone: '+15551001', patientName: 'A', date: '2025-06-01' }],
      });

      await service.scanRecallCandidates();
      expect(campaignService.createCampaign).toHaveBeenCalledTimes(2);
    });

    it('scanRecallCandidates skips accounts with ai-receptionist disabled', async () => {
      prisma.outboundSettings.findMany.mockResolvedValue([
        { ...mockSettings, accountId: 'acc-1', account: { featureSettings: { 'ai-receptionist': false } } },
        { ...mockSettings, accountId: 'acc-2', account: { featureSettings: { 'ai-receptionist': true } } },
      ]);
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [{ patientId: 'p-1', patientPhone: '+15551001', patientName: 'A', date: '2025-06-01' }],
      });

      await service.scanRecallCandidates();
      expect(campaignService.createCampaign).toHaveBeenCalledTimes(1);
    });

    it('scanReminderCandidates creates reminder campaigns', async () => {
      prisma.outboundSettings.findMany.mockResolvedValue([{ accountId: 'acc-1', ...mockSettings, account: { featureSettings: {} } }]);
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [{ patientId: 'p-1', patientPhone: '+15551001', patientName: 'A', date: '2026-03-04' }],
      });

      await service.scanReminderCandidates();
      expect(campaignService.createCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ callType: 'REMINDER' }),
      );
    });

    it('scanNoShowCandidates creates noshow campaigns', async () => {
      prisma.outboundSettings.findMany.mockResolvedValue([{ accountId: 'acc-1', ...mockSettings, account: { featureSettings: {} } }]);
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [{ patientId: 'p-1', patientPhone: '+15551001', patientName: 'A', date: '2026-03-02' }],
      });

      await service.scanNoShowCandidates();
      expect(campaignService.createCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ callType: 'NOSHOW' }),
      );
    });

    it('scanReactivationCandidates creates reactivation campaigns', async () => {
      prisma.outboundSettings.findMany.mockResolvedValue([{ accountId: 'acc-1', ...mockSettings, account: { featureSettings: {} } }]);
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [{ patientId: 'p-1', patientPhone: '+15551001', patientName: 'A', date: '2024-01-01' }],
      });

      await service.scanReactivationCandidates();
      expect(campaignService.createCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ callType: 'REACTIVATION' }),
      );
    });

    it('scanRecallCandidates continues to next account on error', async () => {
      prisma.outboundSettings.findMany.mockResolvedValue([
        { accountId: 'acc-1', ...mockSettings, account: { featureSettings: {} } },
        { accountId: 'acc-2', ...mockSettings, account: { featureSettings: {} } },
      ]);
      mockPmsProvider.getAppointments
        .mockRejectedValueOnce(new Error('PMS error'))
        .mockResolvedValueOnce({
          success: true,
          data: [{ patientId: 'p-2', patientPhone: '+15552001', patientName: 'B', date: '2025-06-01' }],
        });

      await service.scanRecallCandidates();
      expect(campaignService.createCampaign).toHaveBeenCalledTimes(1);
    });
  });

  describe('bootstrapCampaignsForAccount (with PMS)', () => {
    const mockPmsProvider = { getAppointments: jest.fn() };

    beforeEach(() => {
      jest.spyOn(service as any, 'getPmsServiceForAccount').mockResolvedValue(mockPmsProvider);
      prisma.outboundCampaign.findFirst.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({});
      settingsService.getSettings.mockResolvedValue(mockSettings);
    });

    it('runs recall, reminder, and noshow for PATIENT_CARE with PMS data', async () => {
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [{ patientId: 'p-1', patientPhone: '+15551001', patientName: 'Boot', date: '2025-06-01' }],
      });

      await service.bootstrapCampaignsForAccount('acc-1', 'PATIENT_CARE');

      expect(campaignService.createCampaign).toHaveBeenCalledTimes(3);
    });
  });
});
