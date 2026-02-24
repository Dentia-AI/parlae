import type { Config } from 'jest';
import nextJest from 'next/jest';

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
});

// Custom Jest configuration
const customJestConfig: Config = {
  displayName: 'web',
  // Use node environment for API route tests, jsdom for component tests
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  roots: ['<rootDir>', '<rootDir>/../../packages/shared'],
  testMatch: [
    '<rootDir>/**/__tests__/**/*.test.[jt]s?(x)',
    '<rootDir>/**/?(*.)+(spec|test).[jt]s?(x)',
    '<rootDir>/../../packages/shared/**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  moduleNameMapper: {
    '^~/(.*)$': '<rootDir>/$1',
    '^@/(.*)$': '<rootDir>/$1',
    '^@kit/next/routes$': '<rootDir>/__mocks__/@kit/next-routes.ts',
    '^.*packages/next/routes.*$': '<rootDir>/__mocks__/@kit/next-routes.ts',
    '^@kit/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
    '^@kit/prisma$': '<rootDir>/__mocks__/@kit/prisma.ts',
    '^@kit/prisma/(.*)$': '<rootDir>/__mocks__/@kit/prisma.ts',
    '^.*packages/prisma/src.*$': '<rootDir>/__mocks__/@kit/prisma.ts',
    '^@kit/(?!prisma$|next/routes$)(.*)$': '<rootDir>/../../packages/$1/src',
  },
  collectCoverageFrom: [
    'app/api/**/*.{js,jsx,ts,tsx}',
    'lib/api/**/*.{js,jsx,ts,tsx}',
  ],
  moduleDirectories: ['node_modules', '<rootDir>'],
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$))',
  ],
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
};

// Export the config
export default createJestConfig(customJestConfig);
