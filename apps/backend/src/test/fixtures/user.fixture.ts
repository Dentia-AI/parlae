import type { User, Account, Role, UserRole } from '@kit/prisma';

export const createMockUser = (overrides?: Partial<User>): User => ({
  id: 'test-user-id',
  email: 'test@example.com',
  displayName: 'Test User',
  avatarUrl: null,
  cognitoUsername: 'testuser',
  role: 'ACCOUNT_MANAGER' as UserRole,
  createdById: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const createMockAccount = (overrides?: Partial<Account>): Account => ({
  id: 'test-account-id',
  name: 'Test Account',
  slug: 'test-account',
  email: null,
  pictureUrl: null,
  isPersonalAccount: false,
  publicData: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  createdBy: null,
  updatedBy: null,
  primaryOwnerId: 'test-user-id',
  phoneIntegrationMethod: 'none',
  phoneIntegrationSettings: {},
  advancedSetupEnabled: false,
  agentTemplateId: null,
  setupProgress: {},
  setupCompletedAt: null,
  setupLastStep: null,
  googleCalendarConnected: false,
  googleCalendarAccessToken: null,
  googleCalendarRefreshToken: null,
  googleCalendarTokenExpiry: null,
  googleCalendarId: null,
  googleCalendarEmail: null,
  stripePaymentMethodId: null,
  paymentMethodVerified: false,
  paymentMethodVerifiedAt: null,
  ...overrides,
});

export const createMockRole = (overrides?: Partial<Role>): Role => ({
  name: 'member',
  hierarchyLevel: 0,
  ...overrides,
});

