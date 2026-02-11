# Patient Email and SMS Confirmation System

## Overview

This document outlines the best approach for implementing email and SMS confirmations for patients using your existing infrastructure. Parlae already has Twilio for SMS and Resend for email, making implementation straightforward.

## Architecture Overview

```
┌─────────────────────┐
│  Appointment Event  │ (Vapi webhook, PMS sync, Manual schedule)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Notification Service│
│  (Backend/NestJS)   │
└──────────┬──────────┘
           │
    ┌──────┴──────┐
    ▼             ▼
┌────────┐   ┌──────────┐
│ Email  │   │   SMS    │
│(Resend)│   │ (Twilio) │
└────────┘   └──────────┘
```

## Implementation Strategy

### Phase 1: Core Notification Service (Backend)
### Phase 2: Notification Templates
### Phase 3: Appointment Event Triggers
### Phase 4: User Configuration & Preferences

---

## Phase 1: Core Notification Service

### 1.1 Create Notification Service Module

**File**: `apps/backend/src/notifications/notifications.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationController],
  providers: [NotificationService, EmailService, SmsService],
  exports: [NotificationService],
})
export class NotificationModule {}
```

### 1.2 Email Service (Using Resend)

**File**: `apps/backend/src/notifications/email.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey: string;
  private readonly fromEmail: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('RESEND_API_KEY') || '';
    this.fromEmail = this.configService.get<string>('EMAIL_FROM') || 'noreply@parlae.ai';
  }

  async sendEmail({ to, subject, html, from }: SendEmailParams): Promise<boolean> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: from || this.fromEmail,
          to: [to],
          subject,
          html,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Failed to send email: ${error}`);
        return false;
      }

      const result = await response.json();
      this.logger.log(`Email sent successfully: ${result.id}`);
      return true;
    } catch (error) {
      this.logger.error(`Error sending email: ${error}`);
      return false;
    }
  }
}
```

### 1.3 SMS Service (Using Twilio)

**File**: `apps/backend/src/notifications/sms.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

interface SendSmsParams {
  to: string;
  body: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly twilioClient: any;
  private readonly messagingServiceSid: string;

  constructor(private configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.messagingServiceSid = this.configService.get<string>('TWILIO_MESSAGING_SERVICE_SID') || '';

    if (accountSid && authToken) {
      this.twilioClient = twilio(accountSid, authToken);
    }
  }

  async sendSms({ to, body }: SendSmsParams): Promise<boolean> {
    try {
      if (!this.twilioClient) {
        this.logger.error('Twilio client not initialized');
        return false;
      }

      const message = await this.twilioClient.messages.create({
        messagingServiceSid: this.messagingServiceSid,
        to,
        body,
      });

      this.logger.log(`SMS sent successfully: ${message.sid}`);
      return true;
    } catch (error) {
      this.logger.error(`Error sending SMS: ${error}`);
      return false;
    }
  }
}
```

### 1.4 Main Notification Service

**File**: `apps/backend/src/notifications/notification.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';

export interface AppointmentConfirmation {
  patientName: string;
  patientPhone?: string;
  patientEmail?: string;
  appointmentDate: Date;
  appointmentTime: string;
  practicePhone: string;
  practiceName: string;
  providerName?: string;
  appointmentType?: string;
  notes?: string;
}

