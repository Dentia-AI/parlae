# PMS Integration - Final User-Friendly Design

## ✅ Changes Made

### 1. **Simplified User Experience**
Users no longer need to manually enter API credentials. Instead:

**Step 1**: Click "Open Integration Page" button
- Opens your Sikka marketplace link in new tab
- User registers/installs from there

**Step 2**: Follow email instructions
- User receives setup instructions via email
- Installs utility on their server
- System automatically connects

**Step 3**: Verify connection
- User returns to Parlae
- Clicks "Check Connection"
- System verifies PMS is connected
- Shows available features

### 2. **Fixed Import Errors**
- Corrected path: `../../../_lib/server/load-user-workspace` (3 levels up from pms folder)
- Component path: `../_components/pms-setup-wizard` (1 level up to setup folder)

### 3. **Backend Handles Credentials**
Since you handle the Sikka integration on your end:
- Your backend receives webhook from Sikka when user connects
- Your backend stores encrypted credentials automatically
- User never sees or enters API keys manually

## 🎯 User Flow

```
1. User navigates to /home/agent/setup/integrations
   ↓
2. Clicks "Connect PMS" button
   ↓
3. Redirected to /home/agent/setup/pms
   ↓
4. Sees simple 3-step instruction page:
   • Click "Open Integration Page" (opens your Sikka link)
   • Follow email instructions
   • Return and click "Check Connection"
   ↓
5. System verifies connection automatically
   ↓
6. Shows "Connected!" with available features
   ↓
7. Clicks "Continue" → proceeds to phone setup
```

## 🔧 What You Need to Provide

### Sikka Marketplace URL
Update this line in the wizard:

```typescript
// apps/frontend/apps/web/app/home/(user)/agent/setup/_components/pms-setup-wizard.tsx
const sikkaUrl = 'https://marketplace.sikkasoft.com/parlae-ai'; // ← Replace with your actual URL
```

### Backend Webhook Handler
When Sikka calls your webhook after user connects:

```typescript
// Example: /api/pms/sikka-webhook/route.ts
export async function POST(request: NextRequest) {
  const body = await request.json();
  
  // Extract from Sikka webhook:
  const {
    practiceId,
    clientId,
    clientSecret,
    accountEmail, // To match with your user
  } = body;
  
  // Find user account by email
  const account = await prisma.account.findFirst({
    where: { email: accountEmail },
  });
  
  // Store encrypted credentials
  await fetch('/api/pms/setup', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'SIKKA',
      credentials: { clientId, clientSecret, practiceId },
      config: { /* defaults */ },
    }),
  });
  
  // Send confirmation email to user
  // ...
}
```

## 📧 Email Template

When user completes Sikka registration, send them:

```
Subject: PMS Integration Setup Complete

Hi [User Name],

Great news! Your practice management system has been successfully connected to Parlae AI.

Your AI receptionist can now:
✅ Book and manage appointments automatically
✅ Look up patient information
✅ Verify insurance
✅ Process payments
✅ Add notes to patient records

Next Steps:
1. Return to Parlae AI setup
2. Click "Check Connection" to verify
3. Continue with phone setup

If you have any questions, reply to this email.

Best regards,
Parlae AI Team
```

## 🎨 Updated UI

The wizard now shows:

```
┌─────────────────────────────────────────────────────┐
│ Connect Your Practice Management System             │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Follow these simple steps:                          │
│                                                     │
│ ① Visit Our Integration Marketplace                │
│   Click below to open our secure connection page   │
│   [Open Integration Page →]                        │
│                                                     │
│ ② Register & Install                                │
│   Follow on-screen instructions and install        │
│   📧 Setup instructions sent to: user@example.com  │
│                                                     │
│ ③ Verify Connection                                 │
│   Once installed, click to verify                  │
│   [Check Connection]                               │
│                                                     │
│ What You'll Get:                                    │
│ ✓ Automated appointment booking                    │
│ ✓ Patient lookup & management                      │
│ ✓ Insurance verification                           │
│ ✓ Payment processing                               │
│                                                     │
│ [← Back]              [Skip for Now]  [Continue →] │
└─────────────────────────────────────────────────────┘
```

## 🔗 Integration Architecture

```
User clicks "Open Integration Page"
  ↓
Opens: https://marketplace.sikkasoft.com/parlae-ai
  ↓
User registers practice with Sikka
  ↓
User installs Sikka utility on their server
  ↓
Sikka calls your webhook: POST /api/pms/sikka-webhook
  ↓
You store encrypted credentials in database
  ↓
User returns to Parlae, clicks "Check Connection"
  ↓
GET /api/pms/setup returns active integration
  ↓
Shows "Connected!" ✅
```

## 📋 Files Updated

1. ✅ `apps/frontend/apps/web/app/home/(user)/agent/setup/pms/page.tsx`
   - Fixed import paths (3 levels up)
   - Passes accountEmail to wizard
   
2. ✅ `apps/frontend/apps/web/app/home/(user)/agent/setup/_components/pms-setup-wizard.tsx`
   - Simplified to instruction page
   - No manual credential entry
   - Auto-checks connection status
   - Opens marketplace link

3. ✅ `apps/frontend/apps/web/app/home/(user)/agent/setup/integrations/page.tsx`
   - Shows PMS as real option (not coming soon)

## 🚀 Next Steps

1. **Provide Your Sikka Marketplace URL**
   - Update `sikkaUrl` in the wizard component
   
2. **Create Webhook Handler** (optional)
   - `/api/pms/sikka-webhook/route.ts`
   - Receives notification when user connects
   - Stores credentials automatically

3. **Test the Flow**
   - Navigate to `/home/agent/setup/integrations`
   - Click "Connect PMS"
   - Verify instructions display correctly
   - Test "Check Connection" button

---

**Status**: ✅ Import errors fixed, simplified to user-friendly registration flow!
