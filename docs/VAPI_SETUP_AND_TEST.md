# Vapi Setup and Testing Guide

## ✅ What's Been Configured

1. **Environment Variables Added** to `.env.local`:
   ```bash
   VAPI_API_KEY=your-vapi-private-key
   NEXT_PUBLIC_VAPI_PUBLIC_KEY=your-vapi-public-key
   VAPI_SERVER_SECRET=your-random-secret-string-here
   TWILIO_ACCOUNT_SID=your-twilio-account-sid
   TWILIO_AUTH_TOKEN=your-twilio-auth-token
   NEXT_PUBLIC_APP_BASE_URL=https://your-app.ngrok-free.dev
   ```

2. **Database Migration Created**:
   - File: `/packages/prisma/migrations/20260131000000_add_vapi_integration/migration.sql`
   - Creates 5 new tables for Vapi integration
   - Seeds 3 squad templates + 2 assistant templates

3. **Admin UI Created**:
   - Setup page: `/admin/setup-vapi`
   - Link added to admin dashboard

4. **API Endpoint Created**:
   - `/api/vapi/setup-test-agent` - Creates assistant + purchases phone

---

## 🚀 Step 1: Run Database Migration

```bash
cd /Users/shaunk/Projects/Parlae-AI/parlae

# Run migration
cd packages/prisma
npx prisma migrate deploy

# Or if you want to run in dev mode:
npx prisma migrate dev
```

**Expected Output:**
```
✔ Migration complete
```

**Verify Migration:**
```bash
npx prisma db execute --stdin <<'SQL'
SELECT * FROM vapi_squad_templates;
SQL
```

You should see 3 rows (dental-clinic, sales-pipeline, support-triage).

---

## 🚀 Step 2: Start Development Server

```bash
cd /Users/shaunk/Projects/Parlae-AI/parlae

# Make sure ngrok is running (for webhooks)
# Terminal 1:
ngrok http 3000

# Terminal 2: Start dev server
npm run dev
# or
pnpm dev
```

**Wait for:**
```
✔ Ready in 5s
○ Local: http://localhost:3000
```

---

## 🚀 Step 3: Login to Admin

1. Open browser: http://localhost:3000
2. Login with your admin credentials
3. Navigate to: http://localhost:3000/admin

You should see the admin dashboard with a new card:
```
📱 AI Voice Agents
[Setup Test Agent]
```

---

## 🚀 Step 4: Setup Your First Agent

