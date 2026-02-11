# Patient Notifications - Quick Start Guide

## TL;DR - What You Need to Know

Your Parlae system already has **Twilio** (SMS) and **Resend** (Email) integrated. This guide shows you how to send appointment confirmations and reminders using your existing infrastructure.

## Recommended Approach

### ✅ Use What You Have

1. **Email**: Use Resend (already configured in `apps/frontend/packages/mailers/resend`)
2. **SMS**: Use Twilio (already configured, has `TWILIO_MESSAGING_SERVICE_SID`)
3. **Trigger**: Hook into Vapi appointment booking webhooks
4. **Storage**: Track in your existing `CallLog` and `Notification` models

### ⚠️ HIPAA Compliance First

Since you're dealing with healthcare:
- ✅ Keep messages generic ("Your appointment is scheduled")
- ❌ Don't include medical details or PHI in SMS/Email
- ✅ Get patient consent before sending
- ✅ Provide opt-out mechanism
- ✅ Log all notifications for audit trail

## Quick Implementation (3 Steps)

### Step 1: Set Up Environment Variables

```bash
# Add to apps/backend/.env
RESEND_API_KEY=re_your_key_here
EMAIL_FROM=noreply@parlae.ai

# Already have these:
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_MESSAGING_SERVICE_SID=your_messaging_sid
```

### Step 2: Create Notification Service

```bash
cd apps/backend
mkdir -p src/notifications
```

Create these 3 files (full code in main implementation doc):
1. `email.service.ts` - Sends via Resend
2. `sms.service.ts` - Sends via Twilio
3. `notification.service.ts` - Main coordinator

### Step 3: Trigger on Appointment Booking

In your Vapi webhook handler, call:

```typescript
await notificationService.sendAppointmentConfirmation({
  patientName: 'John Doe',
  patientPhone: '+15551234567',
  patientEmail: 'john@example.com',
  appointmentDate: new Date('2024-03-15T10:00:00Z'),
  appointmentTime: '10:00 AM',
  practiceName: 'Dental Care Plus',
  practicePhone: '+15559876543',
});
```

That's it! 🎉

## What Gets Sent

### Email Confirmation
Beautiful HTML email with:
- Appointment date, time, provider
- Practice contact information
- Cancellation/reschedule instructions
- Professional branding

### SMS Confirmation
Short text message:
```
Dental Care Plus: Appointment confirmed for Mar 15 at 10:00 AM. Questions? Call (555) 987-6543
```

## Adding Reminders (Optional)

Use NestJS scheduler to send automatic reminders:

```typescript
@Cron(CronExpression.EVERY_HOUR)
async send24HourReminders() {
  // Find appointments 24 hours away
  // Send reminder email + SMS
}
```

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  Vapi AI Agent Books Appointment                │
└───────────────┬─────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────┐
│  Backend: NotificationService                   │
│  - Gets patient contact info                    │
│  - Generates email HTML & SMS text              │
└───────┬─────────────────────┬───────────────────┘
        │                     │
        ▼                     ▼
┌──────────────┐      ┌──────────────┐
│ EmailService │      │  SmsService  │
│  (Resend)    │      │  (Twilio)    │
└──────────────┘      └──────────────┘
        │                     │
        ▼                     ▼
┌──────────────┐      ┌──────────────┐
│   Patient    │      │   Patient    │
│   Email      │      │   Phone      │
└──────────────┘      └──────────────┘
```

## File Structure

```
apps/backend/src/
├── notifications/
│   ├── notifications.module.ts      # Module definition
│   ├── notification.service.ts      # Main coordinator
│   ├── email.service.ts             # Resend integration
│   ├── sms.service.ts               # Twilio integration
│   └── notification-scheduler.service.ts  # Cron jobs for reminders
├── vapi/
│   └── vapi-tools.service.ts        # Hook here to trigger notifications
└── app.module.ts                    # Import NotificationModule
```

## Cost Breakdown

### Per Appointment
- 1 Confirmation Email: $0.0004 (Resend)
- 1 Confirmation SMS: $0.008 (Twilio)
- 1 Reminder Email (24h): $0.0004
- 1 Reminder SMS (24h): $0.008
- **Total per appointment**: ~$0.017 (less than 2 cents)

### Monthly (1000 appointments)
- 2000 emails: ~$0.80
- 2000 SMS: ~$16.00
- **Total**: ~$17/month

## Next Steps

1. **Read Full Implementation**: See `PATIENT_NOTIFICATIONS_IMPLEMENTATION.md`
2. **Test with Sandbox**: Use Twilio test numbers
3. **Add Frontend UI**: Let practices configure preferences
4. **Set Up Monitoring**: Track delivery success rates

## Common Questions

### Q: Can I use just email or just SMS?
**A**: Yes! Pass `channels: ['email']` or `channels: ['sms']` to the service.

### Q: How do I handle opt-outs?
**A**: Add `smsOptOut` and `emailOptOut` fields to your patient/contact records and check before sending.

### Q: What about Spanish speakers?
**A**: You already have i18n setup. Add Spanish templates and detect language preference from patient records.

### Q: Is this HIPAA compliant?
**A**: The messages are generic enough to be compliant, but you should:
- Get explicit consent
- Use TLS for all communications
- Log all notifications for audit
- Review with your compliance team

### Q: Can I customize the templates?
**A**: Absolutely! Edit the `generateConfirmationEmail()` and `generateConfirmationSms()` methods in `notification.service.ts`.

## Troubleshooting

### Email not sending?
1. Check `RESEND_API_KEY` is set
2. Verify domain is verified in Resend dashboard
3. Check logs for error messages

### SMS not sending?
1. Verify `TWILIO_MESSAGING_SERVICE_SID` is correct
2. Check phone numbers are in E.164 format (+15551234567)
3. For US numbers, ensure you're using a US messaging service

### Messages not triggered?
1. Verify NotificationModule is imported in AppModule
2. Check Vapi webhook is calling the notification service
3. Ensure appointment data includes contact info

## Resources

- 📖 Full Implementation Guide: `docs/PATIENT_NOTIFICATIONS_IMPLEMENTATION.md`
- 🔗 Resend Docs: https://resend.com/docs
- 🔗 Twilio Docs: https://www.twilio.com/docs/messaging
- 🔒 HIPAA Guidelines: https://www.hhs.gov/hipaa

## Quick Test Commands

### Test Email
```bash
curl -X POST http://localhost:4001/api/notifications/test \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "email",
    "to": "test@example.com",
    "patientName": "Test Patient"
  }'
```

### Test SMS
```bash
curl -X POST http://localhost:4001/api/notifications/test \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "sms",
    "to": "+15551234567",
    "patientName": "Test Patient"
  }'
```

---

**Need help?** Check the full implementation guide or ask questions in the docs!
