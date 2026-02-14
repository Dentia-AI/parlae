# Twilio Messaging Service - Programmatic Creation Guide

**Updated:** February 14, 2026

## Overview

This guide explains how to automatically create Twilio Messaging Services for each user when they purchase a phone number. This enables SMS sending without specifying a "from" number and provides better deliverability.

## Why Use Messaging Services?

### Benefits:
1. **No need to specify "from" number** - Service manages phone number pool
2. **Better deliverability** - Twilio routes through optimal numbers
3. **Automatic scaling** - Handles throughput limits across multiple numbers
4. **Easier compliance** - Simplifies 10DLC and A2P registration
5. **Multi-number support** - Add multiple numbers to one service

### Alternative: Simple "from" Number
You can also send SMS with just a phone number:
```typescript
await twilioClient.messages.create({
  from: '+15551234567',
  to: recipientNumber,
  body: 'Message text'
});
```

But Messaging Services are better for production use.

---

## Architecture

### Database Schema

The `VapiPhoneNumber` model now includes Twilio fields:

```prisma
model VapiPhoneNumber {
  id        String @id @default(uuid())
  accountId String @map("account_id")

  // Vapi Phone Info
  vapiPhoneId String @unique @map("vapi_phone_id")
  phoneNumber String @unique @map("phone_number")

  // Vapi Configuration
  vapiAssistantId String? @map("vapi_assistant_id")
  vapiSquadId     String? @map("vapi_squad_id")

  // Twilio Integration (NEW)
  twilioPhoneNumberSid       String? @map("twilio_phone_number_sid")      // PN...
  twilioMessagingServiceSid  String? @map("twilio_messaging_service_sid") // MG...

  // ... other fields
}
```

### Backend Service

New service: `TwilioMessagingService` (`apps/backend/src/twilio/twilio-messaging.service.ts`)

---

## Implementation

### 1. Update Phone Number Purchase Flow

When a user buys a phone number, automatically create a Messaging Service:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TwilioMessagingService } from '../twilio/twilio-messaging.service';

@Injectable()
export class PhoneNumberService {
  constructor(
    private prisma: PrismaService,
    private twilioMessaging: TwilioMessagingService,
  ) {}

  async purchasePhoneNumberForAccount(options: {
    accountId: string;
    areaCode: string;
  }) {
    // 1. Get account details
    const account = await this.prisma.account.findUnique({
      where: { id: options.accountId },
    });

    // 2. Purchase phone number AND create messaging service
    const result = await this.twilioMessaging.purchasePhoneNumberWithMessagingService({
      accountId: options.accountId,
      accountName: account.name,
      areaCode: options.areaCode,
    });

    // 3. Create Vapi phone number
    const vapiPhone = await this.createVapiPhoneNumber(result.phoneNumber);

    // 4. Store in database with Twilio details
    await this.prisma.vapiPhoneNumber.create({
      data: {
        accountId: options.accountId,
        vapiPhoneId: vapiPhone.id,
        phoneNumber: result.phoneNumber,
        vapiAssistantId: null, // Set later
        twilioPhoneNumberSid: result.phoneNumberSid,
        twilioMessagingServiceSid: result.messagingServiceSid,
        name: 'Main Line',
        isActive: true,
      },
    });

    return {
      phoneNumber: result.phoneNumber,
      messagingServiceSid: result.messagingServiceSid,
    };
  }

  private async createVapiPhoneNumber(phoneNumber: string) {
    // Call Vapi API to create phone number
    // Return { id: 'vapi_phone_id', ... }
  }
}
```

### 2. Sending SMS

Use the Messaging Service SID to send SMS:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TwilioMessagingService } from '../twilio/twilio-messaging.service';

@Injectable()
export class NotificationService {
  constructor(
    private prisma: PrismaService,
    private twilioMessaging: TwilioMessagingService,
  ) {}

  async sendStaffAlert(options: {
    accountId: string;
    to: string;
    message: string;
  }) {
    // Get the phone number record with Messaging Service SID
    const phoneNumber = await this.prisma.vapiPhoneNumber.findFirst({
      where: {
        accountId: options.accountId,
        isActive: true,
      },
    });

    if (!phoneNumber?.twilioMessagingServiceSid) {
      throw new Error('No Messaging Service configured for this account');
    }

    // Send SMS using the Messaging Service
    await this.twilioMessaging.sendSms({
      messagingServiceSid: phoneNumber.twilioMessagingServiceSid,
      to: options.to,
      body: options.message,
    });
  }
}
```

### 3. Update Existing Tool (vapi-tools.service.ts)

Update the staff alert SMS in the call transfer tool:

```typescript
// In vapi-tools.service.ts

async transferCall(...) {
  // ... existing code ...

  // Get the phone number record to find Messaging Service SID
  const phoneRecord = await this.prisma.vapiPhoneNumber.findFirst({
    where: { vapiPhoneId: message.call.phoneNumberId },
    include: { account: true },
  });

  if (phoneRecord?.twilioMessagingServiceSid) {
    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!,
    );

    await twilioClient.messages.create({
      messagingServiceSid: phoneRecord.twilioMessagingServiceSid,
      to: staffForwardNumber,
      body: `URGENT: Call transfer incoming from ${phoneRecord.account?.name}\nReason: ${reason}\nSummary: ${summary}\nPatient: ${patientInfo.name || 'Unknown'}`,
    });
  }
}
```

