import { Test, TestingModule } from '@nestjs/testing';
import { OutboundSchedulerService } from './outbound-scheduler.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PmsService } from '../../pms/pms.service';
import { OutboundCampaignService } from './outbound-campaign.service';
import { OutboundSettingsService } from './outbound-settings.service';
import { createMockPrismaService } from '../../test/mocks/prisma.mock';

describe('OutboundSchedulerService', () => {
  let service: OutboundSchedulerService;
  let module: TestingModule;
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

  const makePatient = (id: string, firstName: string, lastName: string, phone: string | null, email?: string | null) => ({
    id,
    firstName,
    lastName,
    phone,
    email: email ?? null,
  });

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();

    module = await Test.createTestingModule({
      providers: [
        OutboundSchedulerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PmsService, useValue: { getPmsService: jest.fn() } },
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

  // Helper to set up mocks common to all scan methods
  function setupScanMocks(
    mockPmsProvider: any,
    opts?: {
      dncPhones?: string[];
      alreadyContactedPatientIds?: string[];
    },
  ) {
    prisma.doNotCallEntry.findMany.mockResolvedValue(
      (opts?.dncPhones || []).map((p) => ({ phoneNumber: p })),
    );
    prisma.campaignContact.findMany.mockResolvedValue(
      (opts?.alreadyContactedPatientIds || []).map((id) => ({ patientId: id })),
    );
    prisma.notification.create.mockResolvedValue({});
  }

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
      listPatients: jest.fn(),
    };

    beforeEach(() => {
      jest.spyOn(service as any, 'getPmsServiceForAccount').mockResolvedValue(mockPmsProvider);
      prisma.outboundCampaign.findFirst.mockResolvedValue(null);
      setupScanMocks(mockPmsProvider);

      mockPmsProvider.listPatients.mockResolvedValue({
        success: true,
        data: [
          makePatient('p-1', 'Alice', 'Smith', '+15551001', 'alice@test.com'),
          makePatient('p-2', 'Bob', 'Jones', '+15551002', 'bob@test.com'),
          makePatient('p-x', 'Underscore', 'Pat', '+15559999'),
        ],
      });
    });

    it('creates recall campaign from PMS appointments', async () => {
      mockPmsProvider.getAppointments
        .mockResolvedValueOnce({
          success: true,
          data: [
            { patientId: 'p-1', patientName: 'Alice', startTime: new Date('2025-06-01') },
            { patientId: 'p-2', patientName: 'Bob', startTime: new Date('2025-05-15') },
          ],
        })
        .mockResolvedValueOnce({ success: true, data: [] }); // upcoming

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
      expect(contacts[0].callContext.patient_name).toBe('Alice Smith');
    });

    it('deduplicates patients by patientId', async () => {
      mockPmsProvider.getAppointments
        .mockResolvedValueOnce({
          success: true,
          data: [
            { patientId: 'p-1', patientName: 'Alice', startTime: new Date('2025-06-01') },
            { patientId: 'p-1', patientName: 'Alice', startTime: new Date('2025-04-01') },
          ],
        })
        .mockResolvedValueOnce({ success: true, data: [] });

      await service.triggerScansForAccount('acc-1', mockSettings, ['recall']);
      const contacts = campaignService.addContacts.mock.calls[0][1];
      expect(contacts).toHaveLength(1);
    });

    it('skips patients not found in patient map', async () => {
      mockPmsProvider.listPatients.mockResolvedValue({
        success: true,
        data: [makePatient('p-2', 'Bob', 'Jones', '+15551002')],
      });
      mockPmsProvider.getAppointments
        .mockResolvedValueOnce({
          success: true,
          data: [
            { patientId: 'p-1', patientName: 'NotInMap', startTime: new Date('2025-06-01') },
            { patientId: 'p-2', patientName: 'InMap', startTime: new Date('2025-05-01') },
          ],
        })
        .mockResolvedValueOnce({ success: true, data: [] });

      await service.triggerScansForAccount('acc-1', mockSettings, ['recall']);
      const contacts = campaignService.addContacts.mock.calls[0][1];
      expect(contacts).toHaveLength(1);
      expect(contacts[0].patientId).toBe('p-2');
    });

    it('skips patients whose phone is on DNC list', async () => {
      setupScanMocks(mockPmsProvider, { dncPhones: ['+15551001'] });
      mockPmsProvider.getAppointments
        .mockResolvedValueOnce({
          success: true,
          data: [
            { patientId: 'p-1', patientName: 'DNC Patient', startTime: new Date('2025-06-01') },
            { patientId: 'p-2', patientName: 'OK Patient', startTime: new Date('2025-05-01') },
          ],
        })
        .mockResolvedValueOnce({ success: true, data: [] });

      await service.triggerScansForAccount('acc-1', mockSettings, ['recall']);
      const contacts = campaignService.addContacts.mock.calls[0][1];
      expect(contacts).toHaveLength(1);
      expect(contacts[0].patientId).toBe('p-2');
    });

    it('skips patients already in an active campaign of same type', async () => {
      setupScanMocks(mockPmsProvider, { alreadyContactedPatientIds: ['p-1'] });
      mockPmsProvider.getAppointments
        .mockResolvedValueOnce({
          success: true,
          data: [
            { patientId: 'p-1', patientName: 'Already', startTime: new Date('2025-06-01') },
            { patientId: 'p-2', patientName: 'New', startTime: new Date('2025-05-01') },
          ],
        })
        .mockResolvedValueOnce({ success: true, data: [] });

      await service.triggerScansForAccount('acc-1', mockSettings, ['recall']);
      const contacts = campaignService.addContacts.mock.calls[0][1];
      expect(contacts).toHaveLength(1);
      expect(contacts[0].patientId).toBe('p-2');
    });

    it('skips patients with upcoming scheduled appointments', async () => {
      mockPmsProvider.getAppointments
        .mockResolvedValueOnce({
          success: true,
          data: [
            { patientId: 'p-1', patientName: 'Scheduled', startTime: new Date('2025-06-01') },
            { patientId: 'p-2', patientName: 'NotScheduled', startTime: new Date('2025-05-01') },
          ],
        })
        .mockResolvedValueOnce({
          success: true,
          data: [{ patientId: 'p-1', startTime: new Date('2026-04-01') }],
        });

      await service.triggerScansForAccount('acc-1', mockSettings, ['recall']);
      const contacts = campaignService.addContacts.mock.calls[0][1];
      expect(contacts).toHaveLength(1);
      expect(contacts[0].patientId).toBe('p-2');
    });

    it('skips patients without phone for phone channel', async () => {
      mockPmsProvider.listPatients.mockResolvedValue({
        success: true,
        data: [
          makePatient('p-1', 'NoPhone', 'Pat', null, 'np@test.com'),
          makePatient('p-2', 'HasPhone', 'Pat', '+15551002'),
        ],
      });
      mockPmsProvider.getAppointments
        .mockResolvedValueOnce({
          success: true,
          data: [
            { patientId: 'p-1', patientName: 'NoPhone', startTime: new Date('2025-06-01') },
            { patientId: 'p-2', patientName: 'HasPhone', startTime: new Date('2025-05-01') },
          ],
        })
        .mockResolvedValueOnce({ success: true, data: [] });

      await service.triggerScansForAccount('acc-1', mockSettings, ['recall']);
      const contacts = campaignService.addContacts.mock.calls[0][1];
      expect(contacts).toHaveLength(1);
      expect(contacts[0].patientId).toBe('p-2');
    });

    it('keeps patients without phone for email channel', async () => {
      settingsService.getChannelForCallType.mockReturnValue('email');
      mockPmsProvider.listPatients.mockResolvedValue({
        success: true,
        data: [
          makePatient('p-1', 'NoPhone', 'Pat', null, 'np@test.com'),
          makePatient('p-2', 'NoEmail', 'Pat', '+15551002', null),
        ],
      });
      mockPmsProvider.getAppointments
        .mockResolvedValueOnce({
          success: true,
          data: [
            { patientId: 'p-1', patientName: 'NoPhone', startTime: new Date('2025-06-01') },
            { patientId: 'p-2', patientName: 'NoEmail', startTime: new Date('2025-05-01') },
          ],
        })
        .mockResolvedValueOnce({ success: true, data: [] });

      await service.triggerScansForAccount('acc-1', mockSettings, ['recall']);
      const contacts = campaignService.addContacts.mock.calls[0][1];
      expect(contacts).toHaveLength(1);
      expect(contacts[0].patientId).toBe('p-1');
    });

    it('skips appointments without patientId', async () => {
      mockPmsProvider.getAppointments
        .mockResolvedValueOnce({
          success: true,
          data: [{ patientName: 'NoId', startTime: new Date('2025-06-01') }],
        })
        .mockResolvedValueOnce({ success: true, data: [] });

      await service.triggerScansForAccount('acc-1', mockSettings, ['recall']);
      expect(campaignService.createCampaign).not.toHaveBeenCalled();
    });

    it('auto-approves and activates campaign when autoApproveCampaigns is true', async () => {
      const autoApproveSettings = { ...mockSettings, autoApproveCampaigns: true };
      mockPmsProvider.getAppointments
        .mockResolvedValueOnce({
          success: true,
          data: [{ patientId: 'p-1', patientName: 'Alice', startTime: new Date('2025-06-01') }],
        })
        .mockResolvedValueOnce({ success: true, data: [] });

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
      mockPmsProvider.getAppointments
        .mockResolvedValueOnce({
          success: true,
          data: [{ patientId: 'p-1', patientName: 'Alice', startTime: new Date('2025-06-01') }],
        })
        .mockResolvedValueOnce({ success: true, data: [] });

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

    it('skips when PMS returns unsuccessful result and patient map empty', async () => {
      mockPmsProvider.getAppointments.mockResolvedValue({ success: false });
      mockPmsProvider.listPatients.mockResolvedValue({ success: true, data: [] });

      await service.triggerScansForAccount('acc-1', mockSettings, ['recall']);
      expect(campaignService.createCampaign).not.toHaveBeenCalled();
    });

    it('skips when PMS returns empty data and patient map empty', async () => {
      mockPmsProvider.getAppointments.mockResolvedValue({ success: true, data: [] });
      mockPmsProvider.listPatients.mockResolvedValue({ success: true, data: [] });

      await service.triggerScansForAccount('acc-1', mockSettings, ['recall']);
      expect(campaignService.createCampaign).not.toHaveBeenCalled();
    });

    it('falls back to patient map when appointments are empty', async () => {
      mockPmsProvider.getAppointments.mockResolvedValue({ success: true, data: [] });

      await service.triggerScansForAccount('acc-1', mockSettings, ['recall']);
      expect(campaignService.createCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ callType: 'RECALL' }),
      );
      expect(campaignService.addContacts).toHaveBeenCalledWith(
        'camp-1',
        expect.arrayContaining([expect.objectContaining({ patientId: 'p-1' })]),
      );
    });

    it('handles PMS error gracefully', async () => {
      mockPmsProvider.getAppointments.mockRejectedValue(new Error('PMS down'));

      await expect(
        service.triggerScansForAccount('acc-1', mockSettings, ['recall']),
      ).resolves.toEqual(['recall']);
    });

    it('handles notification creation failure gracefully', async () => {
      mockPmsProvider.getAppointments
        .mockResolvedValueOnce({
          success: true,
          data: [{ patientId: 'p-1', patientName: 'Alice', startTime: new Date('2025-06-01') }],
        })
        .mockResolvedValueOnce({ success: true, data: [] });
      prisma.notification.create.mockRejectedValue(new Error('notification fail'));

      await expect(
        service.triggerScansForAccount('acc-1', mockSettings, ['recall']),
      ).resolves.toEqual(['recall']);
    });
  });

  describe('processRemindersForAccount (full flow)', () => {
    const mockPmsProvider = { getAppointments: jest.fn(), listPatients: jest.fn() };

    beforeEach(() => {
      jest.spyOn(service as any, 'getPmsServiceForAccount').mockResolvedValue(mockPmsProvider);
      setupScanMocks(mockPmsProvider);
      mockPmsProvider.listPatients.mockResolvedValue({
        success: true,
        data: [
          makePatient('p-r1', 'Reminder', 'Patient', '+15552001', 'rem@test.com'),
          makePatient('p-r2', 'NoPhone', 'Rem', null),
          makePatient('p-1', 'Generic', 'Pat', '+15552003'),
        ],
      });
    });

    it('creates reminder campaign from upcoming appointments', async () => {
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [
          {
            patientId: 'p-r1',
            patientName: 'Reminder Patient',
            startTime: new Date('2026-03-04T09:00:00'),
            appointmentType: 'Cleaning',
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

    it('skips contacts when patient has no phone for phone channel', async () => {
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [{ patientId: 'p-r2', patientName: 'NoPhone', startTime: new Date('2026-03-04') }],
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
        data: [{ patientId: 'p-r1', patientName: 'A', startTime: new Date('2026-03-04') }],
      });

      await service.triggerScansForAccount('acc-1', autoApproveSettings, ['reminder']);
      expect(campaignService.updateCampaignStatus).toHaveBeenCalledWith('camp-1', 'ACTIVE');
    });

    it('skips patients already in active reminder campaign', async () => {
      setupScanMocks(mockPmsProvider, { alreadyContactedPatientIds: ['p-r1'] });
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [{ patientId: 'p-r1', patientName: 'AlreadyReminded', startTime: new Date('2026-03-04') }],
      });

      await service.triggerScansForAccount('acc-1', mockSettings, ['reminder']);
      expect(campaignService.createCampaign).not.toHaveBeenCalled();
    });
  });

  describe('processNoShowsForAccount (full flow)', () => {
    const mockPmsProvider = { getAppointments: jest.fn(), listPatients: jest.fn() };

    beforeEach(() => {
      jest.spyOn(service as any, 'getPmsServiceForAccount').mockResolvedValue(mockPmsProvider);
      setupScanMocks(mockPmsProvider);
      mockPmsProvider.listPatients.mockResolvedValue({
        success: true,
        data: [
          makePatient('p-n1', 'NoShow', 'Pat', '+15553001'),
          makePatient('p-1', 'Generic', 'Pat', '+15553002'),
          makePatient('p-2', 'Another', 'Pat', '+15553003'),
        ],
      });
    });

    it('creates no-show campaign from missed appointments', async () => {
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [
          { patientId: 'p-n1', patientName: 'NoShow Pat', startTime: new Date('2026-03-02T10:00:00'), appointmentType: 'Checkup' },
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

    it('skips DNC patients for no-show', async () => {
      setupScanMocks(mockPmsProvider, { dncPhones: ['+15553001'] });
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [{ patientId: 'p-n1', patientName: 'DNC', startTime: new Date('2026-03-02') }],
      });

      await service.triggerScansForAccount('acc-1', mockSettings, ['noshow']);
      expect(campaignService.createCampaign).not.toHaveBeenCalled();
    });
  });

  describe('processReactivationForAccount (full flow)', () => {
    const mockPmsProvider = { getAppointments: jest.fn(), listPatients: jest.fn() };

    beforeEach(() => {
      jest.spyOn(service as any, 'getPmsServiceForAccount').mockResolvedValue(mockPmsProvider);
      prisma.outboundCampaign.findFirst.mockResolvedValue(null);
      setupScanMocks(mockPmsProvider);
      mockPmsProvider.listPatients.mockResolvedValue({
        success: true,
        data: [
          makePatient('p-re1', 'Inactive', 'Pat', '+15554001'),
          makePatient('p-re2', 'NoDate', 'Pat', '+15554002'),
        ],
      });
    });

    it('creates reactivation campaign from inactive patients', async () => {
      mockPmsProvider.getAppointments
        .mockResolvedValueOnce({
          success: true,
          data: [{ patientId: 'p-re1', patientName: 'Inactive Pat', startTime: new Date('2024-01-01') }],
        })
        .mockResolvedValueOnce({ success: true, data: [] }); // upcoming

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

    it('defaults months_since_visit when startTime is missing', async () => {
      mockPmsProvider.getAppointments
        .mockResolvedValueOnce({
          success: true,
          data: [{ patientId: 'p-re2', patientName: 'NoDate' }],
        })
        .mockResolvedValueOnce({ success: true, data: [] });

      await service.triggerScansForAccount('acc-1', mockSettings, ['reactivation']);
      const contacts = campaignService.addContacts.mock.calls[0][1];
      expect(contacts[0].callContext.months_since_visit).toBe('12');
    });

    it('skips patients with upcoming scheduled appointments', async () => {
      mockPmsProvider.getAppointments
        .mockResolvedValueOnce({
          success: true,
          data: [
            { patientId: 'p-re1', patientName: 'HasUpcoming', startTime: new Date('2024-01-01') },
            { patientId: 'p-re2', patientName: 'NoUpcoming', startTime: new Date('2024-02-01') },
          ],
        })
        .mockResolvedValueOnce({
          success: true,
          data: [{ patientId: 'p-re1', startTime: new Date('2026-05-01') }],
        });

      await service.triggerScansForAccount('acc-1', mockSettings, ['reactivation']);
      const contacts = campaignService.addContacts.mock.calls[0][1];
      expect(contacts).toHaveLength(1);
      expect(contacts[0].patientId).toBe('p-re2');
    });
  });

  describe('getPmsServiceForAccount', () => {
    it('returns null when no PMS integration exists', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      const result = await (service as any).getPmsServiceForAccount('acc-1');
      expect(result).toBeNull();
    });

    it('returns null when PmsService.getPmsService throws', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        provider: 'sikka',
        config: {},
        status: 'ACTIVE',
      });

      (service as any).pmsService = { getPmsService: jest.fn().mockRejectedValue(new Error('credentials missing')) };

      const result = await (service as any).getPmsServiceForAccount('acc-1');
      expect(result).toBeNull();
    });
  });

  describe('buildPatientMap', () => {
    it('paginates through all patients', async () => {
      const mockPmsProvider = {
        listPatients: jest.fn()
          .mockResolvedValueOnce({
            success: true,
            data: Array.from({ length: 500 }, (_, i) => makePatient(`p-${i}`, `F${i}`, `L${i}`, `+1555${i}`)),
          })
          .mockResolvedValueOnce({
            success: true,
            data: [makePatient('p-500', 'Last', 'Pat', '+1555500')],
          }),
      };

      const map = await (service as any).buildPatientMap(mockPmsProvider, 'acc-1');
      expect(map.size).toBe(501);
      expect(mockPmsProvider.listPatients).toHaveBeenCalledTimes(2);
      expect(mockPmsProvider.listPatients).toHaveBeenCalledWith({ limit: 500, offset: 0 });
      expect(mockPmsProvider.listPatients).toHaveBeenCalledWith({ limit: 500, offset: 500 });
    });

    it('handles empty result gracefully', async () => {
      const mockPmsProvider = {
        listPatients: jest.fn().mockResolvedValue({ success: true, data: [] }),
      };

      const map = await (service as any).buildPatientMap(mockPmsProvider, 'acc-1');
      expect(map.size).toBe(0);
    });

    it('handles error mid-pagination with partial results', async () => {
      const mockPmsProvider = {
        listPatients: jest.fn()
          .mockResolvedValueOnce({
            success: true,
            data: Array.from({ length: 500 }, (_, i) => makePatient(`p-${i}`, `F${i}`, `L${i}`, `+1555${i}`)),
          })
          .mockRejectedValueOnce(new Error('API limit')),
      };

      const map = await (service as any).buildPatientMap(mockPmsProvider, 'acc-1');
      expect(map.size).toBe(500);
    });
  });

  describe('passesChannelFilter', () => {
    const dncSet = new Set(['+15550000']);

    it('allows patient with phone for phone channel', () => {
      const result = (service as any).passesChannelFilter(
        { phone: '+15551001', email: null },
        'phone',
        dncSet,
      );
      expect(result).toEqual({ phone: '+15551001', email: null });
    });

    it('rejects patient without phone for phone channel', () => {
      const result = (service as any).passesChannelFilter(
        { phone: null, email: 'a@b.com' },
        'phone',
        dncSet,
      );
      expect(result).toBeNull();
    });

    it('rejects patient on DNC for phone channel', () => {
      const result = (service as any).passesChannelFilter(
        { phone: '+15550000', email: 'a@b.com' },
        'phone',
        dncSet,
      );
      expect(result).toBeNull();
    });

    it('allows patient with email for email channel (no phone needed)', () => {
      const result = (service as any).passesChannelFilter(
        { phone: null, email: 'a@b.com' },
        'email',
        dncSet,
      );
      expect(result).toEqual({ phone: null, email: 'a@b.com' });
    });

    it('rejects patient without email for email channel', () => {
      const result = (service as any).passesChannelFilter(
        { phone: '+15551001', email: null },
        'email',
        dncSet,
      );
      expect(result).toBeNull();
    });

    it('allows patient with phone for sms channel', () => {
      const result = (service as any).passesChannelFilter(
        { phone: '+15551001', email: null },
        'sms',
        dncSet,
      );
      expect(result).toEqual({ phone: '+15551001', email: null });
    });
  });

  describe('cron scanners with PMS flow', () => {
    const mockPmsProvider = { getAppointments: jest.fn(), listPatients: jest.fn() };

    /**
     * Recall and reactivation call getAppointments twice: once for
     * historical data (in Promise.all) then once for upcoming scheduled.
     * This helper returns historical data for the first call and empty
     * upcoming data for subsequent calls.
     */
    function mockRecallAppts(historicalData: any[]) {
      mockPmsProvider.getAppointments.mockImplementation((params: any) => {
        if (params?.status === 'scheduled') {
          return Promise.resolve({ success: true, data: [] });
        }
        return Promise.resolve({ success: true, data: historicalData });
      });
    }

    beforeEach(() => {
      jest.spyOn(service as any, 'getPmsServiceForAccount').mockResolvedValue(mockPmsProvider);
      prisma.outboundCampaign.findFirst.mockResolvedValue(null);
      setupScanMocks(mockPmsProvider);
      mockPmsProvider.listPatients.mockResolvedValue({
        success: true,
        data: [
          makePatient('p-1', 'A', 'Pat', '+15551001'),
          makePatient('p-2', 'B', 'Pat', '+15551002'),
        ],
      });
    });

    it('scanRecallCandidates processes multiple accounts', async () => {
      prisma.outboundSettings.findMany.mockResolvedValue([
        { accountId: 'acc-1', ...mockSettings, account: { featureSettings: {} } },
        { accountId: 'acc-2', ...mockSettings, account: { featureSettings: {} } },
      ]);
      mockRecallAppts([{ patientId: 'p-1', patientName: 'A', startTime: new Date('2025-06-01') }]);

      await service.scanRecallCandidates();
      expect(campaignService.createCampaign).toHaveBeenCalledTimes(2);
    });

    it('scanRecallCandidates skips accounts with ai-receptionist disabled', async () => {
      prisma.outboundSettings.findMany.mockResolvedValue([
        { ...mockSettings, accountId: 'acc-1', account: { featureSettings: { 'ai-receptionist': false } } },
        { ...mockSettings, accountId: 'acc-2', account: { featureSettings: { 'ai-receptionist': true } } },
      ]);
      mockRecallAppts([{ patientId: 'p-1', patientName: 'A', startTime: new Date('2025-06-01') }]);

      await service.scanRecallCandidates();
      expect(campaignService.createCampaign).toHaveBeenCalledTimes(1);
    });

    it('scanReminderCandidates creates reminder campaigns', async () => {
      prisma.outboundSettings.findMany.mockResolvedValue([{ accountId: 'acc-1', ...mockSettings, account: { featureSettings: {} } }]);
      mockPmsProvider.getAppointments.mockResolvedValue({
        success: true,
        data: [{ patientId: 'p-1', patientName: 'A', startTime: new Date('2026-03-04') }],
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
        data: [{ patientId: 'p-1', patientName: 'A', startTime: new Date('2026-03-02') }],
      });

      await service.scanNoShowCandidates();
      expect(campaignService.createCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ callType: 'NOSHOW' }),
      );
    });

    it('scanReactivationCandidates creates reactivation campaigns', async () => {
      prisma.outboundSettings.findMany.mockResolvedValue([{ accountId: 'acc-1', ...mockSettings, account: { featureSettings: {} } }]);
      mockPmsProvider.getAppointments.mockImplementation((params: any) => {
        if (params?.status === 'scheduled') return Promise.resolve({ success: true, data: [] });
        return Promise.resolve({ success: true, data: [{ patientId: 'p-1', patientName: 'A', startTime: new Date('2024-01-01') }] });
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
      let callCount = 0;
      mockPmsProvider.getAppointments.mockImplementation((params: any) => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('PMS error'));
        if (params?.status === 'scheduled') return Promise.resolve({ success: true, data: [] });
        return Promise.resolve({ success: true, data: [{ patientId: 'p-2', patientName: 'B', startTime: new Date('2025-06-01') }] });
      });

      await service.scanRecallCandidates();
      expect(campaignService.createCampaign).toHaveBeenCalledTimes(1);
    });
  });

  describe('bootstrapCampaignsForAccount (with PMS)', () => {
    const mockPmsProvider = { getAppointments: jest.fn(), listPatients: jest.fn() };

    beforeEach(() => {
      jest.spyOn(service as any, 'getPmsServiceForAccount').mockResolvedValue(mockPmsProvider);
      prisma.outboundCampaign.findFirst.mockResolvedValue(null);
      setupScanMocks(mockPmsProvider);
      settingsService.getSettings.mockResolvedValue(mockSettings);
      mockPmsProvider.listPatients.mockResolvedValue({
        success: true,
        data: [makePatient('p-1', 'Boot', 'Pat', '+15551001')],
      });
    });

    it('runs recall, reminder, and noshow for PATIENT_CARE with PMS data', async () => {
      mockPmsProvider.getAppointments.mockImplementation((params: any) => {
        if (params?.status === 'scheduled') {
          return Promise.resolve({ success: true, data: [{ patientId: 'p-1', patientName: 'Boot', startTime: new Date('2026-04-01') }] });
        }
        return Promise.resolve({ success: true, data: [{ patientId: 'p-1', patientName: 'Boot', startTime: new Date('2025-06-01') }] });
      });

      await service.bootstrapCampaignsForAccount('acc-1', 'PATIENT_CARE');

      // recall + reminder + noshow = 3 campaigns (recall has upcoming check but p-1 IS in upcoming
      // so recall gets 0 contacts, meaning only reminder + noshow get created)
      // Actually: recall upcoming returns p-1 as scheduled → p-1 excluded from recall → no recall campaign
      // Let's just verify at least 2 campaigns are created (reminder + noshow)
      expect(campaignService.createCampaign).toHaveBeenCalledTimes(2);
    });
  });
});
