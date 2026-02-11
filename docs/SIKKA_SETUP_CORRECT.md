# Sikka API Setup - Correct Credentials

## ✅ Fixed: Correct Credential Format

Based on the official Sikka documentation, the correct credential format is:

### Sikka Credentials (OAuth 2.0)
```typescript
{
  clientId: string,      // Your Client ID from Sikka Dashboard
  clientSecret: string,  // Generated from Sikka Dashboard
  practiceId?: string    // Optional: practice identifier
}
```

**NOT** `applicationId` and `secretKey` (that was incorrect).

## 🔧 How Users Get Sikka Credentials

### Step 1: Access Sikka Dashboard
1. Log into your Sikka account
2. Navigate to the **Applications** menu

### Step 2: Get Client ID
- Your **Client ID** is assigned when your account is created
- It's visible in the Applications section

### Step 3: Generate Client Secret
1. Select "**New Secret**"
2. Give your secret a helpful name
3. Click "**Create**"
4. **Important**: Save the Client Secret immediately - it's only shown once!

### Step 4: Enter in Parlae Setup
1. Go to Parlae AI → Setup → Integrations
2. Click "Connect PMS"
3. Enter your Client ID and Client Secret
4. Test connection
5. Complete setup

## 🔐 Security Notes

### Client Secret Management
- Secrets expire **2 years after issuance** (by default)
- Rotation is recommended more frequently
- You can maintain **two secrets per application** for rotation without downtime
- Revoke old secrets after updating your integration

### OAuth 2.0 Flow
Sikka uses **Client Credentials Grant**:

```
POST /auth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
client_id=<your_client_id>
client_secret=<your_client_secret>
```

Response:
```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

## 📋 Updated Files

### Frontend:
1. ✅ `apps/frontend/apps/web/app/home/(user)/agent/setup/pms/page.tsx`
   - Fixed import path (was `../../`, now `../`)
   
2. ✅ `apps/frontend/apps/web/app/home/(user)/agent/setup/_components/pms-setup-wizard.tsx`
   - Changed `applicationId` → `clientId`
   - Changed `secretKey` → `clientSecret`
   - Added helpful setup instructions
   
### Backend:
3. ✅ `apps/frontend/packages/shared/src/pms/types.ts`
   - Updated `SikkaCredentials` interface
   
4. ✅ `apps/frontend/packages/shared/src/pms/sikka.service.ts`
   - Updated OAuth 2.0 authentication flow
   - Proper grant_type and credential format
   
5. ✅ `apps/frontend/packages/shared/src/pms/index.ts`
   - Updated credential validation

## 🎯 User Experience

### What Users See:
```
Step 1: Connect Your Practice Management System
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ℹ️ You'll need API credentials from your practice management 
   system. If you don't have these yet, contact your PMS 
   provider or check their developer/integration settings.

Client ID *
┌────────────────────────────────────────────┐
│ Enter your client ID                       │
└────────────────────────────────────────────┘
Found in your PMS API/integration dashboard

Client Secret *
┌────────────────────────────────────────────┐
│ •••••••••••••••••••••                     │
└────────────────────────────────────────────┘
Keep this secure - generate a new one from your 
PMS dashboard if needed

Practice ID (Optional)
┌────────────────────────────────────────────┐
│ Enter practice ID if applicable            │
└────────────────────────────────────────────┘
Leave blank if you only have one practice location

🔒 Your credentials are encrypted with AES-256 before 
   being stored in our secure database
```

## ✅ Testing

### Test Credentials (Sandbox)
When you get sandbox credentials from Sikka, they will provide:
- Test Client ID
- Test Client Secret
- Test Practice ID (if applicable)

Enter these in the setup wizard to test the integration.

### Production Credentials
Once testing is complete, generate production credentials from your Sikka production dashboard and update in Parlae settings.

## 📖 References

- [Sikka Authentication Docs](https://docs.sikoia.com/docs/authentication)
- [Sikka API Developer Portal](https://help.sikka.ai/api-developer-portal)
- [Sikka FAQs](https://help.sikka.ai/sikka-one-api-frequently-asked-questions)

---

**Last Updated**: 2026-02-07
**Status**: ✅ Fixed and Updated