---

## API Methods

### TwilioMessagingService Methods

#### 1. Create Messaging Service
```typescript
await twilioMessaging.createMessagingService({
  accountId: 'account-uuid',
  accountName: 'Downtown Montreal Dentistry'
});
// Returns: { sid: 'MG...', friendlyName: 'Downtown Montreal Dentistry - Parlae' }
```

#### 2. Add Phone Number to Service
```typescript
await twilioMessaging.addPhoneNumberToService(
  'MG1e67121a354899420623a6574dbbec61', // Messaging Service SID
  'PN1234567890abcdef1234567890abcdef'   // Phone Number SID
);
```

#### 3. Purchase Phone Number with Messaging Service (All-in-One)
```typescript
const result = await twilioMessaging.purchasePhoneNumberWithMessagingService({
  accountId: 'account-uuid',
  accountName: 'Downtown Montreal Dentistry',
  areaCode: '514'
});

console.log(result);
// {
//   phoneNumber: '+15141234567',
//   phoneNumberSid: 'PN...',
//   messagingServiceSid: 'MG...'
// }
```

#### 4. Send SMS
```typescript
await twilioMessaging.sendSms({
  messagingServiceSid: 'MG1e67121a354899420623a6574dbbec61',
  to: '+15141234567',
  body: 'Your appointment is confirmed'
});
```

#### 5. Delete Messaging Service
```typescript
await twilioMessaging.deleteMessagingService('MG1e67121a354899420623a6574dbbec61');
```

#### 6. Release Phone Number
```typescript
await twilioMessaging.releasePhoneNumber('PN1234567890abcdef1234567890abcdef');
```

---

## Database Migration

Run this to add the new fields:

```bash
cd packages/prisma
npx prisma migrate dev --name add_twilio_messaging_service_fields
npx prisma generate
```

---

## Manual Setup (For Existing Accounts)

For accounts that already have phone numbers but no Messaging Service:

```typescript
// Create a migration script
async function migrateExistingPhoneNumbers() {
  const phoneNumbers = await prisma.vapiPhoneNumber.findMany({
    where: {
      twilioMessagingServiceSid: null,
      // twilioPhoneNumberSid is not null (they have Twilio numbers)
    },
    include: { account: true },
  });

  for (const phone of phoneNumbers) {
    try {
      // 1. Create Messaging Service
      const messagingService = await twilioMessaging.createMessagingService({
        accountId: phone.accountId,
        accountName: phone.account.name,
      });

      // 2. Add phone number to service (if we have the Twilio Phone Number SID)
      if (phone.twilioPhoneNumberSid) {
        await twilioMessaging.addPhoneNumberToService(
          messagingService.sid,
          phone.twilioPhoneNumberSid,
        );
      }

      // 3. Update database
      await prisma.vapiPhoneNumber.update({
        where: { id: phone.id },
        data: {
          twilioMessagingServiceSid: messagingService.sid,
        },
      });

      console.log(`✅ Migrated ${phone.phoneNumber}`);
    } catch (error) {
      console.error(`❌ Failed to migrate ${phone.phoneNumber}:`, error);
    }
  }
}
```

---

## Testing

### 1. Test Messaging Service Creation
```bash
curl -X POST http://localhost:4000/test/create-messaging-service \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "your-account-uuid",
    "accountName": "Test Clinic"
  }'
```

### 2. Test SMS Sending
```bash
curl -X POST http://localhost:4000/test/send-sms \
  -H "Content-Type: application/json" \
  -d '{
    "messagingServiceSid": "MG...",
    "to": "+15141234567",
    "body": "Test message"
  }'
```

---

## Troubleshooting

### Error: "Unable to create record: A phone number is required"
- Make sure you've added at least one phone number to the Messaging Service
- Call `addPhoneNumberToService()` after creating the service

### Error: "Phone number is already in use"
- A phone number can only belong to one Messaging Service
- Release it from the old service before adding to a new one

### Error: "Invalid phone number SID"
- Ensure the phone number SID starts with "PN"
- Verify the phone number exists in your Twilio account

---

## Cost Considerations

- **Messaging Service**: Free to create
- **Phone Numbers**: ~$1-2/month per number
- **SMS**: $0.0075 per segment (160 characters)
- **MMS**: $0.02 per message

---

## Future Enhancements

1. **Multi-number pools**: Add multiple phone numbers to one service for better throughput
2. **A2P 10DLC Registration**: Auto-register brands and campaigns for compliance
3. **Rate limiting**: Track and manage SMS usage per account
4. **Fallback numbers**: Automatic fallback if primary number is unavailable
5. **Smart routing**: Geo-based routing for better deliverability

---

## References

- [Twilio Messaging Services API](https://www.twilio.com/docs/messaging/services/api)
- [10DLC Registration Guide](https://www.twilio.com/docs/messaging/10dlc)
- [Twilio Best Practices](https://www.twilio.com/docs/messaging/best-practices)
