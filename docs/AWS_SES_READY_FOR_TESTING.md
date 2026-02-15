# AWS SES + Branding Setup - READY FOR TESTING

## ✅ Completed Setup

### AWS SES (us-east-2)
- ✅ IAM user: `parlae-ses-mailer` with full SES permissions
- ✅ Access credentials configured in `/apps/backend/.env`
- ✅ Email identities registered:
  - `support@parlae.ca` ⏳ (check inbox for verification)
  - `noreply@parlae.ca` ⏳ (check inbox for verification)
- ✅ Domain `parlae.ca` registered with DKIM
- ✅ DNS records added to Route 53:
  - TXT record for domain verification ✅ (propagated)
  - 3 CNAME records for DKIM ⏳ (propagating)

### Database
- ✅ Migration applied - branding fields added to accounts table
- ✅ Prisma client regenerated with new fields

### Dependencies
- ✅ AWS SES packages installed: `@aws-sdk/client-ses`, `nodemailer`
- ✅ Mailer registered as `'aws-ses'` provider

### Email Templates
- ✅ 3 professional templates created with dynamic branding:
  - `appointment-confirmation.email.tsx`
  - `appointment-cancellation.email.tsx`
  - `appointment-reschedule.email.tsx`

### Branding Settings UI
- ✅ Page: `/home/settings/branding`
- ✅ API routes: GET/PATCH `/api/account/branding`
- ✅ Added to Settings navigation menu
- ✅ Features:
  - Logo URL with preview
  - Color picker
  - Contact information
  - Address & website
  - Real-time validation

### Notification Service
- ✅ Updated to use AWS SES with email templates
- ✅ Loads branding from database automatically
- ✅ Falls back to defaults if branding not set
- ✅ Sends SMS via Twilio (already configured)

---

## ⏳ Verification Status

**Email Identities:**
- `support@parlae.ca` - Pending (check your inbox!)
- `noreply@parlae.ca` - Pending (check your inbox!)

**Domain:**
- `parlae.ca` - Pending (DNS propagating, should verify within 30 mins)

**DNS Records Added:**
- ✅ `_amazonses.parlae.ca` TXT - **Propagated**
- ⏳ DKIM CNAME records - Propagating

---

## 🚀 Next Steps

### 1. Verify Email Addresses (Now)
Check your inbox for:
- Email to `support@parlae.ca` from AWS
- Email to `noreply@parlae.ca` from AWS
Click the verification links in both emails.

### 2. Wait for Domain Verification (~15-30 mins)
The DNS records are propagating. Check status:
```bash
aws ses get-identity-verification-attributes \
  --identities parlae.ca \
  --region us-east-2 \
  --profile parlae
```

Look for: `"VerificationStatus": "Success"`

### 3. Test Branding UI (Now - Can test before emails work)
```bash
# Start dev server if not running
./dev.sh

# Visit in browser:
# http://localhost:3000/home/settings/branding
```

Fill in your branding:
- Logo URL: Upload your logo somewhere or use existing URL
- Primary Color: Choose your brand color
- Contact info: Fill in all fields

### 4. Test Email Sending (After verification)
Once domain is verified:

```bash
cd apps/backend
npx ts-node src/notifications/test-aws-ses.ts
```

### 5. Request Production Access
Once everything works in sandbox mode:
1. Go to: https://console.aws.amazon.com/ses/
2. Click "Request production access"
3. Fill out form (usually approved in 24 hours)

---

## 📊 Current Configuration

**Region:** us-east-2 (Ohio)
**Email From:** support@parlae.ca
**Mailer:** AWS SES via Nodemailer

**Environment Variables Set:**
```bash
MAILER_PROVIDER=aws-ses
AWS_ACCESS_KEY_ID=<your-aws-access-key-id>
AWS_SECRET_ACCESS_KEY=<your-aws-secret-access-key>
AWS_REGION=us-east-2
EMAIL_FROM=support@parlae.ca
EMAIL_FROM_NAME=Parlae AI
```

**Database Fields Added:**
- brandingLogoUrl
- brandingPrimaryColor
- brandingBusinessName
- brandingContactEmail
- brandingContactPhone
- brandingAddress
- brandingWebsite
- twilioMessagingServiceSid

---

## 🎨 Branding Features

When a clinic configures their branding:
- ✅ Logo appears in email header
- ✅ Custom color for buttons/highlights
- ✅ Business name in email copy
- ✅ Contact email/phone for patient questions
- ✅ Physical address in footer
- ✅ Website link in footer

If branding not configured:
- ✅ Falls back to account name
- ✅ Uses default blue color (#3b82f6)
- ✅ Shows generic contact info

---

## 💡 Testing Checklist

- [ ] Check inbox and verify `support@parlae.ca` and `noreply@parlae.ca`
- [ ] Wait 15-30 mins for domain verification
- [ ] Test branding settings UI at `/home/settings/branding`
- [ ] Upload or link your clinic logo
- [ ] Save branding settings
- [ ] Send test email (after verification)
- [ ] Make test booking via Vapi
- [ ] Check patient receives branded email
- [ ] Verify clinic receives notification
- [ ] Request production access from AWS

---

## ✅ Summary

**Everything is set up and ready to use!**

The system will:
1. Automatically use branding from database
2. Send beautiful branded emails
3. Include all patient information
4. Send SMS confirmations
5. Notify both patient and clinic

**Just need to:**
1. Verify the email addresses (check inbox)
2. Wait for DNS propagation (~30 mins)
3. Test the branding UI
4. Test end-to-end booking!

Cost: ~$0.10 per 1,000 emails (practically free for typical clinic usage)
