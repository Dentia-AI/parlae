# AWS SES Email Setup with Dynamic Branding

## Overview
Complete setup guide for AWS SES email integration with dynamic clinic branding for appointment confirmations.

---

## Part 1: AWS SES Setup

### Step 1: Create IAM User for SES

1. **Go to AWS IAM Console:**
   - Navigate to: https://console.aws.amazon.com/iam/

2. **Create New User:**
   - Click "Users" → "Create user"
   - User name: `parlae-ses-mailer`
   - Select "Access key - Programmatic access"

3. **Attach Permissions:**
   - Click "Attach policies directly"
   - Search and select: `AmazonSESFullAccess`
   - (Or create custom policy with minimum permissions - see below)

4. **Save Credentials:**
   - Download the CSV with:
     - Access Key ID
     - Secret Access Key
   - **Keep these secure!**

#### Minimum SES Permissions (Custom Policy):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      "Resource": "*"
    }
  ]
}
```

### Step 2: Verify Email Addresses / Domain

#### For Development (Email Verification):

1. **Go to SES Console:**
   - Navigate to: https://console.aws.amazon.com/ses/

2. **Verify Email Addresses:**
   - Click "Verified identities" → "Create identity"
   - Select "Email address"
   - Enter your email: `your-email@domain.com`
   - Click "Create identity"
   - Check your email and click verification link

3. **Verify Multiple Emails:**
   - Repeat for:
     - Your "from" address: `noreply@yourdomain.com`
     - Test recipient addresses

#### For Production (Domain Verification):

1. **Verify Your Domain:**
   - Click "Verified identities" → "Create identity"
   - Select "Domain"
   - Enter: `yourdomain.com`
   - Enable "Generate DKIM settings"
   - Click "Create identity"

2. **Add DNS Records:**
   - Copy the provided DNS records
   - Add to your domain's DNS (Route 53, Cloudflare, etc.):
     - **3 CNAME records** for DKIM
     - **1 TXT record** for domain verification
     - **Optional:** MX record for email receiving

3. **Wait for Verification:**
   - Can take up to 72 hours (usually <30 minutes)
   - Check status in SES console

### Step 3: Request Production Access

**By default, AWS SES starts in sandbox mode:**
- ✅ Can only send to verified emails
- ✅ Limit: 200 emails/day, 1 email/second
- ❌ Cannot send to unverified recipients

**To send to all patients, request production access:**

1. **Go to SES Console → Account dashboard**
2. Click "Request production access"
3. Fill out form:
   - **Mail type:** Transactional
   - **Use case:** Appointment confirmations and notifications
   - **Compliance:** We comply with AWS policies
   - **Process bounces:** Yes, we handle bounces
4. Submit (usually approved within 24 hours)

### Step 4: Configure Environment Variables

#### Backend `.env`:
```bash
# ==================================================================
# AWS SES Email Configuration
# ==================================================================

# Mailer Provider
MAILER_PROVIDER=aws-ses

# AWS Credentials (from IAM user)
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_REGION=us-east-1

# Email From Address (must be verified in SES)
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=Parlae AI

# Optional: Email footer info
EMAIL_COMPANY_NAME=Parlae AI
EMAIL_SUPPORT_EMAIL=support@parlae.ai
```

#### Frontend `.env.local`:
```bash
# Email configuration (for frontend context if needed)
NEXT_PUBLIC_EMAIL_FROM=noreply@yourdomain.com
```

---

## Part 2: Database Migration

### Run Branding Fields Migration

```bash
cd packages/prisma

# Run migration
npx prisma migrate deploy

# Or create and apply
npx prisma migrate dev --name add_branding_fields

# Generate Prisma client
npx prisma generate
```

---

## Part 3: Branding Settings UI

### Create Branding Settings Page

Location: `/apps/frontend/apps/web/app/home/(user)/settings/branding/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { toast } from '@kit/ui/sonner';

export default function BrandingSettingsPage() {
  const [branding, setBranding] = useState({
    logoUrl: '',
    primaryColor: '#3b82f6',
    businessName: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
    website: '',
  });

  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/account/branding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(branding),
      });

      if (response.ok) {
        toast.success('Branding settings saved!');
      } else {
        toast.error('Failed to save branding settings');
      }
    } catch (error) {
      toast.error('An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container max-w-4xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Email Branding</CardTitle>
          <CardDescription>
            Customize how your clinic appears in appointment confirmations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Logo URL */}
          <div>
            <Label htmlFor="logoUrl">Logo URL</Label>
            <Input
              id="logoUrl"
              type="url"
              placeholder="https://yourdomain.com/logo.png"
              value={branding.logoUrl}
              onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })}
            />
            <p className="text-sm text-muted-foreground mt-1">
              Recommended: 200x50px PNG or SVG
            </p>
          </div>

          {/* Primary Color */}
          <div>
            <Label htmlFor="primaryColor">Primary Brand Color</Label>
            <div className="flex gap-2">
              <Input
                id="primaryColor"
                type="color"
                value={branding.primaryColor}
                onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                className="w-20 h-10"
              />
              <Input
                type="text"
                placeholder="#3b82f6"
                value={branding.primaryColor}
                onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
              />
            </div>
          </div>

          {/* Business Name */}
          <div>
            <Label htmlFor="businessName">Business Name</Label>
            <Input
              id="businessName"
              placeholder="Your Clinic Name"
              value={branding.businessName}
              onChange={(e) => setBranding({ ...branding, businessName: e.target.value })}
            />
            <p className="text-sm text-muted-foreground mt-1">
              Leave blank to use account name
            </p>
          </div>

          {/* Contact Email */}
          <div>
            <Label htmlFor="contactEmail">Contact Email</Label>
            <Input
              id="contactEmail"
              type="email"
              placeholder="info@yourclinic.com"
              value={branding.contactEmail}
              onChange={(e) => setBranding({ ...branding, contactEmail: e.target.value })}
            />
          </div>

          {/* Contact Phone */}
          <div>
            <Label htmlFor="contactPhone">Contact Phone</Label>
            <Input
              id="contactPhone"
              type="tel"
              placeholder="(555) 123-4567"
              value={branding.contactPhone}
              onChange={(e) => setBranding({ ...branding, contactPhone: e.target.value })}
            />
          </div>

          {/* Address */}
          <div>
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              placeholder="123 Main St, City, State 12345"
              value={branding.address}
              onChange={(e) => setBranding({ ...branding, address: e.target.value })}
            />
          </div>

          {/* Website */}
          <div>
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              type="url"
              placeholder="https://yourdomain.com"
              value={branding.website}
              onChange={(e) => setBranding({ ...branding, website: e.target.value })}
            />
          </div>

          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save Branding Settings'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

