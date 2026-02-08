import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { GhlPhoneService } from '../services/ghl-phone.service';
import { DevAuthGuard } from '../../auth/dev-auth.guard';

@Controller('ghl/phone-numbers')
@UseGuards(DevAuthGuard)
export class GhlPhoneController {
  private readonly logger = new Logger(GhlPhoneController.name);

  constructor(private readonly phoneService: GhlPhoneService) {}

  /**
   * Get available phone numbers
   * GET /ghl/phone-numbers
   * Query params: areaCode, state
   */
  @Get()
  async getAvailablePhoneNumbers(
    @Query('areaCode') areaCode?: string,
    @Query('state') state?: string,
  ) {
    try {
      const phoneNumbers = await this.phoneService.getAvailablePhoneNumbers(
        areaCode,
        state,
      );

      return {
        success: true,
        data: phoneNumbers,
        count: phoneNumbers.length,
      };
    } catch (error) {
      this.logger.error({
        message: 'Error fetching phone numbers',
        error: error.message,
      });
      throw new HttpException(
        'Failed to fetch phone numbers',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Search phone numbers by area code
   * GET /ghl/phone-numbers/search/area-code
   */
  @Get('search/area-code')
  async searchByAreaCode(@Query('code') areaCode: string) {
    try {
      if (!areaCode) {
        throw new HttpException(
          'Area code is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      const phoneNumbers = await this.phoneService.searchByAreaCode(areaCode);

      return {
        success: true,
        data: phoneNumbers,
        count: phoneNumbers.length,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Error searching phone numbers by area code',
        error: error.message,
      });
      throw new HttpException(
        'Failed to search phone numbers',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Search phone numbers by state
   * GET /ghl/phone-numbers/search/state
   */
  @Get('search/state')
  async searchByState(@Query('state') state: string) {
    try {
      if (!state) {
        throw new HttpException('State is required', HttpStatus.BAD_REQUEST);
      }

      const phoneNumbers = await this.phoneService.searchByState(state);

      return {
        success: true,
        data: phoneNumbers,
        count: phoneNumbers.length,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Error searching phone numbers by state',
        error: error.message,
      });
      throw new HttpException(
        'Failed to search phone numbers',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
