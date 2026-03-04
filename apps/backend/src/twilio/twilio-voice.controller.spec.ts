import { Test, TestingModule } from '@nestjs/testing';
import { TwilioVoiceController } from './twilio-voice.controller';
import { TwilioVoiceService } from './twilio-voice.service';

describe('TwilioVoiceController', () => {
  let controller: TwilioVoiceController;
  let twilioVoiceService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TwilioVoiceController],
      providers: [
        {
          provide: TwilioVoiceService,
          useValue: {
            handleInboundCall: jest
              .fn()
              .mockResolvedValue('<Response>mock-twiml</Response>'),
          },
        },
      ],
    }).compile();

    controller = module.get<TwilioVoiceController>(TwilioVoiceController);
    twilioVoiceService = module.get(TwilioVoiceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleVoiceWebhook', () => {
    it('should pass body to TwilioVoiceService and return TwiML', async () => {
      const body = {
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test_123',
      };

      const result = await controller.handleVoiceWebhook(body);

      expect(twilioVoiceService.handleInboundCall).toHaveBeenCalledWith(body);
      expect(result).toBe('<Response>mock-twiml</Response>');
    });

    it('should propagate service errors', async () => {
      twilioVoiceService.handleInboundCall.mockRejectedValue(
        new Error('Service error'),
      );

      await expect(controller.handleVoiceWebhook({})).rejects.toThrow(
        'Service error',
      );
    });
  });
});
