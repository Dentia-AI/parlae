import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface Voice {
  id: string;
  name: string;
  gender: 'male' | 'female';
  language: string;
  accent?: string;
  description?: string;
  previewUrl?: string;
  provider?: string;
}

interface GhlVoicesResponse {
  voices?: Voice[];
  error?: string;
  message?: string;
}

@Injectable()
export class GhlVoiceService {
  private readonly logger = new Logger(GhlVoiceService.name);
  private readonly ghlApiKey: string;
  private readonly ghlBaseUrl: string;

  // Mock data for available voices (until GHL API is confirmed)
  private readonly MOCK_VOICES: Voice[] = [
    {
      id: 'alloy',
      name: 'Alloy',
      gender: 'male',
      language: 'en-US',
      accent: 'American',
      description: 'Professional, clear voice suitable for business',
      provider: 'OpenAI',
    },
    {
      id: 'echo',
      name: 'Echo',
      gender: 'male',
      language: 'en-US',
      accent: 'American',
      description: 'Warm, friendly voice with good clarity',
      provider: 'OpenAI',
    },
    {
      id: 'fable',
      name: 'Fable',
      gender: 'male',
      language: 'en-GB',
      accent: 'British',
      description: 'Sophisticated British accent',
      provider: 'OpenAI',
    },
    {
      id: 'onyx',
      name: 'Onyx',
      gender: 'male',
      language: 'en-US',
      accent: 'American',
      description: 'Deep, authoritative voice',
      provider: 'OpenAI',
    },
    {
      id: 'nova',
      name: 'Nova',
      gender: 'female',
      language: 'en-US',
      accent: 'American',
      description: 'Friendly, professional female voice',
      provider: 'OpenAI',
    },
    {
      id: 'shimmer',
      name: 'Shimmer',
      gender: 'female',
      language: 'en-US',
      accent: 'American',
      description: 'Warm, empathetic female voice',
      provider: 'OpenAI',
    },
  ];

  constructor(private readonly configService: ConfigService) {
    this.ghlApiKey = this.configService.get<string>('GHL_API_KEY') || '';
    this.ghlBaseUrl =
      this.configService.get<string>('GHL_BASE_URL') ||
      'https://services.leadconnectorhq.com';
  }

  /**
   * Get all available voices
   * First tries to fetch from GHL API, falls back to mock data
   */
  async getAvailableVoices(): Promise<Voice[]> {
    try {
      this.logger.log('Fetching available voices');

      // Try to fetch from GHL API
      const ghlVoices = await this.fetchVoicesFromGhl();

      if (ghlVoices && ghlVoices.length > 0) {
        this.logger.log({
          message: 'Fetched voices from GHL',
          count: ghlVoices.length,
        });
        return ghlVoices;
      }

      // Fallback to mock data
      this.logger.log({
        message: 'Using mock voice data',
        count: this.MOCK_VOICES.length,
      });
      return this.MOCK_VOICES;
    } catch (error) {
      this.logger.error({
        message: 'Error fetching voices, using mock data',
        error: error.message,
      });
      return this.MOCK_VOICES;
    }
  }

  /**
   * Get voice by ID
   */
  async getVoiceById(voiceId: string): Promise<Voice | null> {
    const voices = await this.getAvailableVoices();
    return voices.find((v) => v.id === voiceId) || null;
  }

  /**
   * Get voice preview URL
   */
  async getVoicePreviewUrl(voiceId: string): Promise<string | null> {
    try {
      const voice = await this.getVoiceById(voiceId);
      return voice?.previewUrl || null;
    } catch (error) {
      this.logger.error({
        message: 'Error getting voice preview',
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Fetch voices from GHL API
   */
  private async fetchVoicesFromGhl(): Promise<Voice[] | null> {
    try {
      if (!this.ghlApiKey) {
        return null;
      }

      const response = await fetch(`${this.ghlBaseUrl}/voices/available`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.ghlApiKey}`,
          Version: '2021-07-28',
        },
      });

      if (!response.ok) {
        this.logger.warn({
          message: 'GHL voices API not available',
          status: response.status,
        });
        return null;
      }

      const result = (await response.json()) as GhlVoicesResponse;
      return result.voices || null;
    } catch (error) {
      this.logger.warn({
        message: 'Could not fetch voices from GHL',
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Filter voices by language
   */
  async getVoicesByLanguage(language: string): Promise<Voice[]> {
    const voices = await this.getAvailableVoices();
    return voices.filter((v) => v.language === language);
  }

  /**
   * Filter voices by gender
   */
  async getVoicesByGender(gender: 'male' | 'female'): Promise<Voice[]> {
    const voices = await this.getAvailableVoices();
    return voices.filter((v) => v.gender === gender);
  }
}
