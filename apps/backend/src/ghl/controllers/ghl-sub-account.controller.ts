import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { GhlSubAccountService, CreateSubAccountDto } from '../services/ghl-sub-account.service';
import { DevAuthGuard } from '../../auth/dev-auth.guard';

/**
 * Controller for managing GHL sub-accounts
 * All routes are protected and require authentication
 */
@Controller('ghl/sub-accounts')
@UseGuards(DevAuthGuard)
export class GhlSubAccountController {
  private readonly logger = new Logger(GhlSubAccountController.name);

  constructor(private readonly subAccountService: GhlSubAccountService) {}

  /**
   * Create a new sub-account
   * POST /ghl/sub-accounts
   */
  @Post()
  async createSubAccount(@Body() data: CreateSubAccountDto, @Request() req) {
    try {
      this.logger.log({
        message: 'Creating sub-account',
        userId: req.user?.sub || req.user?.id,
        businessName: data.businessName,
      });

      // Ensure userId is set from authenticated user
      const userId = req.user?.sub || req.user?.id || 'test-user-id';
      const createData = {
        ...data,
        userId,
      };

      // Create new location in GHL
      const subAccount = await this.subAccountService.createSubAccount(
        createData,
      );

      if (!subAccount) {
        throw new HttpException(
          'Failed to create sub-account',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return {
        success: true,
        data: subAccount,
      };
    } catch (error) {
      this.logger.error({
        message: 'Error creating sub-account',
        error: error.message,
      });
      throw new HttpException(
        error.message || 'Failed to create sub-account',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get current user's sub-account
   * GET /ghl/sub-accounts/my
   */
  @Get('my')
  async getMySubAccount(@Request() req) {
    try {
      const userId = req.user?.sub || req.user?.id || 'test-user-id';
      const subAccount = await this.subAccountService.getSubAccountByUserId(
        userId,
      );

      if (!subAccount) {
        return {
          success: true,
          data: null,
          message: 'No sub-account found',
        };
      }

      return {
        success: true,
        data: subAccount,
      };
    } catch (error) {
      this.logger.error({
        message: 'Error fetching sub-account',
        error: error.message,
      });
      throw new HttpException(
        'Failed to fetch sub-account',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get sub-account by ID
   * GET /ghl/sub-accounts/:id
   */
  @Get(':id')
  async getSubAccount(@Param('id') id: string, @Request() req) {
    try {
      const subAccount = await this.subAccountService.getSubAccountById(id);

      if (!subAccount) {
        throw new HttpException('Sub-account not found', HttpStatus.NOT_FOUND);
      }

      // Verify ownership
      if (subAccount.userId !== req.user.id) {
        throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
      }

      return {
        success: true,
        data: subAccount,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Error fetching sub-account',
        error: error.message,
      });
      throw new HttpException(
        'Failed to fetch sub-account',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Update sub-account
   * PATCH /ghl/sub-accounts/:id
   */
  @Patch(':id')
  async updateSubAccount(
    @Param('id') id: string,
    @Body() data: Partial<CreateSubAccountDto>,
    @Request() req,
  ) {
    try {
      // Verify ownership
      const subAccount = await this.subAccountService.getSubAccountById(id);

      if (!subAccount) {
        throw new HttpException('Sub-account not found', HttpStatus.NOT_FOUND);
      }

      if (subAccount.userId !== req.user.id) {
        throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
      }

      const updated = await this.subAccountService.updateSubAccount(id, {
        ...(data.businessName && { businessName: data.businessName }),
        ...(data.businessEmail && { businessEmail: data.businessEmail }),
        ...(data.businessPhone && { businessPhone: data.businessPhone }),
        ...(data.businessAddress && { businessAddress: data.businessAddress }),
        ...(data.businessWebsite && { businessWebsite: data.businessWebsite }),
        ...(data.timezone && { timezone: data.timezone }),
        ...(data.industry && { industry: data.industry }),
      });

      return {
        success: true,
        data: updated,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Error updating sub-account',
        error: error.message,
      });
      throw new HttpException(
        'Failed to update sub-account',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Update setup step
   * PATCH /ghl/sub-accounts/:id/setup-step
   */
  @Patch(':id/setup-step')
  async updateSetupStep(
    @Param('id') id: string,
    @Body() data: { setupStep: number; completed?: boolean },
    @Request() req,
  ) {
    try {
      // Verify ownership
      const subAccount = await this.subAccountService.getSubAccountById(id);

      if (!subAccount) {
        throw new HttpException('Sub-account not found', HttpStatus.NOT_FOUND);
      }

      if (subAccount.userId !== req.user.id) {
        throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
      }

      const updated = await this.subAccountService.updateSetupStep(
        id,
        data.setupStep,
        data.completed || false,
      );

      return {
        success: true,
        data: updated,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Error updating setup step',
        error: error.message,
      });
      throw new HttpException(
        'Failed to update setup step',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Suspend sub-account
   * POST /ghl/sub-accounts/:id/suspend
   */
  @Post(':id/suspend')
  async suspendSubAccount(@Param('id') id: string, @Request() req) {
    try {
      // Verify ownership
      const subAccount = await this.subAccountService.getSubAccountById(id);

      if (!subAccount) {
        throw new HttpException('Sub-account not found', HttpStatus.NOT_FOUND);
      }

      if (subAccount.userId !== req.user.id) {
        throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
      }

      const updated = await this.subAccountService.suspendSubAccount(id);

      return {
        success: true,
        data: updated,
        message: 'Sub-account suspended successfully',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Error suspending sub-account',
        error: error.message,
      });
      throw new HttpException(
        'Failed to suspend sub-account',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Reactivate sub-account
   * POST /ghl/sub-accounts/:id/reactivate
   */
  @Post(':id/reactivate')
  async reactivateSubAccount(@Param('id') id: string, @Request() req) {
    try {
      // Verify ownership
      const subAccount = await this.subAccountService.getSubAccountById(id);

      if (!subAccount) {
        throw new HttpException('Sub-account not found', HttpStatus.NOT_FOUND);
      }

      if (subAccount.userId !== req.user.id) {
        throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
      }

      const updated = await this.subAccountService.reactivateSubAccount(id);

      return {
        success: true,
        data: updated,
        message: 'Sub-account reactivated successfully',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Error reactivating sub-account',
        error: error.message,
      });
      throw new HttpException(
        'Failed to reactivate sub-account',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Delete sub-account (soft delete)
   * DELETE /ghl/sub-accounts/:id
   */
  @Delete(':id')
  async deleteSubAccount(@Param('id') id: string, @Request() req) {
    try {
      // Verify ownership
      const subAccount = await this.subAccountService.getSubAccountById(id);

      if (!subAccount) {
        throw new HttpException('Sub-account not found', HttpStatus.NOT_FOUND);
      }

      if (subAccount.userId !== req.user.id) {
        throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
      }

      const deleted = await this.subAccountService.deleteSubAccount(id);

      return {
        success: true,
        data: deleted,
        message: 'Sub-account deleted successfully',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Error deleting sub-account',
        error: error.message,
      });
      throw new HttpException(
        'Failed to delete sub-account',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Sync sub-account from GHL
   * POST /ghl/sub-accounts/:id/sync
   */
  @Post(':id/sync')
  async syncSubAccount(@Param('id') id: string, @Request() req) {
    try {
      // Verify ownership
      const subAccount = await this.subAccountService.getSubAccountById(id);

      if (!subAccount) {
        throw new HttpException('Sub-account not found', HttpStatus.NOT_FOUND);
      }

      if (subAccount.userId !== req.user.id) {
        throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
      }

      const synced = await this.subAccountService.syncSubAccountFromGhl(
        subAccount.ghlLocationId,
      );

      if (!synced) {
        throw new HttpException(
          'Failed to sync from GHL',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return {
        success: true,
        data: synced,
        message: 'Sub-account synced successfully',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Error syncing sub-account',
        error: error.message,
      });
      throw new HttpException(
        'Failed to sync sub-account',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * List all sub-accounts for current user
   * GET /ghl/sub-accounts
   */
  @Get()
  async listSubAccounts(@Request() req) {
    try {
      const subAccounts = await this.subAccountService.listUserSubAccounts(
        req.user.id,
      );

      return {
        success: true,
        data: subAccounts,
        count: subAccounts.length,
      };
    } catch (error) {
      this.logger.error({
        message: 'Error listing sub-accounts',
        error: error.message,
      });
      throw new HttpException(
        'Failed to list sub-accounts',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}


