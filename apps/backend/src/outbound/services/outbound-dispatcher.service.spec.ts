import { Test, TestingModule } from '@nestjs/testing';
import { OutboundDispatcherService } from './outbound-dispatcher.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboundCampaignService } from './outbound-campaign.service';
import { OutboundSettingsService } from './outbound-settings.service';
import { RetellTemplateService } from '../../retell/retell-template.service';
import { createMockPrismaService } from '../../test/mocks/prisma.mock';

describe('OutboundDispatcherService', () => {
  let service: OutboundDispatcherService;
  let prisma: any;
  let campaignService: any;
  let settingsService: any;
  let retellService: any;

  const mockSettings: any = {
    accountId: 'acc-1',
    callingWindowStart: '00:00',
    callingWindowEnd: '23:59',
    timezone: 'America/New_York',
    leaveVoicemail: false,
    fromPhoneNumberId: null,
    patientCareRetellAgentId: null,
    financialRetellAgentId: null,
  };

  // Use lowercase callType to match CALL_TYPE_TO_AGENT_GROUP keys
  const mockCampaign: any = {
    id: 'camp-1',
    accountId: 'acc-1',
    callType: 'recall',
    channel: 'PHONE',
    maxConcurrent: 2,
    timezone: 'America/New_York',
    callingWindowStart: '00:00',
    callingWindowEnd: '23:59',
    account: { id: 'acc-1', brandingTimezone: 'America/New_York' },
  };

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboundDispatcherService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: OutboundCampaignService,
          useValue: {
            getQueuedContacts: jest.fn().mockResolvedValue([]),
            updateContactStatus: jest.fn().mockResolvedValue({}),
            incrementCampaignStats: jest.fn().mockResolvedValue(undefined),
            updateCampaignStatus: jest.fn().mockResolvedValue({}),
            checkAndCompleteCampaign: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: OutboundSettingsService,
          useValue: {
            getSettings: jest.fn().mockResolvedValue(mockSettings),
            isGroupEnabled: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: RetellTemplateService,
          useValue: {
            createOutboundCall: jest.fn().mockResolvedValue({ call_id: 'call-1' }),
          },
        },
      ],
    }).compile();

    service = module.get<OutboundDispatcherService>(OutboundDispatcherService);
    prisma = module.get(PrismaService);
    campaignService = module.get(OutboundCampaignService);
    settingsService = module.get(OutboundSettingsService);
    retellService = module.get(RetellTemplateService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processQueue', () => {
    it('processes active campaigns and activates scheduled ones', async () => {
      prisma.outboundCampaign.findMany
        .mockResolvedValueOnce([]) // active campaigns
        .mockResolvedValueOnce([]); // scheduled campaigns

      await service.processQueue();

      expect(prisma.outboundCampaign.findMany).toHaveBeenCalledTimes(2);
    });

    it('activates scheduled campaigns past their start time', async () => {
      const pastDate = new Date(Date.now() - 60000);
      prisma.outboundCampaign.findMany
        .mockResolvedValueOnce([]) // no active campaigns
        .mockResolvedValueOnce([{ id: 'camp-1', accountId: 'acc-1', callType: 'recall', scheduledStartAt: pastDate }]);

      await service.processQueue();

      expect(campaignService.updateCampaignStatus).toHaveBeenCalledWith('camp-1', 'ACTIVE');
    });

    it('catches errors without crashing', async () => {
      prisma.outboundCampaign.findMany.mockRejectedValue(new Error('DB error'));
      await expect(service.processQueue()).resolves.toBeUndefined();
    });
  });

  describe('processCampaign (via processQueue)', () => {
    function setupCampaignTest(campaign: any, contacts: any[] = []) {
      prisma.outboundCampaign.findMany
        .mockResolvedValueOnce([campaign]) // active campaigns
        .mockResolvedValueOnce([]); // scheduled campaigns
      prisma.campaignContact.count.mockResolvedValue(0);
      prisma.account.findUnique.mockResolvedValue({ featureSettings: {} });
      jest.spyOn(service as any, 'isWithinCallingWindow').mockReturnValue(true);
      if (contacts.length) {
        campaignService.getQueuedContacts.mockResolvedValue(contacts);
      }
    }

    it('skips contacts without phone numbers', async () => {
      setupCampaignTest(mockCampaign, [
        { id: 'c1', patientId: 'p1', phoneNumber: null, attempts: 0 },
      ]);

      await service.processQueue();

      expect(campaignService.updateContactStatus).toHaveBeenCalledWith('c1', expect.objectContaining({
        status: 'FAILED',
        outcome: 'no_phone_number',
      }));
    });

    it('skips DNC contacts', async () => {
      prisma.doNotCallEntry.findUnique.mockResolvedValue({ id: 'dnc-1' });
      setupCampaignTest(mockCampaign, [
        { id: 'c1', patientId: 'p1', phoneNumber: '+11234567890', attempts: 0 },
      ]);

      await service.processQueue();

      expect(campaignService.updateContactStatus).toHaveBeenCalledWith('c1', expect.objectContaining({
        status: 'CANCELLED',
        outcome: 'dnc_excluded',
      }));
    });

    it('dispatches phone call via retell', async () => {
      prisma.doNotCallEntry.findUnique.mockResolvedValue(null);
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({ phoneNumber: '+19995551234' });
      prisma.outboundAgentTemplate.findUnique.mockResolvedValue({ retellAgentId: 'agent-1', voicemailMessages: {} });
      setupCampaignTest(mockCampaign, [
        { id: 'c1', patientId: 'p1', phoneNumber: '+11234567890', attempts: 0, callContext: {} },
      ]);

      await service.processQueue();

      expect(retellService.createOutboundCall).toHaveBeenCalled();
      expect(campaignService.updateContactStatus).toHaveBeenCalledWith('c1', expect.objectContaining({
        status: 'DIALING',
        retellCallId: 'call-1',
      }));
    });

    it('passes resolved voicemail message when leaveVoicemail is true', async () => {
      const vmSettings = {
        ...mockSettings,
        leaveVoicemail: true,
      };
      settingsService.getSettings.mockResolvedValue(vmSettings);
      prisma.doNotCallEntry.findUnique.mockResolvedValue(null);
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({ phoneNumber: '+19995551234' });
      prisma.outboundAgentTemplate.findUnique.mockResolvedValue({
        retellAgentId: 'agent-1',
        voicemailMessages: {
          recall: 'Hi {{patient_name}}, this is {{clinic_name}} calling. Please call us at {{clinic_phone}}.',
        },
      });
      prisma.account.findUnique
        .mockResolvedValueOnce({ featureSettings: {} })
        .mockResolvedValueOnce({ name: 'Test Dental', brandingBusinessName: 'Smile Dental' });
      prisma.outboundCampaign.findMany
        .mockResolvedValueOnce([mockCampaign])
        .mockResolvedValueOnce([]);
      prisma.campaignContact.count.mockResolvedValue(0);
      jest.spyOn(service as any, 'isWithinCallingWindow').mockReturnValue(true);
      campaignService.getQueuedContacts.mockResolvedValue([
        { id: 'c1', patientId: 'p1', phoneNumber: '+11234567890', attempts: 0, callContext: { patient_name: 'John' } },
      ]);

      await service.processQueue();

      expect(retellService.createOutboundCall).toHaveBeenCalledWith(
        expect.objectContaining({
          voicemailMessage: 'Hi John, this is Smile Dental calling. Please call us at +19995551234.',
        }),
      );
    });

    it('passes undefined voicemailMessage when leaveVoicemail is false', async () => {
      prisma.doNotCallEntry.findUnique.mockResolvedValue(null);
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({ phoneNumber: '+19995551234' });
      prisma.outboundAgentTemplate.findUnique.mockResolvedValue({
        retellAgentId: 'agent-1',
        voicemailMessages: { recall: 'Hi {{patient_name}}' },
      });
      setupCampaignTest(mockCampaign, [
        { id: 'c1', patientId: 'p1', phoneNumber: '+11234567890', attempts: 0, callContext: {} },
      ]);

      await service.processQueue();

      expect(retellService.createOutboundCall).toHaveBeenCalledWith(
        expect.objectContaining({ voicemailMessage: undefined }),
      );
    });

    it('skips when agent group is not enabled', async () => {
      settingsService.isGroupEnabled.mockResolvedValue(false);
      setupCampaignTest(mockCampaign);

      await service.processQueue();

      expect(campaignService.getQueuedContacts).not.toHaveBeenCalled();
    });

    it('dispatches SMS channel contacts', async () => {
      prisma.doNotCallEntry.findUnique.mockResolvedValue(null);
      setupCampaignTest({ ...mockCampaign, channel: 'SMS' }, [
        { id: 'c1', patientId: 'p1', phoneNumber: '+11234567890', attempts: 0, callContext: {} },
      ]);

      await service.processQueue();

      expect(campaignService.updateContactStatus).toHaveBeenCalledWith('c1', expect.objectContaining({
        status: 'COMPLETED',
        outcome: 'sms_sent',
      }));
    });

    it('dispatches EMAIL channel contacts', async () => {
      prisma.doNotCallEntry.findUnique.mockResolvedValue(null);
      setupCampaignTest({ ...mockCampaign, channel: 'EMAIL' }, [
        { id: 'c1', patientId: 'p1', phoneNumber: '+11234567890', attempts: 0, callContext: {} },
      ]);

      await service.processQueue();

      expect(campaignService.updateContactStatus).toHaveBeenCalledWith('c1', expect.objectContaining({
        status: 'COMPLETED',
        outcome: 'email_sent',
      }));
    });

    it('handles dispatch errors gracefully', async () => {
      prisma.doNotCallEntry.findUnique.mockResolvedValue(null);
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({ phoneNumber: '+19995551234' });
      prisma.outboundAgentTemplate.findUnique.mockResolvedValue({ retellAgentId: 'agent-1', voicemailMessages: {} });
      retellService.createOutboundCall.mockRejectedValue(new Error('Retell API error'));
      setupCampaignTest(mockCampaign, [
        { id: 'c1', patientId: 'p1', phoneNumber: '+11234567890', attempts: 0, callContext: {} },
      ]);

      await service.processQueue();

      expect(campaignService.updateContactStatus).toHaveBeenCalledWith('c1', expect.objectContaining({
        status: 'FAILED',
      }));
    });

    it('respects maxConcurrent slots', async () => {
      prisma.outboundCampaign.findMany
        .mockResolvedValueOnce([{ ...mockCampaign, maxConcurrent: 2 }])
        .mockResolvedValueOnce([]);
      prisma.campaignContact.count.mockResolvedValue(2); // 2 in progress = 0 slots

      await service.processQueue();

      expect(campaignService.getQueuedContacts).not.toHaveBeenCalled();
    });

    it('checks campaign completion after processing', async () => {
      prisma.doNotCallEntry.findUnique.mockResolvedValue(null);
      setupCampaignTest({ ...mockCampaign, channel: 'SMS' }, [
        { id: 'c1', patientId: 'p1', phoneNumber: '+11234567890', attempts: 0, callContext: {} },
      ]);

      await service.processQueue();

      expect(campaignService.checkAndCompleteCampaign).toHaveBeenCalledWith('camp-1');
    });

    it('skips when no settings found', async () => {
      settingsService.getSettings.mockResolvedValue(null);
      setupCampaignTest(mockCampaign);

      await service.processQueue();

      expect(campaignService.getQueuedContacts).not.toHaveBeenCalled();
    });

    it('uses fromPhoneNumberId scoped by accountId to resolve the from number', async () => {
      const settingsWithFrom = {
        ...mockSettings,
        fromPhoneNumberId: 'phone-rec-1',
      };
      settingsService.getSettings.mockResolvedValue(settingsWithFrom);

      prisma.retellPhoneNumber.findFirst
        .mockResolvedValueOnce({ phoneNumber: '+15855153460' });
      prisma.doNotCallEntry.findUnique.mockResolvedValue(null);
      prisma.outboundAgentTemplate.findUnique.mockResolvedValue({
        retellAgentId: 'agent-1',
        voicemailMessages: {},
      });
      setupCampaignTest(mockCampaign, [
        { id: 'c1', patientId: 'p1', phoneNumber: '+11234567890', attempts: 0, callContext: {} },
      ]);

      await service.processQueue();

      expect(prisma.retellPhoneNumber.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'phone-rec-1',
            accountId: 'acc-1',
            isActive: true,
          }),
        }),
      );
      expect(retellService.createOutboundCall).toHaveBeenCalledWith(
        expect.objectContaining({ fromNumber: '+15855153460' }),
      );
    });

    it('rejects fromPhoneNumberId if accountId does not match (stale record scenario)', async () => {
      const settingsWithFrom = {
        ...mockSettings,
        fromPhoneNumberId: 'phone-rec-wrong',
      };
      settingsService.getSettings.mockResolvedValue(settingsWithFrom);

      // findFirst returns null because the where clause requires both id AND accountId
      prisma.retellPhoneNumber.findFirst.mockResolvedValue(null);
      prisma.doNotCallEntry.findUnique.mockResolvedValue(null);
      prisma.outboundAgentTemplate.findUnique.mockResolvedValue({
        retellAgentId: 'agent-1',
        voicemailMessages: {},
      });
      setupCampaignTest(mockCampaign, [
        { id: 'c1', patientId: 'p1', phoneNumber: '+11234567890', attempts: 0, callContext: {} },
      ]);

      await service.processQueue();

      // Should NOT dispatch because from number could not be resolved
      expect(retellService.createOutboundCall).not.toHaveBeenCalled();
    });

    it('falls back to accountId lookup when fromPhoneNumberId is not set', async () => {
      prisma.doNotCallEntry.findUnique.mockResolvedValue(null);
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({ phoneNumber: '+15855153460' });
      prisma.outboundAgentTemplate.findUnique.mockResolvedValue({
        retellAgentId: 'agent-1',
        voicemailMessages: {},
      });
      setupCampaignTest(mockCampaign, [
        { id: 'c1', patientId: 'p1', phoneNumber: '+11234567890', attempts: 0, callContext: {} },
      ]);

      await service.processQueue();

      expect(prisma.retellPhoneNumber.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            accountId: 'acc-1',
            isActive: true,
          }),
        }),
      );
      expect(retellService.createOutboundCall).toHaveBeenCalledWith(
        expect.objectContaining({ fromNumber: '+15855153460' }),
      );
    });

    it('skips campaign when ai-receptionist is disabled for account', async () => {
      prisma.outboundCampaign.findMany
        .mockResolvedValueOnce([mockCampaign])
        .mockResolvedValueOnce([]);
      prisma.account.findUnique.mockResolvedValue({
        featureSettings: { 'ai-receptionist': false },
      });

      await service.processQueue();

      expect(settingsService.getSettings).not.toHaveBeenCalled();
      expect(campaignService.getQueuedContacts).not.toHaveBeenCalled();
    });

    it('skips campaign when outbound-calls is disabled for account', async () => {
      prisma.outboundCampaign.findMany
        .mockResolvedValueOnce([mockCampaign])
        .mockResolvedValueOnce([]);
      prisma.account.findUnique.mockResolvedValue({
        featureSettings: { 'ai-receptionist': true, 'outbound-calls': false },
      });

      await service.processQueue();

      expect(settingsService.getSettings).not.toHaveBeenCalled();
      expect(campaignService.getQueuedContacts).not.toHaveBeenCalled();
    });

    it('processes campaign when ai-receptionist is explicitly enabled', async () => {
      prisma.doNotCallEntry.findUnique.mockResolvedValue(null);
      prisma.outboundCampaign.findMany
        .mockResolvedValueOnce([{ ...mockCampaign, channel: 'SMS' }])
        .mockResolvedValueOnce([]);
      prisma.campaignContact.count.mockResolvedValue(0);
      prisma.account.findUnique.mockResolvedValue({
        featureSettings: { 'ai-receptionist': true },
      });
      jest.spyOn(service as any, 'isWithinCallingWindow').mockReturnValue(true);
      campaignService.getQueuedContacts.mockResolvedValue([
        { id: 'c1', patientId: 'p1', phoneNumber: '+11234567890', attempts: 0, callContext: {} },
      ]);

      await service.processQueue();

      expect(settingsService.getSettings).toHaveBeenCalled();
      expect(campaignService.updateContactStatus).toHaveBeenCalled();
    });

    it('processes campaign when featureSettings is empty (defaults to enabled)', async () => {
      prisma.doNotCallEntry.findUnique.mockResolvedValue(null);
      prisma.outboundCampaign.findMany
        .mockResolvedValueOnce([{ ...mockCampaign, channel: 'SMS' }])
        .mockResolvedValueOnce([]);
      prisma.campaignContact.count.mockResolvedValue(0);
      prisma.account.findUnique.mockResolvedValue({ featureSettings: {} });
      jest.spyOn(service as any, 'isWithinCallingWindow').mockReturnValue(true);
      campaignService.getQueuedContacts.mockResolvedValue([
        { id: 'c1', patientId: 'p1', phoneNumber: '+11234567890', attempts: 0, callContext: {} },
      ]);

      await service.processQueue();

      expect(settingsService.getSettings).toHaveBeenCalled();
    });
  });
});
