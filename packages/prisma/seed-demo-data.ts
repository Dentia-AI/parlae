/**
 * Seed demo data for local development.
 *
 * Marks the Admin User account as fully deployed with Retell Conversation Flow
 * and inserts realistic dummy data for the dashboard, call logs, and AI activity log.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx packages/prisma/seed-demo-data.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ACCOUNT_ID = 'ca5ecdfd-78ac-4b20-a9ff-ddfa40cbea96';
const BUSINESS_NAME = 'Pearl Clinic';

const PROVIDERS = ['Dr. Sarah Chen', 'Dr. James Park', 'Dr. Lisa Nguyen', 'Dr. Michael Brown'];
const APPOINTMENT_TYPES = ['Cleaning', 'Consultation', 'Root Canal', 'Crown Fitting', 'Filling', 'Whitening', 'Checkup', 'Emergency'];
const CALL_IDS = Array.from({ length: 30 }, (_, i) => `demo-call-${String(i + 1).padStart(3, '0')}`);

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysBack: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - Math.random() * daysBack);
  d.setHours(randomInt(8, 17), randomInt(0, 59), 0, 0);
  return d;
}

function futureDate(daysAhead: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + randomInt(1, daysAhead));
  d.setHours(randomInt(9, 16), randomItem([0, 15, 30, 45]), 0, 0);
  return d;
}

async function main() {
  console.log('=== Seeding demo data ===\n');

  // ── 1. Mark account as setup-complete with Retell Conversation Flow ─────
  console.log('1. Updating account to look like Retell is deployed...');

  const account = await prisma.account.findUnique({ where: { id: ACCOUNT_ID } });
  if (!account) {
    console.error(`Account ${ACCOUNT_ID} not found. Run the app first to create it.`);
    process.exit(1);
  }

  const existingSettings = (account.phoneIntegrationSettings as any) ?? {};

  await prisma.account.update({
    where: { id: ACCOUNT_ID },
    data: {
      phoneIntegrationMethod: 'forwarded',
      brandingBusinessName: BUSINESS_NAME,
      phoneIntegrationSettings: {
        ...existingSettings,
        phoneNumber: '+15145551234',
        deployType: 'conversation_flow',
        retellReceptionistAgentId: 'agent_demo_placeholder',
        conversationFlowId: 'flow_demo_placeholder',
        deploymentStatus: 'completed',
        deploymentError: null,
        voiceConfig: {
          id: 'retell-Chloe',
          name: 'Chloe',
          accent: 'American',
          gender: 'female',
          voiceId: 'retell-Chloe',
          provider: 'retell',
          previewUrl: '/audio/voices/retell-chloe.mp3',
          description: 'Warm and professional',
        },
      },
    },
  });
  console.log('   ✅ Account marked as deployed with Retell Conversation Flow\n');

  // ── 2. Seed AI Action Log entries ───────────────────────────────────────
  console.log('2. Inserting AI Activity Log entries...');

  const aiActions: Parameters<typeof prisma.aiActionLog.create>[0]['data'][] = [];

  for (let i = 0; i < 25; i++) {
    const source = Math.random() > 0.3 ? 'gcal' : 'pms';
    const provider = randomItem(PROVIDERS);
    const apptType = randomItem(APPOINTMENT_TYPES);
    const duration = randomItem([15, 30, 45, 60]);
    const apptTime = futureDate(14);
    const createdAt = randomDate(14);
    const success = Math.random() > 0.1;
    const callId = randomItem(CALL_IDS);

    const actions = [
      {
        action: 'book_appointment',
        category: 'appointment',
        summary: `Booked ${apptType}, ${duration} min with ${provider}`,
        externalResourceType: source === 'gcal' ? 'event' : 'appointment',
      },
      {
        action: 'cancel_appointment',
        category: 'appointment',
        summary: `Cancelled ${apptType} appointment with ${provider}`,
        externalResourceType: source === 'gcal' ? 'event' : 'appointment',
      },
      {
        action: 'reschedule_appointment',
        category: 'appointment',
        summary: `Rescheduled ${apptType} from earlier date to new time with ${provider}`,
        externalResourceType: source === 'gcal' ? 'event' : 'appointment',
      },
      {
        action: 'create_patient',
        category: 'patient',
        summary: `Created new patient record in PMS`,
        externalResourceType: 'patient',
      },
    ];

    const weights = [0.55, 0.15, 0.15, 0.15];
    const roll = Math.random();
    let cumulative = 0;
    let picked = actions[0]!;
    for (let j = 0; j < weights.length; j++) {
      cumulative += weights[j]!;
      if (roll < cumulative) {
        picked = actions[j]!;
        break;
      }
    }

    aiActions.push({
      accountId: ACCOUNT_ID,
      source,
      action: picked.action,
      category: picked.category,
      callId,
      externalResourceId: `ext-${randomInt(10000, 99999)}`,
      externalResourceType: picked.externalResourceType,
      appointmentTime: picked.category === 'appointment' ? apptTime.toISOString() : null,
      appointmentType: picked.category === 'appointment' ? apptType : null,
      providerName: picked.category === 'appointment' ? provider : null,
      duration: picked.category === 'appointment' ? duration : null,
      summary: picked.summary,
      success,
      status: success ? 'completed' : 'failed',
      errorMessage: success ? null : 'PMS connection timeout — retry scheduled',
      pmsProvider: source === 'pms' ? 'sikka' : null,
      calendarEventId: source === 'gcal' ? `gcal-evt-${randomInt(1000, 9999)}` : null,
      createdAt,
    });
  }

  await prisma.aiActionLog.deleteMany({ where: { accountId: ACCOUNT_ID } });
  for (const entry of aiActions) {
    await prisma.aiActionLog.create({ data: entry });
  }
  console.log(`   ✅ Inserted ${aiActions.length} AI activity log entries\n`);

  // ── 3. Seed CallReference entries (thin records — call details come from Retell API) ──
  console.log('3. Inserting CallReference entries...');

  await prisma.callReference.deleteMany({ where: { accountId: ACCOUNT_ID } });
  for (let i = 0; i < 20; i++) {
    await prisma.callReference.create({
      data: {
        accountId: ACCOUNT_ID,
        callId: CALL_IDS[i] || `demo-call-extra-${i}`,
        provider: 'RETELL',
        createdAt: randomDate(14),
      },
    });
  }
  console.log(`   ✅ Inserted 20 call references\n`);

  // Note: The dashboard and call logs pages fetch actual call details from
  // the Retell API using these call IDs. Since these are demo IDs, the
  // Retell API won't return data for them, but the dashboard has a built-in
  // mock data generator that kicks in when no real data is available
  // (NODE_ENV=development). The AI Activity Log page reads from the DB
  // directly, so those entries will show real data.

  console.log('=== Done! You can now visit the dashboard at /home ===');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
