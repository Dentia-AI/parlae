import { Test, TestingModule } from '@nestjs/testing';
import { HipaaAuditService, AuditLogEntry } from './hipaa-audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../test/mocks/prisma.mock';

describe('HipaaAuditService', () => {
  let service: HipaaAuditService;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HipaaAuditService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<HipaaAuditService>(HipaaAuditService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('logAccess', () => {
    const entry: AuditLogEntry = {
      pmsIntegrationId: 'pms-123',
      action: 'lookupPatient',
      endpoint: '/patients/search',
      method: 'GET',
      vapiCallId: 'call-123',
      requestSummary: 'Patient lookup',
      responseStatus: 200,
      responseTime: 150,
      phiAccessed: true,
      phiFields: ['name', 'email'],
    };

    it('should insert audit log via $executeRaw', async () => {
      prisma.$executeRaw.mockResolvedValue(1);
      await service.logAccess(entry);
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('should throw if $executeRaw fails', async () => {
      prisma.$executeRaw.mockRejectedValue(new Error('DB error'));
      await expect(service.logAccess(entry)).rejects.toThrow('DB error');
    });

    it('should handle entry without optional fields', async () => {
      prisma.$executeRaw.mockResolvedValue(1);
      const minimalEntry: AuditLogEntry = {
        pmsIntegrationId: 'pms-123',
        action: 'test',
        endpoint: '/test',
        method: 'GET',
        responseStatus: 200,
        responseTime: 50,
        phiAccessed: false,
      };
      await service.logAccess(minimalEntry);
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });

  describe('getAuditLogs', () => {
    it('should query audit logs with no filters', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      const result = await service.getAuditLogs({});
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should pass pmsIntegrationId filter', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'log-1' }]);
      const result = await service.getAuditLogs({ pmsIntegrationId: 'pms-123' });
      expect(result).toHaveLength(1);
    });

    it('should handle date range filters', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await service.getAuditLogs({
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
      });
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('should handle phiAccessedOnly filter', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await service.getAuditLogs({ phiAccessedOnly: true });
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });
  });
});
