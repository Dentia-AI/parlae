# Email Confirmation Setup Guide

## Overview
This guide explains how to set up email confirmations for appointment bookings using the existing `@kit/mailers` infrastructure.

---

## Prerequisites

Your project already has:
- ✅ Mailer infrastructure (`@kit/mailers`)
- ✅ Email templates system (`@kit/email-templates`)
- ✅ Resend and Nodemailer support
- ✅ Notification service with email placeholders

---

## Step 1: Choose Your Email Provider

You have two options:

### Option A: **Resend** (Recommended - Easiest)
- Modern email API
- Free tier: 3,000 emails/month
- No SMTP configuration needed
- Better deliverability
- Built-in analytics

### Option B: **Nodemailer** (SMTP)
- Works with any SMTP server (Gmail, SendGrid, AWS SES, etc.)
- More complex setup
- Good for existing infrastructure

**Recommendation:** Use Resend unless you already have SMTP infrastructure.

---

## Step 2: Get Your API Key / SMTP Credentials

### For Resend:

1. Go to [https://resend.com/](https://resend.com/)
2. Sign up for a free account
3. Verify your email
4. Go to API Keys section
5. Click "Create API Key"
6. Name it "Parlae Production" or "Parlae Development"
7. Copy the API key (starts with `re_`)

### For Nodemailer (Gmail example):

1. Enable 2-factor authentication on your Gmail account
2. Go to [Google App Passwords](https://myaccount.google.com/apppasswords)
3. Generate an app password
4. Copy the 16-character password

---

## Step 3: Configure Environment Variables

### Backend Environment (`.env` in `/apps/backend/`)

Add these variables:

```bash
# ==================================================================
# Email Service Configuration
# ==================================================================

# Choose your provider: 'resend' or 'nodemailer'
MAILER_PROVIDER=resend

# For Resend:
RESEND_API_KEY=re_your_api_key_here

# For Nodemailer (SMTP):
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your-email@gmail.com
# SMTP_PASSWORD=your-app-password
# SMTP_SECURE=false  # true for port 465, false for other ports

# Email "from" address
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=Parlae AI

# (Optional) Email footer info
EMAIL_COMPANY_NAME=Your Clinic Name
EMAIL_SUPPORT_EMAIL=support@yourdomain.com
```

### Frontend Environment (`.env.local` in root)

```bash
# Email configuration (for frontend context if needed)
NEXT_PUBLIC_EMAIL_FROM=noreply@yourdomain.com
```

---

## Step 4: Verify Domain (For Production)

### For Resend:

1. Go to Resend dashboard → Domains
2. Click "Add Domain"
3. Enter your domain (e.g., `yourdomain.com`)
4. Add the DNS records provided by Resend to your domain's DNS:
   - **SPF Record** (TXT)
   - **DKIM Record** (TXT)
   - **DMARC Record** (TXT) - Optional but recommended

**For Development/Testing:**
- Resend provides a testing domain: `onboarding@resend.dev`
- Use this for development until your domain is verified

### For Nodemailer (SMTP):
- Domain verification depends on your SMTP provider
- Gmail: No domain verification needed
- SendGrid/AWS SES: Follow their verification process

---

## Step 5: Create Email Templates

Create appointment-specific email templates in `/apps/frontend/packages/email-templates/src/emails/`:

### 5.1 Create `appointment-confirmation.email.tsx`:

```typescript
import {
  Body,
  Head,
  Html,
  Preview,
  Section,
  Text,
  render,
} from '@react-email/components';
import { EmailWrapper } from '../components/wrapper';
import { EmailHeader } from '../components/header';
import { EmailContent } from '../components/content';
import { EmailFooter } from '../components/footer';
import { EmailHeading } from '../components/heading';
import { CtaButton } from '../components/cta-button';

interface Props {
  patientName: string;
  clinicName: string;
  appointmentType: string;
  appointmentDate: string;
  appointmentTime: string;
  duration: number;
  notes?: string;
  eventLink?: string;
  clinicPhone?: string;
}

export async function renderAppointmentConfirmationEmail(props: Props) {
  const subject = `Appointment Confirmed - ${props.clinicName}`;
  const previewText = `Your ${props.appointmentType} appointment is confirmed for ${props.appointmentDate}`;

  const html = render(
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ fontFamily: 'Arial, sans-serif' }}>
        <EmailWrapper>
          <EmailHeader heading={`Appointment Confirmed`} />
          
          <EmailContent>
            <EmailHeading>Hi {props.patientName},</EmailHeading>
            
            <Text>Your appointment has been successfully scheduled!</Text>
            
            <Section style={{
              backgroundColor: '#f9fafb',
              padding: '20px',
              borderRadius: '8px',
              marginTop: '24px',
              marginBottom: '24px',
            }}>
              <Text style={{ margin: '0 0 12px 0', fontWeight: 'bold' }}>
                📅 Appointment Details
              </Text>
              <Text style={{ margin: '4px 0' }}>
                <strong>Type:</strong> {props.appointmentType}
              </Text>
              <Text style={{ margin: '4px 0' }}>
                <strong>Date:</strong> {props.appointmentDate}
              </Text>
              <Text style={{ margin: '4px 0' }}>
                <strong>Time:</strong> {props.appointmentTime}
              </Text>
              <Text style={{ margin: '4px 0' }}>
                <strong>Duration:</strong> {props.duration} minutes
              </Text>
              {props.notes && (
                <Text style={{ margin: '12px 0 0 0' }}>
                  <strong>Notes:</strong> {props.notes}
                </Text>
              )}
            </Section>

            {props.eventLink && (
              <CtaButton href={props.eventLink}>
                View in Calendar
              </CtaButton>
            )}

            <Text style={{ marginTop: '24px' }}>
              If you need to cancel or reschedule, please call us at{' '}
              {props.clinicPhone || 'the clinic'}.
            </Text>
            
            <Text style={{ marginTop: '16px', color: '#6b7280', fontSize: '14px' }}>
              This appointment was booked via AI Receptionist.
            </Text>
          </EmailContent>
          
          <EmailFooter
            productName={props.clinicName}
          />
        </EmailWrapper>
      </Body>
    </Html>
  );

  return { html, subject };
}
```

### 5.2 Create `appointment-cancellation.email.tsx` and `appointment-reschedule.email.tsx` similarly.

### 5.3 Export templates in `/apps/frontend/packages/email-templates/src/index.ts`:

```typescript
export { renderAppointmentConfirmationEmail } from './emails/appointment-confirmation.email';
export { renderAppointmentCancellationEmail } from './emails/appointment-cancellation.email';
export { renderAppointmentRescheduleEmail } from './emails/appointment-reschedule.email';
```

---

## Step 6: Update Notification Service

Update `/apps/backend/src/notifications/notifications.service.ts`:

Replace the placeholder email methods with actual implementations:

```typescript
import { getMailer } from '@kit/mailers';
import { 
  renderAppointmentConfirmationEmail,
  renderAppointmentCancellationEmail,
  renderAppointmentRescheduleEmail 
} from '@kit/email-templates';

// In NotificationsService class:

private async sendConfirmationEmail(
  to: string,
  patient: PatientInfo,
  appointment: AppointmentInfo,
  clinic: ClinicInfo,
): Promise<void> {
  const mailer = await getMailer();
  
  const time = this.formatAppointmentTime(appointment.startTime);
  
  const { html, subject } = await renderAppointmentConfirmationEmail({
    patientName: `${patient.firstName} ${patient.lastName}`,
    clinicName: clinic.name,
    appointmentType: appointment.appointmentType,
    appointmentDate: time.split(' at ')[0],
    appointmentTime: time.split(' at ')[1] || time,
    duration: appointment.duration,
    notes: appointment.notes,
    eventLink: appointment.externalEventLink,
    clinicPhone: clinic.phone,
  });

  await mailer.sendEmail({
    to,
    from: process.env.EMAIL_FROM || 'noreply@yourdomain.com',
    subject,
    html,
  });

  this.logger.log({
    to,
    subject,
    msg: 'Confirmation email sent successfully',
  });
}

// Similarly for cancellation and reschedule emails
```

---

## Step 7: Install Dependencies (if needed)

The email template system uses `@react-email/components`. Verify it's installed:

```bash
cd apps/frontend/packages/email-templates
pnpm install @react-email/components
```

---

## Step 8: Test Email Sending

### Test 1: Send Test Email from Backend

Create a test script `/apps/backend/src/notifications/test-email.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { NotificationsService } from './notifications.service';

async function testEmail() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const notificationsService = app.get(NotificationsService);

  await notificationsService.sendAppointmentConfirmation({
    accountId: 'test-account-id',
    patient: {
      firstName: 'Test',
      lastName: 'Patient',
      phone: '+14165551234',
      email: 'your-test-email@example.com', // YOUR EMAIL HERE
    },
    appointment: {
      appointmentType: 'Dental Cleaning',
      startTime: new Date('2026-02-20T14:00:00Z'),
      duration: 30,
      notes: 'Patient prefers afternoon appointments',
    },
    integrationType: 'google_calendar',
  });

  console.log('✅ Test email sent!');
  await app.close();
}

testEmail();
```

Run:
```bash
cd apps/backend
npx ts-node src/notifications/test-email.ts
```

### Test 2: End-to-End Test

1. Make a test booking via Vapi
2. Check your email for confirmation
3. Check SMS for text confirmation
4. Verify event created in Google Calendar

---

## Step 9: Production Checklist

Before going live:

- [ ] Domain verified in Resend/SMTP provider
- [ ] `EMAIL_FROM` uses your verified domain
- [ ] Test emails to multiple providers (Gmail, Outlook, Yahoo)
- [ ] Check spam folder - adjust SPF/DKIM if emails land there
- [ ] Set up email monitoring/alerts
- [ ] Add unsubscribe link if sending marketing emails (not needed for transactional)
- [ ] Test with real patient data (with permission)

---

## Troubleshooting

### Emails Not Sending

1. **Check environment variables:**
   ```bash
   # In backend container/process
   echo $RESEND_API_KEY
   echo $MAILER_PROVIDER
   ```

2. **Check backend logs:**
   ```bash
   # Look for email errors
   grep -i "email" logs/backend.log
   ```

3. **Verify API key is valid:**
   - Go to Resend dashboard
   - Check API key is active
   - Try creating a new key

### Emails Going to Spam

1. **Verify domain records (SPF, DKIM, DMARC)**
2. **Use a professional "from" address** (not gmail.com)
3. **Avoid spam trigger words** in subject/body
4. **Include unsubscribe link** for bulk emails
5. **Warm up your domain** (start with low volume)

### Wrong Email Content

1. **Check template rendering:**
   ```typescript
   const { html } = await renderAppointmentConfirmationEmail(props);
   console.log(html); // Inspect HTML
   ```

2. **Verify props passed correctly**
3. **Check for timezone issues** in date formatting

---

## Cost Estimation

### Resend Pricing:
- **Free Tier:** 3,000 emails/month, 100 emails/day
- **Paid Tier:** $20/month for 50,000 emails
- **Typical Clinic:** ~500-2000 emails/month (confirmations + notifications)

### Nodemailer (SMTP):
- **Gmail:** Free (limited to 500/day)
- **SendGrid:** Free tier 100 emails/day, paid $15+/month
- **AWS SES:** $0.10 per 1,000 emails (very cheap for high volume)

---

## Summary

To enable email confirmations, you need to:

1. ✅ **Choose provider** (Resend recommended)
2. ✅ **Get API key** from provider
3. ✅ **Add environment variables** to backend `.env`
4. ✅ **Create email templates** (3 templates needed)
5. ✅ **Update notification service** (replace placeholders)
6. ✅ **Verify domain** (production only)
7. ✅ **Test thoroughly**

**Estimated Setup Time:** 1-2 hours

**Next Steps:**
1. Sign up for Resend
2. Add `RESEND_API_KEY` to backend `.env`
3. Set `MAILER_PROVIDER=resend`
4. Create the 3 email templates
5. Update notification service
6. Test with your email
7. Deploy!
