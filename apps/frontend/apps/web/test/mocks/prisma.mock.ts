/**
 * Base mock for @kit/prisma - used by moduleNameMapper so Jest can resolve the module.
 * Individual tests override with jest.mock('@kit/prisma', () => ({ prisma: mockPrisma })).
 */
export const prisma = {
  account: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  user: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
};
