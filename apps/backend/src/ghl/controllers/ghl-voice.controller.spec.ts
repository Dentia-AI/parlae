import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GhlVoiceController } from './ghl-voice.controller';
import { GhlVoiceService } from '../services/ghl-voice.service';
import { DevAuthGuard } from '../../auth/dev-auth.guard';
import { CognitoJwtVerifierService } from '../../auth/cognito-jwt-verifier.service';

describe('GhlVoiceController', () => {
  let controller: GhlVoiceController;
  let service: any;

  beforeEach(async () => {
    const mockService = {
      getAvailableVoices: jest.fn().mockResolvedValue([
        { id: 'nova', name: 'Nova', gender: 'female', language: 'en-US' },
      ]),
      getVoiceById: jest.fn().mockResolvedValue({ id: 'nova', name: 'Nova' }),
      getVoicePreviewUrl: jest.fn().mockResolvedValue('https://example.com/preview.mp3'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GhlVoiceController],
      providers: [
        { provide: GhlVoiceService, useValue: mockService },
        DevAuthGuard,
        { provide: CognitoJwtVerifierService, useValue: { verifyToken: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<GhlVoiceController>(GhlVoiceController);
    service = module.get(GhlVoiceService);
  });

  it('should be defined', () => { expect(controller).toBeDefined(); });

  describe('getAvailableVoices', () => {
    it('should return voices', async () => {
      const result = await controller.getAvailableVoices();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.count).toBe(1);
    });

    it('should throw on error', async () => {
      service.getAvailableVoices.mockRejectedValue(new Error('fail'));
      await expect(controller.getAvailableVoices()).rejects.toThrow(HttpException);
    });
  });

  describe('getVoiceById', () => {
    it('should return voice', async () => {
      const result = await controller.getVoiceById('nova');
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('nova');
    });

    it('should throw not found', async () => {
      service.getVoiceById.mockResolvedValue(null);
      await expect(controller.getVoiceById('missing')).rejects.toThrow(HttpException);
    });
  });

  describe('getVoicePreview', () => {
    it('should return preview URL', async () => {
      const result = await controller.getVoicePreview('nova');
      expect(result.success).toBe(true);
      expect(result.data!.previewUrl).toBeDefined();
    });

    it('should return null when no preview', async () => {
      service.getVoicePreviewUrl.mockResolvedValue(null);
      const result = await controller.getVoicePreview('nova');
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
  });
});
