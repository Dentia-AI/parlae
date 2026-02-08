# GHL Phase 1 - Testing Guide

## Prerequisites

### 1. Start Docker Desktop
```bash
# Make sure Docker Desktop is running
docker ps
```

### 2. Start Development Environment
```bash
cd /Users/shaunk/Projects/dentia/dentia
./dev.sh
```

Wait for all services to start:
- ✅ PostgreSQL (port 5433)
- ✅ LocalStack (port 4567)
- ✅ Backend (port 4001)
- ✅ Frontend (port 3000)

## Quick Test (5 minutes)

### Test 1: Backend Health Check
```bash
curl http://localhost:4001/health
# Expected: {"status":"ok"}
```

### Test 2: Check Sub-Account Endpoint (No Auth)
```bash
curl http://localhost:4001/ghl/sub-accounts/my
# Expected: 401 Unauthorized (correct - requires auth)
```

### Test 3: Frontend Access
Open browser: `http://localhost:3000`
- Should see the application homepage

### Test 4: Navigate to AI Agent Setup
Open: `http://localhost:3000/home/ai-agent/setup`

**Expected UI:**
- Progress indicator showing 5 steps
- "Business Details" form
- Required field: Business Name
- Optional fields: Industry, Email, Phone, Address, etc.

### Test 5: Fill Out Form

**Enter:**
- Business Name: "Test Dental Clinic 123"
- Industry: "Dental"
- Email: test@testdental.com
- Phone: (555) 987-6543
- Website: https://testdental.com
- Address: 456 Test Ave
- City: Los Angeles
- State: CA
- ZIP: 90001
- Timezone: Pacific Time (PT)

### Test 6: Submit Form

Click "Continue to Voice Selection"

**Expected Results:**
1. ⏳ Loading spinner appears
2. 🎉 Toast notification: "Business details saved successfully!"
3. ↗️ Redirects to: `/home/ai-agent/setup/voice`
4. 📄 Voice page shows "This feature is coming in Phase 2"

### Test 7: Verify in Database

```bash
psql postgresql://dentia:dentia@localhost:5433/dentia -c "SELECT id, business_name, ghl_location_id, status, setup_step FROM ghl_sub_accounts ORDER BY created_at DESC LIMIT 1;"
```

**Expected Output:**
```
                  id                  |    business_name      |   ghl_location_id    | status | setup_step
--------------------------------------+-----------------------+---------------------+--------+------------
 <uuid>                               | Test Dental Clinic 123| <ghl-location-id>   | active |     1
```

### Test 8: Verify in GoHighLevel

1. Log in: https://app.gohighlevel.com
2. Go to **Locations** or **Sub-Accounts** menu
3. Search for "Test Dental Clinic 123"
4. Verify:
   - ✅ Name matches
   - ✅ Email: test@testdental.com
   - ✅ Phone: (555) 987-6543
   - ✅ Address matches
   - ✅ Timezone: America/Los_Angeles

### Test 9: Test API Endpoints (With Auth)

After logging in, get your auth cookie from browser DevTools.

**Get my sub-account:**
```bash
curl http://localhost:4001/ghl/sub-accounts/my \
  -H "Cookie: your-session-cookie" \
  --include
```

**Expected:** JSON with your sub-account data

## Error Testing

### Test 10: Validation Errors

Try submitting form without required field:
1. Leave "Business Name" empty
2. Click submit
3. **Expected:** Red error message "Business name is required"

### Test 11: Invalid Email

1. Enter invalid email: "notanemail"
2. Click submit  
3. **Expected:** "Invalid email format"

### Test 12: Duplicate Sub-Account

Try creating another sub-account with same business:
**Expected:** Should work (allows multiple sub-accounts per user)

## Cleanup After Testing

### Delete Test Sub-Account from Database
```bash
psql postgresql://dentia:dentia@localhost:5433/dentia -c "DELETE FROM ghl_sub_accounts WHERE business_name LIKE 'Test%';"
```

### (Optional) Delete from GHL Dashboard
Manually delete "Test Dental Clinic 123" from GHL web interface.

## Troubleshooting

### Issue: "Failed to create sub-account"

**Check:**
1. GHL API key is valid in `.env.local`
2. Backend logs: `tail -f logs/backend.log`
3. Look for `[GoHighLevel]` or `[GhlSubAccount]` log entries

### Issue: "Unauthorized" error

**Fix:** You need to be logged in. Go to `/auth/sign-in` first.

### Issue: Form doesn't submit

**Check browser console:**
- F12 → Console tab
- Look for JavaScript errors
- Check Network tab for failed API calls

### Issue: Backend not responding

**Restart:**
```bash
cd /Users/shaunk/Projects/dentia/dentia
./cleanup.sh
./dev.sh
```

## Success Criteria

✅ Form loads without errors  
✅ Validation works correctly  
✅ Sub-account creates in GHL  
✅ Sub-account saves to database  
✅ Redirects to next step  
✅ Data visible in GHL dashboard  
✅ API endpoints respond correctly  

---

**Phase 1 is complete when all tests pass!** ✅

Ready for Phase 2: Voice Agent Configuration
