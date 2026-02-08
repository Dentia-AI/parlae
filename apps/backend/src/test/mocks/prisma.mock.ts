import { PrismaClient } from '@kit/prisma';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

// Create a deep mock of PrismaClient
export type MockPrismaClient = DeepMockProxy<PrismaClient>;

export const prismaMock = mockDeep<PrismaClient>() as MockPrismaClient;

// Reset mock between tests
beforeEach(() => {
  mockReset(prismaMock);
});

export const createMockPrismaService = (): MockPrismaClient => {
  return {
    account: prismaMock.account,
    user: prismaMock.user,
    role: prismaMock.role,
    accountMembership: prismaMock.accountMembership,
    rolePermission: prismaMock.rolePermission,
    billingCustomer: prismaMock.billingCustomer,
    config: prismaMock.config,
    invitation: prismaMock.invitation,
    nonce: prismaMock.nonce,
    notification: prismaMock.notification,
    order: prismaMock.order,
    orderItem: prismaMock.orderItem,
    subscription: prismaMock.subscription,
    subscriptionItem: prismaMock.subscriptionItem,
    usageRecord: prismaMock.usageRecord,
    file: prismaMock.file,
    sourceContent: prismaMock.sourceContent,
    adProvider: prismaMock.adProvider,
    ad: prismaMock.ad,
    userTransaction: prismaMock.userTransaction,
    payment: prismaMock.payment,
    refund: prismaMock.refund,
    metaAdCampaign: prismaMock.metaAdCampaign,
    metaAdSet: prismaMock.metaAdSet,
    cognitoTokens: prismaMock.cognitoTokens,
    $transaction: prismaMock.$transaction,
    $queryRaw: prismaMock.$queryRaw,
    $executeRaw: prismaMock.$executeRaw,
  } as MockPrismaClient;
};

