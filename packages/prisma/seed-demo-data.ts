/**
 * Seed demo data for local development.
 *
 * Seeds data for BOTH the Admin User and the Test User accounts:
 *   - AI Activity Log entries
 *   - CallReference thin records
 *   - Outbound Settings / Campaigns / Contacts
 *
 * HIPAA note:  CampaignContact rows store only PMS patient IDs (patientId)
 * and an optional phone number.  No patient names, emails, or other PHI
 * are persisted — the UI resolves display data from PMS at render time.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx packages/prisma/seed-demo-data.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ACCOUNTS = [
  { id: 'ca5ecdfd-78ac-4b20-a9ff-ddfa40cbea96', label: 'Admin User (Pearl Clinic)' },
  { id: 'c7f9507d-e693-424a-9654-b630e9d0a61e', label: 'Test User' },
];

const BUSINESS_NAME = 'Pearl Clinic';
const PROVIDERS = ['Dr. Sarah Chen', 'Dr. James Park', 'Dr. Lisa Nguyen', 'Dr. Michael Brown'];
const APPOINTMENT_TYPES = ['Cleaning', 'Consultation', 'Root Canal', 'Crown Fitting', 'Filling', 'Whitening', 'Checkup', 'Emergency'];

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

async function seedForAccount(accountId: string, label: string) {
  console.log(`\n── Seeding for ${label} (${accountId}) ──\n`);

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    console.warn(`   ⚠ Account ${accountId} not found — skipping.`);
    return;
  }

  const CALL_IDS = Array.from({ length: 30 }, (_, i) => `demo-call-${accountId.slice(0, 8)}-${String(i + 1).padStart(3, '0')}`);

  // ── 1. Mark account as setup-complete ──────────────────────────────────
  console.log('   1. Updating account setup...');

  const existingSettings = (account.phoneIntegrationSettings as any) ?? {};

  await prisma.account.update({
    where: { id: accountId },
    data: {
      phoneIntegrationMethod: 'forwarded',
      brandingBusinessName: account.name || BUSINESS_NAME,
      paymentMethodVerified: true,
      paymentMethodVerifiedAt: new Date(),
      featureSettings: {
        'ai-receptionist': true,
        'inbound-calls': true,
        'sms-confirmations': true,
        'email-confirmations': true,
        'outbound-calls': true,
      },
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
  console.log('      ✅ Account marked as deployed');

  // ── 2. Seed AI Action Log entries ──────────────────────────────────────
  console.log('   2. Inserting AI Activity Log entries...');

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
      accountId,
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

  await prisma.aiActionLog.deleteMany({ where: { accountId } });
  for (const entry of aiActions) {
    await prisma.aiActionLog.create({ data: entry });
  }
  console.log(`      ✅ Inserted ${aiActions.length} AI activity log entries`);

  // ── 3. Seed CallReference entries ──────────────────────────────────────
  console.log('   3. Inserting CallReference entries...');

  await prisma.callReference.deleteMany({ where: { accountId } });
  for (let i = 0; i < 20; i++) {
    await prisma.callReference.create({
      data: {
        accountId,
        callId: CALL_IDS[i] || `demo-call-extra-${i}`,
        provider: 'RETELL',
        createdAt: randomDate(14),
      },
    });
  }
  console.log('      ✅ Inserted 20 call references');

  // ── 4. Seed Outbound Settings ──────────────────────────────────────────
  console.log('   4. Upserting outbound settings...');

  await prisma.outboundSettings.upsert({
    where: { accountId },
    update: {
      patientCareEnabled: true,
      financialEnabled: true,
    },
    create: {
      accountId,
      patientCareEnabled: true,
      financialEnabled: true,
      callingWindowStart: '09:00',
      callingWindowEnd: '17:00',
      timezone: 'America/New_York',
      maxConcurrentCalls: 2,
      leaveVoicemail: true,
      maxRetries: 3,
      retryDelayMinutes: 120,
    },
  });
  console.log('      ✅ Outbound settings enabled');

  // ── 5. Seed Outbound Campaigns + Contacts (HIPAA-safe) ─────────────────
  console.log('   5. Inserting outbound campaigns and contacts...');

  const existingCampaigns = await prisma.outboundCampaign.findMany({
    where: { accountId },
    select: { id: true },
  });
  for (const c of existingCampaigns) {
    await prisma.campaignContact.deleteMany({ where: { campaignId: c.id } });
  }
  await prisma.outboundCampaign.deleteMany({ where: { accountId } });

  const campaignDefs = [
    { name: 'March Recall Campaign', callType: 'RECALL' as const, channel: 'PHONE' as const, status: 'ACTIVE' as const, totalContacts: 32, completed: 18, successful: 11, auto: true, daysAgo: 5 },
    { name: 'Overdue Hygiene Reactivation', callType: 'REACTIVATION' as const, channel: 'PHONE' as const, status: 'ACTIVE' as const, totalContacts: 20, completed: 8, successful: 4, auto: true, daysAgo: 3 },
    { name: 'Tomorrow Appt Reminder', callType: 'REMINDER' as const, channel: 'SMS' as const, status: 'ACTIVE' as const, totalContacts: 14, completed: 14, successful: 13, auto: true, daysAgo: 1 },
    { name: 'Treatment Plan Follow-up', callType: 'TREATMENT_PLAN' as const, channel: 'PHONE' as const, status: 'COMPLETED' as const, totalContacts: 18, completed: 18, successful: 8, auto: true, daysAgo: 10 },
    { name: 'Post-Op Check-in (Feb)', callType: 'POSTOP' as const, channel: 'PHONE' as const, status: 'COMPLETED' as const, totalContacts: 10, completed: 10, successful: 9, auto: true, daysAgo: 14 },
    { name: 'No-Show Re-engagement', callType: 'NOSHOW' as const, channel: 'PHONE' as const, status: 'PAUSED' as const, totalContacts: 12, completed: 5, successful: 2, auto: true, daysAgo: 8 },
    { name: 'New Patient Welcome Calls', callType: 'WELCOME' as const, channel: 'PHONE' as const, status: 'ACTIVE' as const, totalContacts: 8, completed: 5, successful: 5, auto: false, daysAgo: 2 },
    { name: 'Benefits Expiring March 2026', callType: 'BENEFITS' as const, channel: 'PHONE' as const, status: 'ACTIVE' as const, totalContacts: 24, completed: 10, successful: 7, auto: true, daysAgo: 7 },
    { name: 'Outstanding Balances Q1', callType: 'PAYMENT' as const, channel: 'PHONE' as const, status: 'PAUSED' as const, totalContacts: 15, completed: 6, successful: 3, auto: false, daysAgo: 12 },
  ];

  const positiveOutcomes = ['booked', 'confirmed', 'scheduled', 'paid', 'interested'];
  const negativeOutcomes = ['declined', 'voicemail_left', 'callback_requested'];

  let totalCampaignsInserted = 0;
  let totalContactsInserted = 0;

  for (const def of campaignDefs) {
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - def.daysAgo);

    const campaign = await prisma.outboundCampaign.create({
      data: {
        accountId,
        name: def.name,
        callType: def.callType,
        channel: def.channel,
        status: def.status,
        isAutoGenerated: def.auto,
        totalContacts: def.totalContacts,
        completedCount: def.completed,
        successfulCount: def.successful,
        callingWindowStart: '09:00',
        callingWindowEnd: '17:00',
        timezone: 'America/New_York',
        createdAt,
      },
    });
    totalCampaignsInserted++;

    const failStatuses = ['FAILED', 'NO_ANSWER', 'VOICEMAIL', 'BUSY'] as const;

    for (let i = 0; i < def.totalContacts; i++) {
      const pmsPatientId = `pms-patient-${randomInt(10000, 99999)}`;
      const isCompleted = i < def.completed;
      const isSuccessful = i < def.successful;

      let status: string = 'QUEUED';
      let outcome: string | null = null;
      let attempts = 0;

      if (isCompleted) {
        status = 'COMPLETED';
        outcome = isSuccessful
          ? randomItem(positiveOutcomes)
          : randomItem(negativeOutcomes);
        attempts = randomInt(1, 3);
      } else if (i < def.completed + Math.floor((def.totalContacts - def.completed) * 0.5)) {
        status = randomItem([...failStatuses]);
        attempts = randomInt(1, 3);
      }

      await prisma.campaignContact.create({
        data: {
          campaignId: campaign.id,
          patientId: pmsPatientId,
          phoneNumber: `+1555${String(randomInt(1000000, 9999999))}`,
          status: status as any,
          outcome,
          attempts,
          completedAt: isCompleted ? randomDate(def.daysAgo) : null,
        },
      });
      totalContactsInserted++;
    }
  }

  console.log(`      ✅ Inserted ${totalCampaignsInserted} campaigns with ${totalContactsInserted} contacts`);

  // ── 6. Seed DNC list (phone numbers only — no PHI) ─────────────────────
  console.log('   6. Seeding Do Not Call entries...');

  await prisma.doNotCallEntry.deleteMany({ where: { accountId } });
  const dncPhones = [
    '+15559990001', '+15559990002', '+15559990003',
    '+15559990004', '+15559990005',
  ];
  const dncReasons = ['patient_requested', 'wrong_number', 'patient_requested', 'auto_detected', 'wrong_number'];

  for (let i = 0; i < dncPhones.length; i++) {
    await prisma.doNotCallEntry.create({
      data: {
        accountId,
        phoneNumber: dncPhones[i]!,
        reason: dncReasons[i],
        source: i < 3 ? 'manual' : 'call_analysis',
      },
    });
  }
  console.log(`      ✅ Inserted ${dncPhones.length} DNC entries`);
}

async function main() {
  console.log('=== Seeding demo data ===');

  for (const acct of ACCOUNTS) {
    await seedForAccount(acct.id, acct.label);
  }

  console.log('\n=== Done! You can now visit the dashboard at /home ===');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
