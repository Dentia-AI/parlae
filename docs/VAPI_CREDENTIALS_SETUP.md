# How to Create Vapi Custom Credentials

## Step 1: Create Bearer Token Credential in Vapi Dashboard

1. **Go to Vapi Dashboard:**
   - Navigate to: https://dashboard.vapi.ai/credentials
   - Or click "Credentials" in the left sidebar

2. **Create New Credential:**
   - Click **"Create Credential"** button
   - Select **"Bearer Token"** as the authentication type

3. **Fill in the details:**
   ```
   Credential Name: PMS Webhook Secret
   Token: parlae-vapi-webhook-secret-change-in-production
   ```

4. **Save and Copy ID:**
   - Click "Create"
   - Copy the credential ID (format: `cred_abc123...`)
   - You'll need this ID in the script

---

## Step 2: Update Script to Use Credential ID

Once you have the credential ID, update the setup script:

```bash
# Open the script
nano scripts/setup-vapi-pms-tools.js

# Update this line near the top:
const CREDENTIAL_ID = 'YOUR_CREDENTIAL_ID_HERE';  // e.g., cred_abc123...

# Then in each tool's server config, replace:
server: {
  url: '...',
  timeoutSeconds: 15,
  headers: {
    'X-Vapi-Secret': VAPI_SECRET
  }
}

# With:
server: {
  url: '...',
  timeoutSeconds: 15,
  credentialId: CREDENTIAL_ID
}
```

---

## Step 3: Run Updated Script

```bash
# Recreate tools with credential ID
node scripts/setup-vapi-pms-tools.js local
```

---

## What NOT to Create

You mentioned Vapi is asking for OAuth 2.0 credentials. **You do NOT need OAuth 2.0** for this use case.

### ❌ OAuth 2.0 (Not Needed)
- Token URL
- Client ID
- Client Secret  
- Scope

These are for authenticating **TO** external services (like when Vapi calls Google Calendar).

### ✅ Bearer Token (What You Need)
- Credential Name: `PMS Webhook Secret`
- Token: `parlae-vapi-webhook-secret-change-in-production`

This is for authenticating **FROM** Vapi to your server.

---

## How It Works

### With Bearer Token Credential:

1. **You create credential in Vapi dashboard:**
   ```
   Name: PMS Webhook Secret
   Type: Bearer Token
   Token: parlae-vapi-webhook-secret-change-in-production
   ```

2. **You reference it in tool config:**
   ```javascript
   server: {
     url: 'https://your-api.com/endpoint',
     credentialId: 'cred_abc123'
   }
   ```

3. **Vapi automatically sends the token:**
   - When tool is called, Vapi sends:
   ```
   Authorization: Bearer parlae-vapi-webhook-secret-change-in-production
   ```

4. **Your API validates:**
   ```typescript
   const auth = request.headers.get('Authorization');
   if (auth !== `Bearer ${process.env.VAPI_WEBHOOK_SECRET}`) {
     return 401;
   }
   ```

---

## Alternative: Keep Using Headers (Simpler)

If you don't want to create credentials, the current setup with inline headers works fine:

```javascript
server: {
  url: '...',
  headers: {
    'X-Vapi-Secret': 'parlae-vapi-webhook-secret-change-in-production'
  }
}
```

**Pros:**
- ✅ Simpler, no dashboard config needed
- ✅ Works immediately

**Cons:**
- ❌ Secret visible in tool config
- ❌ Harder to rotate secrets (need to update all tools)

---

## Recommendation

**For local/dev:** Keep using inline headers (current setup)

**For production:** Create Bearer Token credential in dashboard

This gives you:
- ✅ Centralized secret management
- ✅ Easy secret rotation
- ✅ Better security (token not in tool config)
- ✅ Reusable across multiple tools

---

## Need Help?

If you want to use credential ID, just:
1. Create the Bearer Token credential in dashboard
2. Send me the credential ID
3. I'll update the script to use it
