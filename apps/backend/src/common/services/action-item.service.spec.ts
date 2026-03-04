import { Test, TestingModule } from '@nestjs/testing';
import { ActionItemService } from './action-item.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../test/mocks/prisma.mock';

describe('ActionItemService', () => {
  let service: ActionItemService;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActionItemService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ActionItemService>(ActionItemService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createActionItemIfNeeded', () => {
    const baseParams = {
      accountId: 'acc-1',
      callId: 'call-1',
      provider: 'RETELL' as const,
      direction: 'INBOUND' as const,
      analysis: {},
      contactName: 'John Doe',
      contactPhone: '+15551234567',
    };

    it('returns null when no trigger condition is met', async () => {
      const result = await service.createActionItemIfNeeded({
        ...baseParams,
        analysis: { custom_analysis_data: { call_outcome: 'booked' } },
      });

      expect(result).toBeNull();
      expect(prisma.actionItem.create).not.toHaveBeenCalled();
    });

    it('creates an action item for follow_up_required', async () => {
      prisma.actionItem.findFirst.mockResolvedValue(null);
      prisma.actionItem.create.mockResolvedValue({ id: 'ai-1', reason: 'FOLLOW_UP_REQUIRED' });
      prisma.notification.create.mockResolvedValue({ id: 1 });

      const result = await service.createActionItemIfNeeded({
        ...baseParams,
        analysis: { custom_analysis_data: { follow_up_required: true } },
      });

      expect(result).toEqual({ id: 'ai-1', reason: 'FOLLOW_UP_REQUIRED' });
      expect(prisma.actionItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accountId: 'acc-1',
          callId: 'call-1',
          provider: 'RETELL',
          direction: 'INBOUND',
          reason: 'FOLLOW_UP_REQUIRED',
          contactName: 'John Doe',
          contactPhone: '+15551234567',
        }),
      });
    });

    it('creates an action item for transferred_to_staff', async () => {
      prisma.actionItem.findFirst.mockResolvedValue(null);
      prisma.actionItem.create.mockResolvedValue({ id: 'ai-2', reason: 'TRANSFER_FAILED' });
      prisma.notification.create.mockResolvedValue({ id: 1 });

      const result = await service.createActionItemIfNeeded({
        ...baseParams,
        analysis: { custom_analysis_data: { transferred_to_staff: true } },
      });

      expect(result?.reason).toBe('TRANSFER_FAILED');
    });

    it('creates an action item for no_resolution outcome', async () => {
      prisma.actionItem.findFirst.mockResolvedValue(null);
      prisma.actionItem.create.mockResolvedValue({ id: 'ai-3', reason: 'NO_RESOLUTION' });
      prisma.notification.create.mockResolvedValue({ id: 1 });

      const result = await service.createActionItemIfNeeded({
        ...baseParams,
        analysis: { custom_analysis_data: { call_outcome: 'no_resolution' } },
      });

      expect(result?.reason).toBe('NO_RESOLUTION');
    });

    it('creates an action item for emergency outcome', async () => {
      prisma.actionItem.findFirst.mockResolvedValue(null);
      prisma.actionItem.create.mockResolvedValue({ id: 'ai-4', reason: 'EMERGENCY' });
      prisma.notification.create.mockResolvedValue({ id: 1 });

      const result = await service.createActionItemIfNeeded({
        ...baseParams,
        analysis: { custom_analysis_data: { call_outcome: 'emergency_handled' } },
      });

      expect(result?.reason).toBe('EMERGENCY');
    });

    it('creates an action item for dial_failed disconnection', async () => {
      prisma.actionItem.findFirst.mockResolvedValue(null);
      prisma.actionItem.create.mockResolvedValue({ id: 'ai-5', reason: 'CALL_ERROR' });
      prisma.notification.create.mockResolvedValue({ id: 1 });

      const result = await service.createActionItemIfNeeded({
        ...baseParams,
        analysis: {},
        disconnectionReason: 'dial_failed',
      });

      expect(result?.reason).toBe('CALL_ERROR');
    });

    it('creates an action item for voicemail_reached disconnection', async () => {
      prisma.actionItem.findFirst.mockResolvedValue(null);
      prisma.actionItem.create.mockResolvedValue({ id: 'ai-6', reason: 'VOICEMAIL_REVIEW' });
      prisma.notification.create.mockResolvedValue({ id: 1 });

      const result = await service.createActionItemIfNeeded({
        ...baseParams,
        analysis: {},
        disconnectionReason: 'voicemail_reached',
      });

      expect(result?.reason).toBe('VOICEMAIL_REVIEW');
    });

    it('does not create a duplicate for the same callId', async () => {
      prisma.actionItem.findFirst.mockResolvedValue({ id: 'existing-ai' });

      const result = await service.createActionItemIfNeeded({
        ...baseParams,
        analysis: { custom_analysis_data: { follow_up_required: true } },
      });

      expect(result).toEqual({ id: 'existing-ai' });
      expect(prisma.actionItem.create).not.toHaveBeenCalled();
    });

    it('creates a notification when action item is created', async () => {
      prisma.actionItem.findFirst.mockResolvedValue(null);
      prisma.actionItem.create.mockResolvedValue({ id: 'ai-7', reason: 'FOLLOW_UP_REQUIRED' });
      prisma.notification.create.mockResolvedValue({ id: 1 });

      await service.createActionItemIfNeeded({
        ...baseParams,
        analysis: { custom_analysis_data: { follow_up_required: true } },
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accountId: 'acc-1',
          type: 'WARNING',
          channel: 'IN_APP',
          link: '/home/action-items',
        }),
      });
    });

    it('handles create errors gracefully', async () => {
      prisma.actionItem.findFirst.mockResolvedValue(null);
      prisma.actionItem.create.mockRejectedValue(new Error('DB error'));

      const result = await service.createActionItemIfNeeded({
        ...baseParams,
        analysis: { custom_analysis_data: { follow_up_required: true } },
      });

      expect(result).toBeNull();
    });

    it('extracts agent_notes from custom_analysis_data', async () => {
      prisma.actionItem.findFirst.mockResolvedValue(null);
      prisma.actionItem.create.mockResolvedValue({ id: 'ai-8' });
      prisma.notification.create.mockResolvedValue({ id: 1 });

      await service.createActionItemIfNeeded({
        ...baseParams,
        analysis: {
          custom_analysis_data: {
            follow_up_required: true,
            agent_notes: 'Will call back about insurance',
          },
        },
      });

      expect(prisma.actionItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          agentNotes: 'Will call back about insurance',
        }),
      });
    });

    it('uses call_summary as summary', async () => {
      prisma.actionItem.findFirst.mockResolvedValue(null);
      prisma.actionItem.create.mockResolvedValue({ id: 'ai-9' });
      prisma.notification.create.mockResolvedValue({ id: 1 });

      await service.createActionItemIfNeeded({
        ...baseParams,
        analysis: {
          call_summary: 'Patient asked about billing',
          custom_analysis_data: { follow_up_required: true },
        },
        summary: 'Patient asked about billing',
      });

      expect(prisma.actionItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          summary: 'Patient asked about billing',
        }),
      });
    });
  });
});
