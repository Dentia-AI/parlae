export const createMockHipaaAuditService = () => ({
  logAccess: jest.fn().mockResolvedValue(undefined),
  getAuditLogs: jest.fn().mockResolvedValue([]),
});
