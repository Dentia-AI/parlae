export const createMockSecretsService = () => ({
  getPracticeCredentials: jest.fn().mockResolvedValue(null),
  storePracticeCredentials: jest.fn().mockResolvedValue('arn:aws:secretsmanager:test'),
  updatePracticeTokens: jest.fn().mockResolvedValue(undefined),
  invalidateCache: jest.fn(),
});
