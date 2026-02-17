import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// Use consistent UUIDs for test data so they're predictable
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const ADMIN_USER_ID = '550e8400-e29b-41d4-a716-446655440002';

async function main() {
  console.log('🌱 Seeding database...');

  // Create roles if they don't exist
  await prisma.role.upsert({
    where: { name: 'owner' },
    update: {},
    create: {
      name: 'owner',
      hierarchyLevel: 3,
    },
  });

  await prisma.role.upsert({
    where: { name: 'member' },
    update: {},
    create: {
      name: 'member',
      hierarchyLevel: 1,
    },
  });

  console.log('✅ Ensured roles exist');

  // Create test user
  const testUser = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {
      id: TEST_USER_ID,
      displayName: 'Test User',
      role: 'ACCOUNT_MANAGER',
    },
    create: {
      id: TEST_USER_ID,
      email: 'test@example.com',
      displayName: 'Test User',
      role: 'ACCOUNT_MANAGER',
    },
  });

  console.log('✅ Created test user:', testUser.email);

  // Create a test account for the user
  const testAccount = await prisma.account.upsert({
    where: { slug: 'test-account' },
    update: {},
    create: {
      name: 'Test Account',
      slug: 'test-account',
      primaryOwnerId: testUser.id,
      pictureUrl: null,
    },
  });

  console.log('✅ Created test account:', testAccount.name);

  // Create account membership
  await prisma.accountMembership.upsert({
    where: {
      accountId_userId: {
        accountId: testAccount.id,
        userId: testUser.id,
      },
    },
    update: {},
    create: {
      accountId: testAccount.id,
      userId: testUser.id,
      roleName: 'owner',
    },
  });

  console.log('✅ Created account membership');

  // Create admin user (optional)
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {
      id: ADMIN_USER_ID,
      displayName: 'Admin User',
      role: 'SUPER_ADMIN',
    },
    create: {
      id: ADMIN_USER_ID,
      email: 'admin@example.com',
      displayName: 'Admin User',
      role: 'SUPER_ADMIN',
    },
  });

  console.log('✅ Created admin user:', adminUser.email);

  // Create admin account
  const adminAccount = await prisma.account.upsert({
    where: { slug: 'admin-account' },
    update: {},
    create: {
      name: 'Admin Account',
      slug: 'admin-account',
      primaryOwnerId: adminUser.id,
      pictureUrl: null,
    },
  });

  console.log('✅ Created admin account:', adminAccount.name);

  // Create admin account membership
  await prisma.accountMembership.upsert({
    where: {
      accountId_userId: {
        accountId: adminAccount.id,
        userId: adminUser.id,
      },
    },
    update: {},
    create: {
      accountId: adminAccount.id,
      userId: adminUser.id,
      roleName: 'owner',
    },
  });

  console.log('✅ Created admin account membership');

  // Ensure platform pricing defaults exist (single-row config table)
  const existingPricing = await prisma.platformPricing.findFirst();
  if (!existingPricing) {
    await prisma.platformPricing.create({
      data: {
        twilioInboundPerMin: 0.0085,
        twilioOutboundPerMin: 0.014,
        serverCostPerMin: 0.005,
        markupPercent: 30.0,
      },
    });
    console.log('✅ Created default platform pricing config');
  } else {
    console.log('✅ Platform pricing config already exists');
  }

  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📝 Test Credentials:');
  console.log('   Email: test@example.com');
  console.log('   Password: Thereis1');
  console.log('\n📝 Admin Credentials:');
  console.log('   Email: admin@example.com');
  console.log('   Password: Thereis1');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