export interface AppointmentReminder extends AppointmentConfirmation {
  hoursUntilAppointment: number;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private smsService: SmsService,
  ) {}

  /**
   * Send appointment confirmation via email and/or SMS
   */
  async sendAppointmentConfirmation(
    data: AppointmentConfirmation,
    channels: ('email' | 'sms')[] = ['email', 'sms'],
  ): Promise<{ email: boolean; sms: boolean }> {
    const results = { email: false, sms: false };

    // Send Email
    if (channels.includes('email') && data.patientEmail) {
      const emailHtml = this.generateConfirmationEmail(data);
      results.email = await this.emailService.sendEmail({
        to: data.patientEmail,
        subject: `Appointment Confirmation - ${data.practiceName}`,
        html: emailHtml,
      });
    }

    // Send SMS
    if (channels.includes('sms') && data.patientPhone) {
      const smsBody = this.generateConfirmationSms(data);
      results.sms = await this.smsService.sendSms({
        to: data.patientPhone,
        body: smsBody,
      });
    }

    // Log notification in database
    if (results.email || results.sms) {
      await this.logNotification({
        type: 'appointment_confirmation',
        patientName: data.patientName,
        channels: results,
        appointmentDate: data.appointmentDate,
      });
    }

    return results;
  }

  /**
   * Send appointment reminder
   */
  async sendAppointmentReminder(
    data: AppointmentReminder,
    channels: ('email' | 'sms')[] = ['email', 'sms'],
  ): Promise<{ email: boolean; sms: boolean }> {
    const results = { email: false, sms: false };

    // Send Email
    if (channels.includes('email') && data.patientEmail) {
      const emailHtml = this.generateReminderEmail(data);
      results.email = await this.emailService.sendEmail({
        to: data.patientEmail,
        subject: `Appointment Reminder - ${data.practiceName}`,
        html: emailHtml,
      });
    }

    // Send SMS
    if (channels.includes('sms') && data.patientPhone) {
      const smsBody = this.generateReminderSms(data);
      results.sms = await this.smsService.sendSms({
        to: data.patientPhone,
        body: smsBody,
      });
    }

    return results;
  }

  /**
   * Generate confirmation email HTML
   */
  private generateConfirmationEmail(data: AppointmentConfirmation): string {
    const dateStr = data.appointmentDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Appointment Confirmation</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
    .appointment-details { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .detail-row { display: flex; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .detail-label { font-weight: 600; width: 140px; color: #6b7280; }
    .detail-value { color: #111827; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 14px; color: #6b7280; border-radius: 0 0 10px 10px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">Appointment Confirmed ✓</h1>
    </div>
    <div class="content">
      <p>Hi ${data.patientName},</p>
      <p>Your appointment has been confirmed with <strong>${data.practiceName}</strong>.</p>
      
      <div class="appointment-details">
        <h2 style="margin-top: 0; color: #111827;">Appointment Details</h2>
        <div class="detail-row">
          <div class="detail-label">Date:</div>
          <div class="detail-value">${dateStr}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Time:</div>
          <div class="detail-value">${data.appointmentTime}</div>
        </div>
        ${data.providerName ? `
        <div class="detail-row">
          <div class="detail-label">Provider:</div>
          <div class="detail-value">${data.providerName}</div>
        </div>
        ` : ''}
        ${data.appointmentType ? `
        <div class="detail-row">
          <div class="detail-label">Type:</div>
          <div class="detail-value">${data.appointmentType}</div>
        </div>
        ` : ''}
        <div class="detail-row" style="border-bottom: none;">
          <div class="detail-label">Contact:</div>
          <div class="detail-value">${data.practicePhone}</div>
        </div>
      </div>

      ${data.notes ? `
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px; margin: 20px 0;">
        <strong>Note:</strong> ${data.notes}
      </div>
      ` : ''}

      <p>If you need to reschedule or cancel, please call us at <strong>${data.practicePhone}</strong>.</p>
      
      <p style="margin-top: 30px;">We look forward to seeing you!</p>
      <p style="color: #6b7280; margin-top: 30px; font-size: 14px;">This is an automated confirmation. Please do not reply to this email.</p>
    </div>
    <div class="footer">
      <p style="margin: 0;">${data.practiceName}</p>
      <p style="margin: 5px 0;">${data.practicePhone}</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generate confirmation SMS
   */
  private generateConfirmationSms(data: AppointmentConfirmation): string {
    const dateStr = data.appointmentDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    return `${data.practiceName}: Appointment confirmed for ${dateStr} at ${data.appointmentTime}. ${data.providerName ? `with ${data.providerName}. ` : ''}Questions? Call ${data.practicePhone}`;
  }

  /**
   * Generate reminder email HTML
   */
  private generateReminderEmail(data: AppointmentReminder): string {
    const dateStr = data.appointmentDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    const timeUntil = data.hoursUntilAppointment === 24 ? 'tomorrow' : 
                     data.hoursUntilAppointment < 24 ? `in ${data.hoursUntilAppointment} hours` :
                     `on ${dateStr}`;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Appointment Reminder</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: white; padding: 30px; border: 1px solid #e5e7eb; }
    .reminder-box { background: #fef3c7; border: 2px solid #f59e0b; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }
    .time-large { font-size: 24px; font-weight: bold; color: #d97706; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 14px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">⏰ Appointment Reminder</h1>
    </div>
    <div class="content">
      <p>Hi ${data.patientName},</p>
      
      <div class="reminder-box">
        <p style="margin: 0; font-size: 16px;">Your appointment is ${timeUntil}</p>
        <p class="time-large" style="margin: 10px 0;">${dateStr} at ${data.appointmentTime}</p>
        <p style="margin: 0; color: #6b7280;">${data.practiceName}</p>
      </div>

      ${data.providerName ? `<p><strong>Provider:</strong> ${data.providerName}</p>` : ''}
      
      <p>If you need to reschedule, please call us at <strong>${data.practicePhone}</strong>.</p>
      
      <p style="margin-top: 30px;">See you soon!</p>
    </div>
    <div class="footer">
      <p style="margin: 0;">${data.practiceName} | ${data.practicePhone}</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generate reminder SMS
   */
  private generateReminderSms(data: AppointmentReminder): string {
    const timeUntil = data.hoursUntilAppointment === 24 ? 'tomorrow' : 
                     `in ${data.hoursUntilAppointment}h`;

    return `${data.practiceName}: Reminder - Your appointment is ${timeUntil} at ${data.appointmentTime}. Call ${data.practicePhone} to reschedule.`;
  }

  /**
   * Log notification to database
   */
  private async logNotification(data: {
    type: string;
    patientName: string;
    channels: { email: boolean; sms: boolean };
    appointmentDate: Date;
  }) {
    try {
      // You can extend this to store in your database for tracking
      this.logger.log(
        `Notification sent: ${data.type} for ${data.patientName} - Email: ${data.channels.email}, SMS: ${data.channels.sms}`,
      );
    } catch (error) {
      this.logger.error(`Failed to log notification: ${error}`);
    }
  }
}
```

---

## Phase 2: Integration with Vapi Webhooks

### 2.1 Handle Appointment Bookings from Vapi

When Vapi successfully books an appointment (via the PMS tools), trigger notifications.

**File**: `apps/backend/src/vapi/vapi-tools.service.ts` (add method)

```typescript
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class VapiToolsService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService, // Inject
  ) {}

  /**
   * Called when Vapi successfully books an appointment
   */
  async handleAppointmentBooked(data: {
    callId: string;
    patientName: string;
    patientPhone: string;
    patientEmail?: string;
    appointmentDate: Date;
    appointmentTime: string;
    accountId: string;
  }) {
    try {
      // Get practice details
      const account = await this.prisma.account.findUnique({
        where: { id: data.accountId },
        include: {
          vapiPhoneNumbers: true,
        },
      });

      if (!account) {
        throw new Error('Account not found');
      }

      // Send confirmation
      await this.notificationService.sendAppointmentConfirmation({
        patientName: data.patientName,
        patientPhone: data.patientPhone,
        patientEmail: data.patientEmail,
        appointmentDate: data.appointmentDate,
        appointmentTime: data.appointmentTime,
        practiceName: account.name || 'Our Practice',
        practicePhone: account.vapiPhoneNumbers[0]?.phoneNumber || '',
        appointmentType: 'Consultation',
      });

      // Update CallLog
      await this.prisma.callLog.update({
        where: { vapiCallId: data.callId },
        data: {
          outcome: 'BOOKED',
          appointmentSet: true,
          contactName: data.patientName,
          contactEmail: data.patientEmail,
        },
      });
    } catch (error) {
      console.error('Error handling appointment booking:', error);
    }
  }
}
```

---

## Phase 3: Scheduled Reminders

### 3.1 Create Reminder Scheduler (Cron Job)

**File**: `apps/backend/src/notifications/notification-scheduler.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  /**
   * Send reminders for appointments 24 hours in advance
   * Runs every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async send24HourReminders() {
    this.logger.log('Running 24-hour appointment reminders...');

    try {
      const now = new Date();
      const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const in25Hours = new Date(now.getTime() + 25 * 60 * 60 * 1000);

      // Find appointments scheduled for 24-25 hours from now
      const upcomingAppointments = await this.prisma.callLog.findMany({
        where: {
          outcome: 'BOOKED',
          appointmentSet: true,
          callStartedAt: {
            gte: in24Hours,
            lt: in25Hours,
          },
          // Add flag to prevent duplicate reminders
          // reminderSent24h: false, (you'd need to add this field)
        },
        include: {
          voiceAgent: {
            include: {
              account: true,
            },
          },
        },
      });

      for (const appointment of upcomingAppointments) {
        if (!appointment.contactName || !appointment.phoneNumber) {
          continue;
        }

        await this.notificationService.sendAppointmentReminder({
          patientName: appointment.contactName,
          patientPhone: appointment.phoneNumber,
          patientEmail: appointment.contactEmail || undefined,
          appointmentDate: appointment.callStartedAt || new Date(),
          appointmentTime: this.formatTime(appointment.callStartedAt || new Date()),
          practiceName: appointment.voiceAgent?.account?.name || 'Our Practice',
          practicePhone: appointment.voiceAgent?.phoneNumber || '',
          hoursUntilAppointment: 24,
        });

        // Mark as reminded (you'd need to add this field to CallLog)
        // await this.prisma.callLog.update({
        //   where: { id: appointment.id },
        //   data: { reminderSent24h: true },
        // });
      }

      this.logger.log(`Sent ${upcomingAppointments.length} 24-hour reminders`);
    } catch (error) {
      this.logger.error(`Error sending 24-hour reminders: ${error}`);
    }
  }

  /**
   * Send reminders 2 hours before appointment
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async send2HourReminders() {
    // Similar implementation for 2-hour reminders
    this.logger.log('Running 2-hour appointment reminders...');
    // Implementation similar to above
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
}
```

Update the module:

```typescript
// apps/backend/src/notifications/notifications.module.ts
import { NotificationSchedulerService } from './notification-scheduler.service';

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  providers: [
    NotificationService,
    EmailService,
    SmsService,
    NotificationSchedulerService, // Add this
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
```

---

## Phase 4: User Configuration

### 4.1 Add Notification Preferences to Database

Add fields to `Account` model in `schema.prisma`:

```prisma
model Account {
  // ... existing fields
  
  // Notification preferences
  notificationPreferences Json? @map("notification_preferences")
  // Example: { enableSms: true, enableEmail: true, reminder24h: true, reminder2h: true }
  
  @@map("accounts")
}
```

### 4.2 Frontend Configuration UI

**File**: `apps/frontend/apps/web/app/home/(user)/agent/setup/_components/notification-settings.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Switch } from '@kit/ui/switch';
import { Button } from '@kit/ui/button';
import { Card } from '@kit/ui/card';

interface NotificationPreferences {
  enableSms: boolean;
  enableEmail: boolean;
  reminder24h: boolean;
  reminder2h: boolean;
}

export function NotificationSettings() {
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    enableSms: true,
    enableEmail: true,
    reminder24h: true,
    reminder2h: true,
  });

  const handleSave = async () => {
    // Save to database via API
    await fetch('/api/settings/notifications', {
      method: 'POST',
      body: JSON.stringify(preferences),
    });
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Patient Notifications</h3>
      
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Email Confirmations</p>
            <p className="text-sm text-gray-500">Send email confirmations when appointments are booked</p>
          </div>
          <Switch
            checked={preferences.enableEmail}
            onCheckedChange={(checked) =>
              setPreferences({ ...preferences, enableEmail: checked })
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">SMS Confirmations</p>
            <p className="text-sm text-gray-500">Send SMS confirmations when appointments are booked</p>
          </div>
          <Switch
            checked={preferences.enableSms}
            onCheckedChange={(checked) =>
              setPreferences({ ...preferences, enableSms: checked })
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">24-Hour Reminders</p>
            <p className="text-sm text-gray-500">Send reminders 24 hours before appointment</p>
          </div>
          <Switch
            checked={preferences.reminder24h}
            onCheckedChange={(checked) =>
              setPreferences({ ...preferences, reminder24h: checked })
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">2-Hour Reminders</p>
            <p className="text-sm text-gray-500">Send reminders 2 hours before appointment</p>
          </div>
          <Switch
            checked={preferences.reminder2h}
            onCheckedChange={(checked) =>
              setPreferences({ ...preferences, reminder2h: checked })
            }
          />
        </div>
      </div>

      <Button onClick={handleSave} className="mt-6">
        Save Preferences
      </Button>
    </Card>
  );
}
```

---

## Phase 5: Environment Configuration

### 5.1 Update Environment Variables

Add to `.env.example` and `.env.local`:

```bash
# Email Configuration (Resend)
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=noreply@yourdomain.com

# SMS Configuration (Twilio) - already exists
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_MESSAGING_SERVICE_SID=your_messaging_service_sid

# Notification Settings
ENABLE_EMAIL_NOTIFICATIONS=true
ENABLE_SMS_NOTIFICATIONS=true
```

---

## Security & HIPAA Compliance

### Important Considerations

1. **PHI Protection**
   - ✅ Don't include detailed medical information in SMS/Email
   - ✅ Use generic appointment confirmations
   - ✅ Provide secure portal link for details
   - ✅ Log all notifications for audit trail

2. **Consent**
   - ✅ Get patient consent before sending SMS/Email
   - ✅ Store consent in database
   - ✅ Provide opt-out mechanism

3. **Data Encryption**
   - ✅ Use TLS for all communications
   - ✅ Encrypt phone numbers and emails at rest
   - ✅ Don't log full message contents

4. **Audit Logging**
   - ✅ Log who sent what to whom and when
   - ✅ Track delivery status
   - ✅ Store in HIPAA-compliant manner

### Example Audit Log

Add to `schema.prisma`:

```prisma
model NotificationLog {
  id        String   @id @default(uuid())
  accountId String   @map("account_id")
  
  type      String   @map("type") // 'confirmation', 'reminder'
  channel   String   @map("channel") // 'email', 'sms'
  
  recipientPhone String? @map("recipient_phone")
  recipientEmail String? @map("recipient_email")
  
  status    String   @map("status") // 'sent', 'failed', 'delivered'
  
  sentAt    DateTime @default(now()) @map("sent_at")
  
  // Don't store full message content (HIPAA)
  messageTemplate String @map("message_template") // Reference to template used
  
  callLogId String?  @map("call_log_id")
  callLog   CallLog? @relation(fields: [callLogId], references: [id])
  
  account Account @relation(fields: [accountId], references: [id])
  
  @@index([accountId, sentAt])
  @@map("notification_logs")
}
```

---

## Testing

### Test Email Sending

```bash
curl -X POST http://localhost:4001/api/notifications/test-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test@example.com",
    "patientName": "John Doe",
    "appointmentDate": "2024-03-15T10:00:00Z",
    "appointmentTime": "10:00 AM",
    "practiceName": "Dental Care Plus",
    "practicePhone": "+15551234567"
  }'
```

### Test SMS Sending

```bash
curl -X POST http://localhost:4001/api/notifications/test-sms \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+15551234567",
    "patientName": "John Doe",
    "appointmentDate": "2024-03-15T10:00:00Z",
    "appointmentTime": "10:00 AM",
    "practiceName": "Dental Care Plus",
    "practicePhone": "+15559876543"
  }'
```

---

## Cost Estimates

### Resend Email Pricing
- Free tier: 3,000 emails/month
- Pro: $20/month for 50,000 emails
- **Cost per email**: $0.0004 - $0.001

### Twilio SMS Pricing
- US SMS: $0.0079 per message
- **Cost per SMS**: ~$0.008

### Example Monthly Costs (1000 appointments)
- Confirmations: 1000 emails ($0.40) + 1000 SMS ($8)
- 24h Reminders: 1000 emails ($0.40) + 1000 SMS ($8)
- **Total**: ~$17/month for 2000 emails + 2000 SMS

---

## Implementation Checklist

### Backend (NestJS)
- [ ] Create `notifications` module
- [ ] Implement `EmailService` with Resend
- [ ] Implement `SmsService` with Twilio
- [ ] Implement `NotificationService` with templates
- [ ] Add notification scheduler for reminders
- [ ] Add audit logging
- [ ] Add unit tests

### Database
- [ ] Add `notificationPreferences` to Account model
- [ ] Create `NotificationLog` model
- [ ] Add reminder tracking fields to CallLog
- [ ] Run migrations

### Frontend
- [ ] Create notification settings UI
- [ ] Add to setup wizard
- [ ] Create API route for saving preferences
- [ ] Add notification history page

### Integration
- [ ] Connect Vapi webhook to send confirmations
- [ ] Test with real appointments
- [ ] Set up monitoring/alerts
- [ ] Document for users

### Compliance
- [ ] Review HIPAA compliance
- [ ] Add consent mechanism
- [ ] Implement opt-out
- [ ] Set up audit logging

---

## Next Steps

1. **Start with Phase 1**: Create the core notification services
2. **Test thoroughly**: Use test phone numbers and emails
3. **Deploy to staging**: Test with real Vapi integration
4. **Add frontend UI**: Let users configure preferences
5. **Monitor delivery**: Track success rates and failures
6. **Scale gradually**: Start with confirmations, add reminders later

## Support

For questions or issues:
- Check Resend docs: https://resend.com/docs
- Check Twilio docs: https://www.twilio.com/docs/messaging
- Review HIPAA compliance: https://www.hhs.gov/hipaa