### Create API Route

Location: `/apps/frontend/apps/web/app/api/account/branding/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { getSessionUserId } from '~/lib/auth/get-session';

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Get user's account
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        accountsOwned: {
          take: 1,
          select: { id: true },
        },
      },
    });

    if (!user?.accountsOwned?.[0]) {
      return NextResponse.json({ error: 'No account found' }, { status: 404 });
    }

    const accountId = user.accountsOwned[0].id;

    // Update branding
    await prisma.account.update({
      where: { id: accountId },
      data: {
        brandingLogoUrl: body.logoUrl || null,
        brandingPrimaryColor: body.primaryColor || null,
        brandingBusinessName: body.businessName || null,
        brandingContactEmail: body.contactEmail || null,
        brandingContactPhone: body.contactPhone || null,
        brandingAddress: body.address || null,
        brandingWebsite: body.website || null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating branding:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

---

## Part 4: Install Dependencies

```bash
# Install AWS SDK and Nodemailer
cd apps/frontend/packages/mailers/aws-ses
pnpm install @aws-sdk/client-ses nodemailer @types/nodemailer

# Ensure email-templates has react-email
cd ../../../packages/email-templates
pnpm install @react-email/components
```

---

## Part 5: Testing

### Test 1: Send Test Email

Create `/apps/backend/src/notifications/test-aws-ses.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { NotificationsService } from './notifications.service';

async function testAwsSes() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const notificationsService = app.get(NotificationsService);

  console.log('Sending test appointment confirmation...');

  await notificationsService.sendAppointmentConfirmation({
    accountId: 'your-account-id-here', // Replace with real account ID
    patient: {
      firstName: 'Test',
      lastName: 'Patient',
      phone: '+14165551234',
      email: 'your-test-email@example.com', // YOUR EMAIL
    },
    appointment: {
      appointmentType: 'Dental Cleaning',
      startTime: new Date('2026-02-20T14:00:00Z'),
      duration: 30,
      notes: 'Test appointment with branding',
    },
    integrationType: 'google_calendar',
  });

  console.log('✅ Test email sent! Check your inbox.');
  await app.close();
}

testAwsSes().catch(console.error);
```

Run:
```bash
cd apps/backend
npx ts-node src/notifications/test-aws-ses.ts
```

### Test 2: Check Email Rendering

Preview templates locally:
```bash
cd apps/frontend/packages/email-templates
npx email dev
```

---

## Part 6: Production Checklist

- [ ] AWS SES production access approved
- [ ] Domain verified in SES
- [ ] DNS records (DKIM, SPF, DMARC) added
- [ ] IAM credentials configured
- [ ] Environment variables set in production
- [ ] Database migration applied
- [ ] Branding settings UI deployed
- [ ] Test emails sent successfully
- [ ] Check spam folder (adjust DNS if needed)
- [ ] Monitor SES bounce/complaint rates
- [ ] Set up SNS notifications for bounces

---

## Pricing

### AWS SES:
- **Free Tier:** 62,000 emails/month (if using EC2)
- **Standard Pricing:** $0.10 per 1,000 emails
- **Data Transfer:** $0.12 per GB

### Typical Clinic Usage:
- 500-2000 confirmations/month
- **Cost:** ~$0.02-$0.20/month
- **Much cheaper than Resend for high volume**

---

## Troubleshooting

### Emails Not Sending:

1. **Check SES sending statistics in AWS Console**
2. **Verify email addresses if in sandbox mode**
3. **Check AWS credentials:**
   ```bash
   aws ses verify-email-identity --email-address test@example.com --region us-east-1
   ```
4. **Check backend logs for errors**

### Emails Going to Spam:

1. **Verify SPF, DKIM, DMARC records:**
   ```bash
   dig TXT yourdomain.com
   dig TXT _domainkey.yourdomain.com
   ```
2. **Use mail-tester.com to check email score**
3. **Warm up your domain** (start with low volume)

### Bounces/Complaints:

1. **Set up SNS topic for bounce notifications**
2. **Monitor SES reputation dashboard**
3. **Remove invalid addresses from your list**

---

## Summary

You now have:

✅ AWS SES mailer implementation
✅ 3 branded email templates (confirmation, cancellation, reschedule)
✅ Dynamic branding from database
✅ Branding settings UI
✅ Database schema with branding fields
✅ Fully integrated notification service

**Next Steps:**
1. Create IAM user and get AWS credentials
2. Verify your domain in SES
3. Add AWS credentials to `.env`
4. Run database migration
5. Test with your email
6. Deploy branding settings UI
7. Request production access from AWS
8. Go live!

**Estimated Setup Time:** 2-3 hours (including AWS verification wait time)
