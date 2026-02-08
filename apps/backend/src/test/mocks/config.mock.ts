export const createMockConfigService = (overrides: Record<string, any> = {}) => {
  const defaultConfig = {
    COGNITO_USER_POOL_ID: 'us-east-1_test123',
    COGNITO_CLIENT_ID: 'test-client-id',
    AWS_REGION: 'us-east-1',
    COGNITO_ISSUER: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test123',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    NODE_ENV: 'test',
    ...overrides,
  };

  return {
    get: jest.fn((key: string) => defaultConfig[key]),
    getOrThrow: jest.fn((key: string) => {
      const value = defaultConfig[key];
      if (value === undefined) {
        throw new Error(`Configuration key "${key}" does not exist`);
      }
      return value;
    }),
  };
};

