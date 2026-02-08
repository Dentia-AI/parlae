import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    service = module.get<HealthService>(HealthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStatus', () => {
    it('should return health status from service', () => {
      const expectedResult = {
        status: 'ok',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      jest.spyOn(service, 'getStatus').mockReturnValue(expectedResult);

      const result = controller.getStatus();

      expect(result).toEqual(expectedResult);
      expect(service.getStatus).toHaveBeenCalledTimes(1);
    });

    it('should call service.getStatus', () => {
      const spy = jest.spyOn(service, 'getStatus');

      controller.getStatus();

      expect(spy).toHaveBeenCalled();
    });
  });
});

