import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GhlVoiceService } from './ghl-voice.service';

describe('GhlVoiceService', () => {
  let service: GhlVoiceService;

  beforeEach(async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GhlVoiceService,
        { provide: ConfigService, useValue: { get: jest.fn(() => '') } },
      ],
    }).compile();

    service = module.get<GhlVoiceService>(GhlVoiceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => { expect(service).toBeDefined(); });

  describe('getAvailableVoices', () => {
    it('should return mock voices when no API key', async () => {
      const voices = await service.getAvailableVoices();
      expect(voices.length).toBe(6);
    });

    it('should return GHL voices when API responds', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          voices: [{ id: 'ghl-1', name: 'GHL Voice', gender: 'male', language: 'en-US' }],
        }),
      });
      const svcWithKey = await Test.createTestingModule({
        providers: [
          GhlVoiceService,
          { provide: ConfigService, useValue: { get: jest.fn(() => 'test-key') } },
        ],
      }).compile().then(m => m.get<GhlVoiceService>(GhlVoiceService));

      const voices = await svcWithKey.getAvailableVoices();
      expect(voices).toHaveLength(1);
      expect(voices[0].id).toBe('ghl-1');
    });

    it('should fallback to mock on fetch error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
      const svcWithKey = await Test.createTestingModule({
        providers: [
          GhlVoiceService,
          { provide: ConfigService, useValue: { get: jest.fn(() => 'test-key') } },
        ],
      }).compile().then(m => m.get<GhlVoiceService>(GhlVoiceService));

      const voices = await svcWithKey.getAvailableVoices();
      expect(voices.length).toBe(6);
    });
  });

  describe('getVoiceById', () => {
    it('should return voice by ID', async () => {
      const voice = await service.getVoiceById('nova');
      expect(voice).not.toBeNull();
      expect(voice!.id).toBe('nova');
    });

    it('should return null for unknown ID', async () => {
      const voice = await service.getVoiceById('nonexistent');
      expect(voice).toBeNull();
    });
  });

  describe('getVoicePreviewUrl', () => {
    it('should return null when voice has no preview', async () => {
      const url = await service.getVoicePreviewUrl('nova');
      expect(url).toBeNull();
    });

    it('should return null for unknown voice', async () => {
      const url = await service.getVoicePreviewUrl('nonexistent');
      expect(url).toBeNull();
    });
  });

  describe('getVoicesByLanguage', () => {
    it('should filter voices by language', async () => {
      const voices = await service.getVoicesByLanguage('en-GB');
      expect(voices.length).toBeGreaterThan(0);
      expect(voices.every(v => v.language === 'en-GB')).toBe(true);
    });

    it('should return empty for unknown language', async () => {
      const voices = await service.getVoicesByLanguage('fr-FR');
      expect(voices).toHaveLength(0);
    });
  });

  describe('getVoicesByGender', () => {
    it('should filter voices by female', async () => {
      const voices = await service.getVoicesByGender('female');
      expect(voices.length).toBeGreaterThan(0);
      expect(voices.every(v => v.gender === 'female')).toBe(true);
    });

    it('should filter voices by male', async () => {
      const voices = await service.getVoicesByGender('male');
      expect(voices.length).toBeGreaterThan(0);
      expect(voices.every(v => v.gender === 'male')).toBe(true);
    });
  });
});
