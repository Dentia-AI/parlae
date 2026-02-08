import { Session, User } from 'next-auth';

/**
 * Create a mock NextAuth session
 */
export function createMockSession(overrides?: Partial<Session>): Session {
  return {
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      ...overrides?.user,
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

/**
 * Create a mock NextAuth user
 */
export function createMockUser(overrides?: Partial<User>): User {
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    ...overrides,
  };
}

/**
 * Mock the auth function from @kit/shared/auth
 */
export function mockAuth(session: Session | null = createMockSession()) {
  jest.mock('@kit/shared/auth', () => ({
    auth: jest.fn(async () => session),
  }));
}

/**
 * Reset auth mock
 */
export function resetAuthMock() {
  jest.resetModules();
}

