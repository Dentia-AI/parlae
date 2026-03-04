import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { OutboundController } from './outbound.controller';
import { PrismaService } from '../prisma/prisma.service';
import { OutboundCampaignService } from './services/outbound-campaign.service';
import { OutboundSettingsService } from './services/outbound-settings.service';
import { OutboundSchedulerService } from './services/outbound-scheduler.service';
import { createMockPrismaService } from '../test/mocks/prisma.mock';

describe('OutboundController', () => {
  let controller: OutboundController;
  let prisma: any;
  let campaignService: any;
  let settingsService: any;
  let schedulerService: any;

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OutboundController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: OutboundCampaignService,
          useValue: {
            getCampaign: jest.fn(),
            listCampaigns: jest.fn().mockResolvedValue([]),
            createCampaign: jest.fn().mockResolvedValue({ id: 'camp-1' }),
            updateCampaignStatus: jest.fn().mockResolvedValue({}),
            addContacts: jest.fn().mockResolvedValue({ added: 1, skipped: 0 }),
            getContacts: jest.fn().mockResolvedValue([]),
            approveCampaign: jest.fn().mockResolvedValue({ id: 'camp-1', status: 'ACTIVE' }),
            approveAllDraftCampaigns: jest.fn().mockResolvedValue({ approved: 3 }),
          },
        },
        {
          provide: OutboundSettingsService,
          useValue: {
            getOrCreateSettings: jest.fn().mockResolvedValue({ accountId: 'acc-1' }),
            updateSettings: jest.fn().mockResolvedValue({}),
            enableAgentGroup: jest.fn().mockResolvedValue({}),
            disableAgentGroup: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: OutboundSchedulerService,
          useValue: {
            bootstrapCampaignsForAccount: jest.fn().mockResolvedValue(undefined),
            triggerScansForAccount: jest.fn().mockResolvedValue(['recall']),
          },
        },
      ],
    }).compile();

    controller = module.get<OutboundController>(OutboundController);
    prisma = module.get(PrismaService);
    campaignService = module.get(OutboundCampaignService);
    settingsService = module.get(OutboundSettingsService);
    schedulerService = module.get(OutboundSchedulerService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── Settings ──────────────────────────────────────────────────────────

  describe('getSettings', () => {
    it('returns settings for account', async () => {
      const result = await controller.getSettings('acc-1');
      expect(settingsService.getOrCreateSettings).toHaveBeenCalledWith('acc-1');
      expect(result).toEqual({ accountId: 'acc-1' });
    });
  });

  describe('updateSettings', () => {
    it('updates settings', async () => {
      await controller.updateSettings('acc-1', { timezone: 'UTC' });
      expect(settingsService.updateSettings).toHaveBeenCalledWith('acc-1', { timezone: 'UTC' });
    });
  });

  describe('enableAgentGroup', () => {
    it('enables PATIENT_CARE group', async () => {
      await controller.enableAgentGroup('acc-1', { group: 'PATIENT_CARE' });
      expect(settingsService.enableAgentGroup).toHaveBeenCalledWith('acc-1', 'PATIENT_CARE');
      expect(schedulerService.bootstrapCampaignsForAccount).toHaveBeenCalledWith('acc-1', 'PATIENT_CARE');
    });

    it('enables FINANCIAL group', async () => {
      await controller.enableAgentGroup('acc-1', { group: 'FINANCIAL' });
      expect(settingsService.enableAgentGroup).toHaveBeenCalledWith('acc-1', 'FINANCIAL');
    });

    it('throws 400 for invalid group', async () => {
      await expect(
        controller.enableAgentGroup('acc-1', { group: 'INVALID' as any }),
      ).rejects.toThrow(HttpException);
    });

    it('throws 400 when group is missing', async () => {
      await expect(
        controller.enableAgentGroup('acc-1', {} as any),
      ).rejects.toThrow(HttpException);
    });

    it('does not fail when bootstrap rejects (fire-and-forget)', async () => {
      schedulerService.bootstrapCampaignsForAccount.mockRejectedValue(new Error('fail'));
      const result = await controller.enableAgentGroup('acc-1', { group: 'PATIENT_CARE' });
      expect(result).toBeDefined();
    });
  });

  describe('disableAgentGroup', () => {
    it('disables valid group', async () => {
      await controller.disableAgentGroup('acc-1', { group: 'FINANCIAL' });
      expect(settingsService.disableAgentGroup).toHaveBeenCalledWith('acc-1', 'FINANCIAL');
    });

    it('throws 400 for invalid group', async () => {
      await expect(
        controller.disableAgentGroup('acc-1', { group: 'NOPE' as any }),
      ).rejects.toThrow(HttpException);
    });
  });

  // ── Campaigns ─────────────────────────────────────────────────────────

  describe('listCampaigns', () => {
    it('lists campaigns with filters', async () => {
      await controller.listCampaigns('acc-1', 'ACTIVE' as any, 'RECALL' as any, 'true');
      expect(campaignService.listCampaigns).toHaveBeenCalledWith('acc-1', {
        status: 'ACTIVE',
        callType: 'RECALL',
        isAutoGenerated: true,
      });
    });

    it('passes undefined for missing filters', async () => {
      await controller.listCampaigns('acc-1');
      expect(campaignService.listCampaigns).toHaveBeenCalledWith('acc-1', {
        status: undefined,
        callType: undefined,
        isAutoGenerated: undefined,
      });
    });
  });

  describe('getCampaign', () => {
    it('returns campaign owned by account', async () => {
      campaignService.getCampaign.mockResolvedValue({ id: 'camp-1', accountId: 'acc-1' });
      const result = await controller.getCampaign('acc-1', 'camp-1');
      expect(result.id).toBe('camp-1');
    });

    it('throws 404 when not found', async () => {
      campaignService.getCampaign.mockResolvedValue(null);
      await expect(controller.getCampaign('acc-1', 'camp-1')).rejects.toThrow(HttpException);
    });

    it('throws 404 when campaign belongs to different account', async () => {
      campaignService.getCampaign.mockResolvedValue({ id: 'camp-1', accountId: 'other' });
      await expect(controller.getCampaign('acc-1', 'camp-1')).rejects.toThrow(HttpException);
    });
  });

  describe('createCampaign', () => {
    it('creates campaign with all fields', async () => {
      await controller.createCampaign('acc-1', {
        name: 'Test',
        callType: 'RECALL' as any,
        channel: 'PHONE' as any,
        timezone: 'UTC',
        maxConcurrent: 5,
        maxAttemptsPerContact: 2,
        createdBy: 'admin',
      });

      expect(campaignService.createCampaign).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'acc-1',
          name: 'Test',
          callType: 'RECALL',
          maxConcurrent: 5,
        }),
      );
    });

    it('parses scheduledStartAt as Date', async () => {
      const dateStr = '2025-06-15T10:00:00Z';
      await controller.createCampaign('acc-1', {
        name: 'Scheduled',
        callType: 'REMINDER' as any,
        scheduledStartAt: dateStr,
      });

      const call = campaignService.createCampaign.mock.calls[0][0];
      expect(call.scheduledStartAt).toEqual(new Date(dateStr));
    });
  });

  describe('updateCampaignStatus', () => {
    it('updates status for valid campaign', async () => {
      campaignService.getCampaign.mockResolvedValue({ id: 'camp-1', accountId: 'acc-1' });
      await controller.updateCampaignStatus('acc-1', 'camp-1', { status: 'PAUSED' as any });
      expect(campaignService.updateCampaignStatus).toHaveBeenCalledWith('camp-1', 'PAUSED');
    });

    it('throws 404 when campaign not found', async () => {
      campaignService.getCampaign.mockResolvedValue(null);
      await expect(
        controller.updateCampaignStatus('acc-1', 'camp-1', { status: 'PAUSED' as any }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('addContacts', () => {
    it('adds contacts to valid campaign', async () => {
      campaignService.getCampaign.mockResolvedValue({ id: 'camp-1', accountId: 'acc-1' });
      const result = await controller.addContacts('acc-1', 'camp-1', {
        contacts: [{ patientId: 'p1', phoneNumber: '+11234567890' }],
      });
      expect(result).toEqual({ added: 1, skipped: 0 });
    });

    it('throws 404 for wrong account', async () => {
      campaignService.getCampaign.mockResolvedValue({ id: 'camp-1', accountId: 'other' });
      await expect(
        controller.addContacts('acc-1', 'camp-1', { contacts: [{ patientId: 'p1' }] }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getContacts', () => {
    it('returns contacts for valid campaign', async () => {
      campaignService.getCampaign.mockResolvedValue({ id: 'camp-1', accountId: 'acc-1' });
      await controller.getContacts('acc-1', 'camp-1', 'QUEUED');
      expect(campaignService.getContacts).toHaveBeenCalledWith('camp-1', { status: 'QUEUED' });
    });
  });

  // ── Approval ──────────────────────────────────────────────────────────

  describe('approveCampaign', () => {
    it('approves a valid campaign', async () => {
      campaignService.getCampaign.mockResolvedValue({ id: 'camp-1', accountId: 'acc-1' });
      const result = await controller.approveCampaign('acc-1', 'camp-1');
      expect(result.status).toBe('ACTIVE');
    });

    it('throws 404 for campaign not found', async () => {
      campaignService.getCampaign.mockResolvedValue(null);
      await expect(controller.approveCampaign('acc-1', 'camp-1')).rejects.toThrow(HttpException);
    });
  });

  describe('approveAllDraftCampaigns', () => {
    it('bulk approves drafts', async () => {
      const result = await controller.approveAllDraftCampaigns('acc-1');
      expect(result).toEqual({ approved: 3 });
    });
  });

  // ── Admin Trigger Scan ────────────────────────────────────────────────

  describe('triggerScan', () => {
    it('triggers scan for specific accounts', async () => {
      prisma.outboundSettings.findMany.mockResolvedValue([
        { accountId: 'acc-1' },
      ]);

      const result = await controller.triggerScan({
        scanTypes: ['recall'],
        accountIds: ['acc-1'],
      });

      expect(result.success).toBe(true);
      expect(result.totalAccounts).toBe(1);
      expect(schedulerService.triggerScansForAccount).toHaveBeenCalled();
    });

    it('triggers scan for all enabled accounts when no accountIds', async () => {
      prisma.outboundSettings.findMany.mockResolvedValue([
        { accountId: 'acc-1' },
        { accountId: 'acc-2' },
      ]);

      const result = await controller.triggerScan({ scanTypes: ['all'] });
      expect(result.totalAccounts).toBe(2);
    });

    it('throws 400 when scanTypes is empty', async () => {
      await expect(
        controller.triggerScan({ scanTypes: [] }),
      ).rejects.toThrow(HttpException);
    });

    it('catches per-account errors and returns them', async () => {
      prisma.outboundSettings.findMany.mockResolvedValue([{ accountId: 'acc-1' }]);
      schedulerService.triggerScansForAccount.mockRejectedValue(new Error('PMS failed'));

      const result = await controller.triggerScan({
        scanTypes: ['recall'],
        accountIds: ['acc-1'],
      });

      expect(result.results[0].error).toBe('PMS failed');
      expect(result.results[0].scansRun).toEqual([]);
    });
  });

  // ── DNC ───────────────────────────────────────────────────────────────

  describe('getDncList', () => {
    it('returns DNC entries for account', async () => {
      prisma.doNotCallEntry.findMany.mockResolvedValue([{ phoneNumber: '+11234567890' }]);
      const result = await controller.getDncList('acc-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('addToDnc', () => {
    it('upserts DNC entry', async () => {
      prisma.doNotCallEntry.upsert.mockResolvedValue({ id: 'dnc-1' });
      const result = await controller.addToDnc('acc-1', {
        phoneNumber: '+11234567890',
        reason: 'patient_requested',
      });
      expect(result).toBeDefined();
      expect(prisma.doNotCallEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountId_phoneNumber: { accountId: 'acc-1', phoneNumber: '+11234567890' } },
        }),
      );
    });

    it('defaults reason to patient_requested on create', async () => {
      prisma.doNotCallEntry.upsert.mockResolvedValue({});
      await controller.addToDnc('acc-1', { phoneNumber: '+11234567890' });

      const call = prisma.doNotCallEntry.upsert.mock.calls[0][0];
      expect(call.create.reason).toBe('patient_requested');
    });
  });
});