1. Click **"Setup Test Agent"** button
2. Wait 30-60 seconds (you'll see a loading spinner)
3. When complete, you'll see:

```
✅ Success! Your test agent is ready to use.

Your Phone Number
+1-415-XXX-XXXX

Test Instructions
1. Call the Number
   Use your mobile phone to call: +1-415-XXX-XXXX

2. Test Script
   - Say: "Hi, my name is John Doe"
   - Say: "My email is john@example.com"
   - Say: "Can you help me with a question?"

3. Expected Behavior
   - AI answers immediately with greeting
   - Responds naturally to your questions
   - Acknowledges your name and email
   - Records the full conversation

4. Check Logs
   Watch your terminal for webhook events from Vapi
```

---

## 🧪 Step 5: Test the Phone Call

### Make the Call

Use your mobile phone to call the number shown on the setup page.

### What Should Happen

**1. Immediate Answer:**
```
AI: "Thank you for calling! This is a test. How can I help you today?"
```

**2. Say Your Name:**
```
You: "Hi, my name is John Doe"
AI: "Thank you, John! How can I help you today?"
```

**3. Give Email:**
```
You: "My email is john@example.com"
AI: "Got it, john@example.com. What can I assist you with?"
```

**4. Ask a Question:**
```
You: "What are your hours?"
AI: "I'm a test agent, so I don't have specific business hours, 
     but I'm here to help you test the system. Is there anything 
     else you'd like to know?"
```

**5. End Call:**
```
You: "That's all, thanks!"
AI: "You're welcome! Have a great day!"
```

---

## 📊 Step 6: Verify Everything Worked

### Check 1: Terminal Logs

In your dev server terminal, you should see webhook events:

```
[Vapi Webhook] Call starting - callId: call_abc123
[Vapi Webhook] Status update: in-progress
[Vapi Webhook] End-of-call report received
[Vapi Webhook] Transcript: "Hi, my name is John Doe..."
[Vapi Webhook] Analysis: {
  customerName: "John Doe",
  email: "john@example.com",
  sentiment: "positive"
}
```

### Check 2: Vapi Dashboard

1. Go to: https://dashboard.vapi.ai/
2. Click "Calls" in sidebar
3. You should see your test call
4. Click on it to view:
   - Full transcript
   - Recording (if enabled)
   - Extracted data
   - Call duration and cost

### Check 3: Twilio Console

1. Go to: https://console.twilio.com/
2. Click "Phone Numbers" > "Manage" > "Active Numbers"
3. You should see your purchased number
4. Click on it to see:
   - Number details
   - Usage stats
   - Configuration (should point to Vapi)

---

## ✅ Success Criteria

Your integration is working if:

- ✅ Phone number was purchased successfully
- ✅ AI answered your call immediately
- ✅ AI greeted you with the first message
- ✅ AI responded naturally to your questions
- ✅ AI acknowledged your name and email
- ✅ Webhook events appeared in terminal
- ✅ Call appears in Vapi dashboard with transcript
- ✅ Extracted data is correct (name, email, sentiment)

---

## 🔧 Troubleshooting

### Issue: "Vapi not configured"

**Solution:**
```bash
# Check .env.local has:
VAPI_API_KEY=your-vapi-private-key

# Restart server:
npm run dev
```

### Issue: "Twilio not configured"

**Solution:**
```bash
# Check .env.local has:
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token

# Restart server:
npm run dev
```

### Issue: "No available phone numbers"

**Solution:**
Try a different area code. Edit the setup page or use the API:

```bash
curl -X POST http://localhost:3000/api/vapi/setup-test-agent \
  -H "Content-Type: application/json" \
  -d '{"areaCode": "212"}'  # Try New York
```

### Issue: Call connects but no AI response

**Possible causes:**
1. Check Vapi Dashboard for errors
2. Verify voice ID is valid
3. Check system prompt isn't empty
4. Verify ngrok URL is correct in env

**Solution:**
```bash
# Check ngrok is running:
curl https://your-ngrok-url.ngrok.io/api/vapi/webhook

# Should return: "Invalid CSRF token" (that's OK - means endpoint exists)

# Check NEXT_PUBLIC_APP_BASE_URL matches ngrok:
echo $NEXT_PUBLIC_APP_BASE_URL
```

### Issue: Webhook not receiving data

**Solution:**
1. Verify ngrok is running: `ngrok http 3000`
2. Update `.env.local` with ngrok URL
3. Restart server: `npm run dev`
4. Test webhook: `curl https://your-ngrok.ngrok.io/api/vapi/webhook`

### Issue: Migration failed

**Solution:**
```bash
# Check if tables already exist:
cd packages/prisma
npx prisma db execute --stdin <<'SQL'
SELECT table_name FROM information_schema.tables 
WHERE table_name LIKE 'vapi_%';
SQL

# If tables exist, migration already ran
# If not, try:
npx prisma migrate deploy
```

---

## 📖 What's Next?

Once your test agent is working:

### 1. Create Production Templates

Edit the seed data in the migration to add your custom squad templates:

```sql
-- Your Custom Dental Office Squad
INSERT INTO "vapi_squad_templates" (...) VALUES (...);
```

### 2. Build UI Wizard for Accounts

Create a user-facing wizard at `/home/ai-agent/setup` that:
- Shows available squad templates
- Lets user select one
- Purchases phone number
- Links to their account

### 3. Add Knowledge Base Management

Create UI for accounts to upload:
- Business hours
- Services offered
- Pricing
- Policies
- FAQs

### 4. View Call History

Create dashboard at `/home/ai-agent/calls` to show:
- All calls for the account
- Transcripts
- Extracted data
- Recordings

### 5. Analytics

Show stats:
- Total calls
- Average call duration
- Sentiment distribution
- Common questions

---

## 🎉 You're Done!

Your Vapi + Twilio integration is now working! The test agent proves:

✅ Vapi API connection works
✅ Twilio phone provisioning works  
✅ Phone number linking works
✅ Webhook delivery works
✅ AI conversation works
✅ Data extraction works
✅ Recording works

**Ready for production!** 🚀

---

## Quick Commands Reference

```bash
# Run migration
cd packages/prisma && npx prisma migrate deploy

# Start dev server
npm run dev

# Check webhook
curl https://your-ngrok-url.ngrok.io/api/vapi/webhook

# Test from CLI (requires session auth - better to use UI)
# Visit: http://localhost:3000/admin/setup-vapi
```

---

**For more details**, see:
- `/docs/VAPI_ARCHITECTURE.md` - Complete architecture guide
- `/docs/VAPI_TESTING_GUIDE.md` - Detailed testing guide
- `/docs/VAPI_ADVANCED_FEATURES.md` - Squads, knowledge base, tools
