import { Test, TestingModule } from '@nestjs/testing';
import { TwilioVoiceService } from './twilio-voice.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../test/mocks/prisma.mock';

const mockSay = jest.fn();
const mockRecord = jest.fn();
const mockSip = jest.fn();
const mockDial = jest.fn().mockReturnValue({ sip: mockSip });
const mockHangup = jest.fn();
const mockToString = jest.fn().mockReturnValue('<Response>mock-twiml</Response>');

jest.mock('twilio', () => {
  const VoiceResponseMock = jest.fn().mockImplementation(() => ({
    say: mockSay,
    record: mockRecord,
    dial: mockDial,
    hangup: mockHangup,
    toString: mockToString,
  }));
  const mockDefault = Object.assign(jest.fn(), {
    twiml: { VoiceResponse: VoiceResponseMock },
  });
  return {
    __esModule: true,
    default: mockDefault,
  };
});

describe('TwilioVoiceService', () => {
  let service: TwilioVoiceService;
  let prisma: any;

  const mockClinic = {
    accountId: 'acc-1',
    vapiPhoneId: 'vapi-phone-1',
    account: {
      name: 'Test Dental',
      aiAvailabilitySettings: { mode: 'always' },
    },
  };

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwilioVoiceService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TwilioVoiceService>(TwilioVoiceService);
    prisma = module.get(PrismaService);

    mockSay.mockClear();
    mockRecord.mockClear();
    mockSip.mockClear();
    mockDial.mockClear();
    mockHangup.mockClear();
    mockToString.mockClear().mockReturnValue('<Response>mock-twiml</Response>');

    process.env.APP_BASE_URL = 'https://api.test.com';
    process.env.VAPI_API_KEY = 'vapi-key-123';
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleInboundCall', () => {
    it('should return error response when clinic not found', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(null);

      const result = await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      expect(result).toContain('</Response>');
    });

    it('should handle errors gracefully', async () => {
      prisma.vapiPhoneNumber.findFirst.mockRejectedValue(new Error('DB error'));

      const result = await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      expect(result).toContain('</Response>');
    });

    it('should connect to Vapi when clinic is found and available', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(mockClinic);

      const result = await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      expect(result).toContain('</Response>');
      expect(mockDial).toHaveBeenCalled();
    });

    it('should route to fallback when availability says not available', async () => {
      const unavailableClinic = {
        ...mockClinic,
        account: {
          ...mockClinic.account,
          aiAvailabilitySettings: {
            mode: 'disabled',
            fallback: { type: 'voicemail' },
          },
        },
      };
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(unavailableClinic);

      const result = await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      expect(result).toContain('</Response>');
      expect(mockSay).toHaveBeenCalled();
    });

    it('should identify clinic via SIP URI format', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(mockClinic);

      await service.handleInboundCall({
        From: '+14155551111',
        To: 'testclinic@sip.example.com',
        CallSid: 'CA_sip_test',
      });

      expect(prisma.vapiPhoneNumber.findFirst).toHaveBeenCalled();
    });

    it('should fall back to slug lookup when SIP URI lookup fails', async () => {
      prisma.vapiPhoneNumber.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockClinic);

      await service.handleInboundCall({
        From: '+14155551111',
        To: 'testclinic@sip.example.com',
        CallSid: 'CA_sip_test',
      });

      expect(prisma.vapiPhoneNumber.findFirst).toHaveBeenCalledTimes(2);
    });

    it('should fall to phone number lookup when SIP URI and slug both fail', async () => {
      prisma.vapiPhoneNumber.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockClinic);

      await service.handleInboundCall({
        From: '+14155551111',
        To: 'testclinic@sip.example.com',
        CallSid: 'CA_sip_test',
      });

      expect(prisma.vapiPhoneNumber.findFirst).toHaveBeenCalledTimes(3);
    });
  });

  describe('checkAvailabilitySettings (via handleInboundCall)', () => {
    it('should return available for "always" mode', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        ...mockClinic,
        account: {
          ...mockClinic.account,
          aiAvailabilitySettings: { mode: 'always' },
        },
      });

      const result = await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      expect(result).toContain('</Response>');
      expect(mockDial).toHaveBeenCalled();
    });

    it('should return unavailable for "disabled" mode', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        ...mockClinic,
        account: {
          ...mockClinic.account,
          aiAvailabilitySettings: {
            mode: 'disabled',
            fallback: { type: 'busy-signal' },
          },
        },
      });

      const result = await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      expect(result).toContain('</Response>');
      expect(mockHangup).toHaveBeenCalled();
    });

    it('should check business hours for "after-hours-only" mode', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        ...mockClinic,
        account: {
          ...mockClinic.account,
          aiAvailabilitySettings: {
            mode: 'after-hours-only',
            afterHours: {
              enabled: true,
              businessHours: {
                timezone: 'America/Toronto',
                schedule: {
                  monday: { open: '00:00', close: '23:59' },
                  tuesday: { open: '00:00', close: '23:59' },
                  wednesday: { open: '00:00', close: '23:59' },
                  thursday: { open: '00:00', close: '23:59' },
                  friday: { open: '00:00', close: '23:59' },
                  saturday: { open: '00:00', close: '23:59' },
                  sunday: { open: '00:00', close: '23:59' },
                },
              },
            },
            fallback: { type: 'busy-signal' },
          },
        },
      });

      const result = await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      expect(result).toContain('</Response>');
    });

    it('should handle after-hours when afterHours is not enabled', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        ...mockClinic,
        account: {
          ...mockClinic.account,
          aiAvailabilitySettings: {
            mode: 'after-hours-only',
            afterHours: { enabled: false },
            fallback: { type: 'busy-signal' },
          },
        },
      });

      const result = await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      expect(result).toContain('</Response>');
    });

    it('should handle after-hours when no schedule for current day', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        ...mockClinic,
        account: {
          ...mockClinic.account,
          aiAvailabilitySettings: {
            mode: 'after-hours-only',
            afterHours: {
              enabled: true,
              businessHours: {
                timezone: 'America/Toronto',
                schedule: {},
              },
            },
            fallback: { type: 'voicemail' },
          },
        },
      });

      const result = await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      expect(result).toContain('</Response>');
    });

    it('should check overflow threshold for "overflow-only" mode', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        ...mockClinic,
        account: {
          ...mockClinic.account,
          aiAvailabilitySettings: {
            mode: 'overflow-only',
            highVolume: { threshold: 5 },
            fallback: { type: 'busy-signal' },
          },
        },
      });

      const result = await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      // getActiveCallsCount returns 0, threshold is 5 -> under capacity -> not available
      expect(result).toContain('</Response>');
      expect(mockHangup).toHaveBeenCalled();
    });

    it('should default to available for unknown mode', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        ...mockClinic,
        account: {
          ...mockClinic.account,
          aiAvailabilitySettings: { mode: 'some-unknown-mode' },
        },
      });

      const result = await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      expect(result).toContain('</Response>');
      expect(mockDial).toHaveBeenCalled();
    });

    it('should default to "always" when no settings are provided', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        ...mockClinic,
        account: { name: 'No Settings Clinic' },
      });

      const result = await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      expect(result).toContain('</Response>');
      expect(mockDial).toHaveBeenCalled();
    });
  });

  describe('routeToFallback (via handleInboundCall)', () => {
    const makeUnavailableClinic = (fallback: any) => ({
      ...mockClinic,
      account: {
        ...mockClinic.account,
        aiAvailabilitySettings: {
          mode: 'disabled',
          fallback,
        },
      },
    });

    it('should record voicemail with default greeting', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(
        makeUnavailableClinic({ type: 'voicemail' }),
      );

      await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      expect(mockSay).toHaveBeenCalled();
      expect(mockRecord).toHaveBeenCalledWith(
        expect.objectContaining({ maxLength: 180 }),
      );
    });

    it('should record voicemail with custom greeting', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(
        makeUnavailableClinic({
          type: 'voicemail',
          voicemailGreeting: 'Custom greeting message',
        }),
      );

      await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      expect(mockSay).toHaveBeenCalledWith('Custom greeting message');
    });

    it('should forward call when forward number is provided', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(
        makeUnavailableClinic({ type: 'forward', forwardNumber: '+14155559999' }),
      );

      await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      expect(mockSay).toHaveBeenCalledWith('Please hold while I connect you.');
      expect(mockDial).toHaveBeenCalledWith('+14155559999');
    });

    it('should hang up when forward type but no forward number', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(
        makeUnavailableClinic({ type: 'forward' }),
      );

      await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      expect(mockHangup).toHaveBeenCalled();
    });

    it('should hang up on busy-signal', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(
        makeUnavailableClinic({ type: 'busy-signal' }),
      );

      await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      expect(mockSay).toHaveBeenCalled();
      expect(mockHangup).toHaveBeenCalled();
    });

    it('should default to voicemail when no fallback configured', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        ...mockClinic,
        account: {
          ...mockClinic.account,
          aiAvailabilitySettings: { mode: 'disabled' },
        },
      });

      await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      expect(mockSay).toHaveBeenCalled();
      expect(mockRecord).toHaveBeenCalled();
    });
  });

  describe('connectToVapi (via handleInboundCall)', () => {
    it('should construct SIP URI and dial with credentials', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(mockClinic);

      await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      expect(mockDial).toHaveBeenCalledWith(
        expect.objectContaining({
          answerOnBridge: true,
          action: 'https://api.test.com/api/twilio/call-complete',
          method: 'POST',
        }),
      );
      expect(mockSip).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'vapi-phone-1',
          password: 'vapi-key-123',
        }),
        'sip:vapi-phone-1@sip.vapi.ai',
      );
    });
  });

  describe('createErrorResponse (via handleInboundCall)', () => {
    it('should generate TwiML error response', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(null);

      const result = await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      expect(result).toContain('</Response>');
      expect(mockSay).toHaveBeenCalled();
      expect(mockHangup).toHaveBeenCalled();
    });
  });
});
