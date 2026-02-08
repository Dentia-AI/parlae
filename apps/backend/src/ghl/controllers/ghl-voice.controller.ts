import {
  Controller,
  Get,
  Param,
  UseGuards,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { GhlVoiceService } from '../services/ghl-voice.service';
import { DevAuthGuard } from '../../auth/dev-auth.guard';

@Controller('ghl/voices')
@UseGuards(DevAuthGuard)
export class GhlVoiceController {
  private readonly logger = new Logger(GhlVoiceController.name);

  constructor(private readonly voiceService: GhlVoiceService) {}

  /**
   * Get all available voices
   * GET /ghl/voices
   */
  @Get()
  async getAvailableVoices() {
    try {
      const voices = await this.voiceService.getAvailableVoices();

      return {
        success: true,
        data: voices,
        count: voices.length,
      };
    } catch (error) {
      this.logger.error({
        message: 'Error fetching voices',
        error: error.message,
      });
      throw new HttpException(
        'Failed to fetch voices',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get voice by ID
   * GET /ghl/voices/:id
   */
  @Get(':id')
  async getVoiceById(@Param('id') id: string) {
    try {
      const voice = await this.voiceService.getVoiceById(id);

      if (!voice) {
        throw new HttpException('Voice not found', HttpStatus.NOT_FOUND);
      }

      return {
        success: true,
        data: voice,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Error fetching voice',
        error: error.message,
      });
      throw new HttpException(
        'Failed to fetch voice',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get voice preview URL
   * GET /ghl/voices/:id/preview
   */
  @Get(':id/preview')
  async getVoicePreview(@Param('id') id: string) {
    try {
      const previewUrl = await this.voiceService.getVoicePreviewUrl(id);

      if (!previewUrl) {
        return {
          success: true,
          data: null,
          message: 'No preview available for this voice',
        };
      }

      return {
        success: true,
        data: { previewUrl },
      };
    } catch (error) {
      this.logger.error({
        message: 'Error fetching voice preview',
        error: error.message,
      });
      throw new HttpException(
        'Failed to fetch voice preview',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
