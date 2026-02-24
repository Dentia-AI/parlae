import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GhlPhoneController } from './ghl-phone.controller';
import { GhlPhoneService } from '../services/ghl-phone.service';
import { DevAuthGuard } from '../../auth/dev-auth.guard';
import { CognitoJwtVerifierService } from '../../auth/cognito-jwt-verifier.service';

describe('GhlPhoneController', () => {
  let controller: GhlPhoneController;
  let service: any;

  beforeEach(async () => {
    const mockService = {
      getAvailablePhoneNumbers: jest.fn().mockResolvedValue([
        { number: '+15551234567', state: 'CA' },
      ]),
      searchByAreaCode: jest.fn().mockResolvedValue([{ number: '+15551234567' }]),
      searchByState: jest.fn().mockResolvedValue([{ number: '+15551234567', state: 'CA' }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GhlPhoneController],
      providers: [
        { provide: GhlPhoneService, useValue: mockService },
        DevAuthGuard,
        { provide: CognitoJwtVerifierService, useValue: { verifyToken: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<GhlPhoneController>(GhlPhoneController);
    service = module.get(GhlPhoneService);
  });

  it('should be defined', () => { expect(controller).toBeDefined(); });

  describe('getAvailablePhoneNumbers', () => {
    it('should return phone numbers', async () => {
      const result = await controller.getAvailablePhoneNumbers();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.count).toBe(1);
    });

    it('should pass query params', async () => {
      await controller.getAvailablePhoneNumbers('555', 'CA');
      expect(service.getAvailablePhoneNumbers).toHaveBeenCalledWith('555', 'CA');
    });

    it('should throw on service error', async () => {
      service.getAvailablePhoneNumbers.mockRejectedValue(new Error('fail'));
      await expect(controller.getAvailablePhoneNumbers()).rejects.toThrow(HttpException);
    });
  });

  describe('searchByAreaCode', () => {
    it('should return results for area code', async () => {
      const result = await controller.searchByAreaCode('555');
      expect(result.success).toBe(true);
      expect(service.searchByAreaCode).toHaveBeenCalledWith('555');
    });

    it('should throw when area code missing', async () => {
      await expect(controller.searchByAreaCode(undefined as any)).rejects.toThrow(HttpException);
    });
  });

  describe('searchByState', () => {
    it('should return results for state', async () => {
      const result = await controller.searchByState('CA');
      expect(result.success).toBe(true);
      expect(service.searchByState).toHaveBeenCalledWith('CA');
    });

    it('should throw when state missing', async () => {
      await expect(controller.searchByState(undefined as any)).rejects.toThrow(HttpException);
    });
  });
});
