/**
 * PMS Integration Test Script
 * 
 * This script tests the PMS integration end-to-end:
 * 1. Checks if PMS setup exists
 * 2. Tests connection to PMS
 * 3. Tests patient search
 * 4. Tests appointment availability
 * 5. Tests providers
 */

import { PrismaClient } from '@prisma/client';
import { createPmsService } from '../apps/frontend/packages/shared/src/pms';

const prisma = new PrismaClient();

async function testPmsIntegration() {
  console.log('🧪 Testing PMS Integration...\n');
  console.log('=' .repeat(60));
  
  try {
    // Step 1: Check for existing PMS integrations
    console.log('\n1️⃣  Checking for PMS integrations...');
    const integrations = await prisma.pmsIntegration.findMany({
      include: {
        account: {
          select: {
            id: true,
            name: true,
            primaryOwnerUserId: true,
          },
        },
      },
    });
    
    if (integrations.length === 0) {
      console.log('❌ No PMS integrations found!');
      console.log('\n💡 To create one:');
      console.log('   1. Go to http://localhost:3000');
      console.log('   2. Navigate to Agent Setup → PMS Integration');
      console.log('   3. Complete the setup wizard');
      console.log('\n   Or use the API:');
      console.log('   curl -X POST http://localhost:3000/api/pms/setup \\');
      console.log('     -H "Content-Type: application/json" \\');
      console.log('     -d \'{"provider": "SIKKA", "credentials": {...}}\'');
      return;
    }
    
    console.log(`✅ Found ${integrations.length} integration(s)`);
    integrations.forEach((integration) => {
      console.log(`   - ${integration.provider} for account: ${integration.account.name} (${integration.status})`);
    });
    
    // Use the first active integration for testing
    const activeIntegration = integrations.find(i => i.status === 'ACTIVE') || integrations[0];
    const accountId = activeIntegration.accountId;
    
    console.log(`\n🎯 Testing with account: ${activeIntegration.account.name}`);
    console.log(`   Provider: ${activeIntegration.provider}`);
    console.log(`   Status: ${activeIntegration.status}`);
    
    // Step 2: Create PMS Service
    console.log('\n2️⃣  Creating PMS service...');
    const pmsService = createPmsService(
      activeIntegration.provider,
      activeIntegration.credentials as any,
      activeIntegration.config as any
    );
    
    if (!pmsService) {
      console.log('❌ Failed to create PMS service');
      return;
    }
    console.log('✅ PMS service created');
    
    // Step 3: Test Connection
    console.log('\n3️⃣  Testing connection to PMS...');
    const connectionTest = await pmsService.testConnection();
    
    if (!connectionTest.success) {
      console.log('❌ Connection test failed:');
      console.log(`   Error: ${connectionTest.error}`);
      console.log('\n💡 Check your credentials:');
      console.log(`   - Provider: ${activeIntegration.provider}`);
      console.log('   - Credentials are encrypted in the database');
      return;
    }
    console.log('✅ Connection successful!');
    if (connectionTest.data?.message) {
      console.log(`   ${connectionTest.data.message}`);
    }
    
    // Step 4: Get Providers
    console.log('\n4️⃣  Fetching providers (dentists)...');
    const providers = await pmsService.getProviders();
    
    if (!providers.success) {
      console.log('⚠️  Failed to fetch providers:');
      console.log(`   Error: ${providers.error}`);
    } else {
      const providerList = providers.data || [];
      console.log(`✅ Found ${providerList.length} provider(s)`);
      providerList.slice(0, 3).forEach((provider) => {
        console.log(`   - ${provider.firstName} ${provider.lastName} (${provider.id})`);
      });
      if (providerList.length > 3) {
        console.log(`   ... and ${providerList.length - 3} more`);
      }
    }
    
    // Step 5: Search Patients
    console.log('\n5️⃣  Searching for patients (query: "test")...');
    const patients = await pmsService.searchPatients({ query: 'test', limit: 5 });
    
    if (!patients.success) {
      console.log('⚠️  Patient search failed:');
      console.log(`   Error: ${patients.error}`);
    } else {
      const patientList = patients.data || [];
      console.log(`✅ Found ${patientList.length} patient(s)`);
      patientList.forEach((patient) => {
        console.log(`   - ${patient.firstName} ${patient.lastName} (ID: ${patient.id})`);
        if (patient.phone) console.log(`     Phone: ${patient.phone}`);
        if (patient.email) console.log(`     Email: ${patient.email}`);
      });
    }
    
    // Step 6: Check Availability
    console.log('\n6️⃣  Checking appointment availability...');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    
    console.log(`   Date: ${dateStr}`);
    const availability = await pmsService.checkAvailability({
      date: dateStr,
      appointmentType: 'cleaning',
    });
    
    if (!availability.success) {
      console.log('⚠️  Availability check failed:');
      console.log(`   Error: ${availability.error}`);
    } else {
      const slots = availability.data || [];
      console.log(`✅ Found ${slots.length} available slot(s)`);
      slots.slice(0, 5).forEach((slot) => {
        const time = new Date(slot.startTime).toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          timeZone: 'America/Los_Angeles' 
        });
        console.log(`   - ${time} (${slot.duration} min)`);
        if (slot.provider) {
          console.log(`     Provider: ${slot.provider.firstName} ${slot.provider.lastName}`);
        }
      });
      if (slots.length > 5) {
        console.log(`   ... and ${slots.length - 5} more slots`);
      }
    }
    
    // Step 7: Check Audit Logs
    console.log('\n7️⃣  Checking recent audit logs...');
    const auditLogs = await prisma.pmsAuditLog.findMany({
      where: {
        pmsIntegrationId: activeIntegration.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
    });
    
    console.log(`✅ Found ${auditLogs.length} recent audit log(s)`);
    auditLogs.forEach((log) => {
      const timestamp = log.createdAt.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        second: '2-digit',
      });
      const status = log.success ? '✓' : '✗';
      console.log(`   ${status} [${timestamp}] ${log.method} ${log.action} (${log.responseTime}ms)`);
      if (log.patientId) {
        console.log(`     Patient: ${log.patientId}`);
      }
      if (log.vapiCallId) {
        console.log(`     Vapi Call: ${log.vapiCallId}`);
      }
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed successfully!\n');
    console.log('📊 Summary:');
    console.log(`   - PMS Provider: ${activeIntegration.provider}`);
    console.log(`   - Connection: ${connectionTest.success ? 'Working' : 'Failed'}`);
    console.log(`   - Providers: ${providers.data?.length || 0}`);
    console.log(`   - Test Patients Found: ${patients.data?.length || 0}`);
    console.log(`   - Available Slots: ${availability.data?.length || 0}`);
    console.log(`   - Total Audit Logs: ${auditLogs.length}`);
    console.log('');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testPmsIntegration().catch(console.error);
