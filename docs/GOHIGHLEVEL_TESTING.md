# GoHighLevel Integration Testing Guide

This guide will help you test the GoHighLevel CRM integration with Dentia.

## Prerequisites

Before testing, ensure you have:

1. ✅ GoHighLevel account with API access
2. ✅ API Key from GoHighLevel
3. ✅ Location ID from GoHighLevel
4. ✅ Local development environment set up

## Setup for Testing

### Step 1: Configure Environment Variables

Add your GoHighLevel credentials to your local environment:

**Option A: Using .env.local (Recommended for Local Dev)**

```bash
# In apps/frontend/.env.local
GHL_API_KEY=your-actual-api-key-here
GHL_LOCATION_ID=your-actual-location-id-here
```

**Option B: Using Environment Variables**

```bash
export GHL_API_KEY=your-actual-api-key-here
export GHL_LOCATION_ID=your-actual-location-id-here
```

### Step 2: Restart Development Server

If the server is already running, restart it to pick up the new environment variables:

```bash
cd apps/frontend
pnpm run dev
```

You should see logs confirming the integration is enabled.

## Test Scenarios

### Test 1: New User Registration (Basic)

**Objective**: Verify that a new user is synced to GoHighLevel with the "registered user" tag.

**Steps**:

1. **Clear Browser Data** (optional, for clean test):
   ```
   - Open Chrome DevTools (F12)
   - Application > Clear site data
   ```

2. **Navigate to Sign Up**:
   ```
   http://localhost:3000/auth/sign-up
   ```

3. **Fill Out Registration Form**:
   - Full Name: `Test User One`
   - Email: `testuser1@example.com` (use a unique email)
   - Password: `TestPassword123!`
   - Confirm Password: `TestPassword123!`

4. **Submit Form**

5. **Check Logs** for GHL activity:
   ```
   [GoHighLevel] Upserting contact
   [GoHighLevel] Contact upserted successfully
   ```

6. **Verify in GoHighLevel**:
   - Log in to GoHighLevel
   - Navigate to Contacts
   - Search for `testuser1@example.com`
   - Verify contact exists with:
     - ✅ First Name: `Test`
     - ✅ Last Name: `User One`
     - ✅ Email: `testuser1@example.com`
     - ✅ Tags: `registered user` + subdomain tag + domain tag
       - Example: `["registered user", "main-app-signup", "domain-dentiaapp-com"]`
     - ✅ Source: `Dentia App Registration`

**Expected Result**: ✅ Contact created in GoHighLevel with correct data and domain-based tags

---

### Test 2: Existing Contact (Upsert Behavior)

**Objective**: Verify that the upsert functionality merges tags without replacing existing data.

**Steps**:

1. **Manually Create Contact in GoHighLevel**:
   - Email: `existing@example.com`
   - First Name: `Existing`
   - Last Name: `Contact`
   - Tags: `newsletter subscriber`, `lead`
   - Custom Field: Add any custom field

2. **Register in Dentia** with the same email:
   - Full Name: `Existing Contact`
   - Email: `existing@example.com`
   - Password: `TestPassword123!`

3. **Verify in GoHighLevel** that the contact:
   - ✅ Still has original name (`Existing Contact`)
   - ✅ Has ALL tags: `newsletter subscriber`, `lead`, `registered user`, plus domain tags
     - Example: `["newsletter subscriber", "lead", "registered user", "main-app-signup", "domain-dentiaapp-com"]`
   - ✅ Custom fields are preserved
   - ✅ Source updated to: `Dentia App Registration`

**Expected Result**: ✅ Existing data preserved, tags merged (including new domain tags), not replaced

---

### Test 3: Different Name Format

**Objective**: Verify name parsing works correctly.

**Test Cases**:

| Full Name Input      | Expected First | Expected Last       |
|---------------------|----------------|---------------------|
| `John`              | `John`         | ` ` (empty)         |
| `John Doe`          | `John`         | `Doe`               |
| `Mary Jane Watson`  | `Mary`         | `Jane Watson`       |
| `Dr. John Smith Jr.`| `Dr.`          | `John Smith Jr.`    |

**Steps for Each**:
1. Register with the test name
2. Check GoHighLevel contact
3. Verify first/last name split

**Expected Result**: ✅ Names parsed correctly (first word = first name, rest = last name)

---

### Test 4: Domain-Based Tagging

**Objective**: Verify that contacts are tagged based on the domain and subdomain they register from.

**Test Scenarios**:

| Domain/URL                  | Expected Tags                                                          |
|-----------------------------|------------------------------------------------------------------------|
| `hub.dentiaapp.com`        | `registered user`, `hub-signup`, `domain-dentiaapp-com`               |
| `www.dentiaapp.com`        | `registered user`, `main-app-signup`, `domain-dentiaapp-com`          |
| `hub.dentia.ca`            | `registered user`, `hub-signup`, `domain-dentia-ca`                   |
| `www.dentia.ca`            | `registered user`, `main-app-signup`, `domain-dentia-ca`              |
| `hub.dentia.co`            | `registered user`, `hub-signup`, `domain-dentia-co`                   |
| `www.dentia.co`            | `registered user`, `main-app-signup`, `domain-dentia-co`              |
| `hub.dentia.app`           | `registered user`, `hub-signup`, `domain-dentia-app`                  |
| `www.dentia.app`           | `registered user`, `main-app-signup`, `domain-dentia-app`             |

**Steps**:

1. **Test Each Domain** (can do via browser or curl):
   
   For browser testing:
   - Access the signup page from each domain
   - Complete registration
   
   For API testing:
   ```bash
   curl -X POST http://localhost:3000/api/auth/sign-up \
     -H "Host: hub.dentiaapp.com" \
     -H "Content-Type: application/json" \
     -d '{
       "fullName": "Hub Test User",
       "email": "hubtest@example.com",
       "password": "TestPassword123!",
       "confirmPassword": "TestPassword123!"
     }'
   ```

2. **Check Logs** for tag information:
   ```
   [GoHighLevel] Upserting contact
   tags: ["registered user", "hub-signup", "domain-dentiaapp-com"]
   ```

3. **Verify in GoHighLevel**:
   - Contact has correct subdomain tag (`hub-signup` or `main-app-signup`)
   - Contact has correct domain tag (e.g., `domain-dentiaapp-com`)

**Expected Result**: ✅ Contacts tagged correctly based on registration domain

**Use Cases**:
- Track which platform users prefer (hub vs main app)
- Segment users by geographic domain (.ca vs .com vs .co)
- Analyze conversion rates by domain
- Create targeted campaigns based on registration source

---

### Test 5: Missing Configuration (Integration Disabled)

**Objective**: Verify graceful degradation when GHL is not configured.

**Steps**:

1. **Remove Environment Variables**:
   ```bash
   # Comment out or remove from .env.local
   # GHL_API_KEY=...
   # GHL_LOCATION_ID=...
   ```

2. **Restart Server**:
   ```bash
   pnpm run dev
   ```

3. **Check Logs** for warning:
   ```
   [GoHighLevel] Integration disabled - missing configuration
   ```

4. **Register a New User**:
   - Use email: `noghl@example.com`
   - Complete registration

5. **Verify**:
   - ✅ User registration succeeds
   - ✅ No GoHighLevel API calls made
   - ✅ Warning logged but no errors

**Expected Result**: ✅ User signup works normally, GHL integration skipped gracefully

---

### Test 6: API Error Handling

**Objective**: Verify that GHL API errors don't break user signup.

**Steps**:

1. **Use Invalid API Key**:
   ```bash
   # In .env.local
   GHL_API_KEY=invalid-key-for-testing
   GHL_LOCATION_ID=your-actual-location-id
   ```

2. **Restart Server**

3. **Register a User**:
   - Email: `errortest@example.com`

4. **Check Logs** for error:
   ```
   [GoHighLevel] Failed to upsert contact
   [Auth][SignUpAPI] GoHighLevel sync failed (non-critical)
   ```

5. **Verify**:
   - ✅ User registration completed successfully
   - ✅ User can log in
   - ✅ Error logged but didn't crash
   - ✅ Contact NOT in GoHighLevel

**Expected Result**: ✅ Signup succeeds despite GHL error

---

### Test 7: Employee Invitation Signup

**Objective**: Verify GHL sync works for employees joining via invitation.

**Steps**:

1. **Create Team Account** (as account manager)
2. **Invite Employee**:
   - Email: `employee@example.com`
3. **Accept Invitation** (as new user):
   - Click invitation link
   - Complete signup with name: `New Employee`
4. **Verify in GoHighLevel**:
   - Contact created with email: `employee@example.com`
   - Tag: `registered user`
   - Source: `Dentia App Registration`

**Expected Result**: ✅ Employee contacts also synced to GHL

---

## Monitoring and Debugging

### View Logs

**Development Server Logs**:
```bash
cd apps/frontend
pnpm run dev

# Look for log entries with [GoHighLevel] prefix
```

**Key Log Messages**:

✅ **Success**:
```
[GoHighLevel] Upserting contact
[GoHighLevel] Contact upserted successfully
```

⚠️ **Integration Disabled**:
```
[GoHighLevel] Integration disabled - missing configuration
```

❌ **Error**:
```
[GoHighLevel] Failed to upsert contact
[Auth][SignUpAPI] GoHighLevel sync failed (non-critical)
```

### Check GoHighLevel API Logs

1. Log in to GoHighLevel
2. Go to **Settings** → **API Logs**
3. Filter by your API key
4. Review requests from Dentia

### Common Issues

#### Issue: Contact Not Appearing in GHL

**Possible Causes**:
1. Integration disabled (check env vars)
2. API error (check logs)
3. Wrong location ID
4. Rate limiting

**Debug Steps**:
```bash
# Check if integration is enabled
# Should see "enabled: true" in logs

# Verify environment variables are set
cat apps/frontend/.env.local | grep GHL

# Test API key directly
curl -X GET "https://services.leadconnectorhq.com/locations" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

#### Issue: Tags Not Merging

**Expected Behavior**: 
- Upsert should MERGE tags, not replace them
- Existing tags should remain

**If tags are replaced**:
- This could be a GHL API change
- Check GoHighLevel API documentation
- May need to update the service implementation

#### Issue: Name Not Parsed Correctly

**Current Logic**:
- First word → First Name
- Rest → Last Name

**If different parsing needed**:
- Update the `buildContactPayload` method in `gohighlevel.service.ts`
- Add custom name parsing logic

## Performance Testing

### Test High Volume Signups

**Objective**: Ensure GHL integration doesn't slow down signups.

**Steps**:

1. **Measure Baseline** (without GHL):
   - Disable GHL integration
   - Time 10 signups
   - Average: ~X seconds

2. **Measure with GHL** (with GHL enabled):
   - Enable GHL integration
   - Time 10 signups
   - Average: should be ~same (non-blocking)

3. **Verify**:
   - ✅ Signup response time not affected
   - ✅ GHL sync happens in background
   - ✅ No blocking behavior

**Expected Result**: ✅ GHL integration is non-blocking, doesn't slow signups

---

## Production Checklist

Before deploying to production:

- [ ] Test all scenarios above in staging
- [ ] Verify API key permissions
- [ ] Set up monitoring for GHL errors
- [ ] Document rollback procedure
- [ ] Test rate limiting behavior
- [ ] Verify tag merge behavior
- [ ] Test with production GoHighLevel account
- [ ] Set up alerts for integration failures
- [ ] Document API key rotation procedure
- [ ] Test with real user emails

## Security Verification

- [ ] API key not exposed to client
- [ ] API key not in git history
- [ ] API key in secure storage (AWS Parameter Store, etc.)
- [ ] Logs don't expose sensitive data
- [ ] Error messages are generic to users
- [ ] Only server-side code has access to GHL

## Advanced Testing

### Test Custom Tags

To add additional tags beyond "registered user":

```typescript
// In gohighlevel.service.ts, modify syncRegisteredUser:
tags: ['registered user', 'app-user', 'active']
```

### Test Custom Fields

To sync additional data:

```typescript
customFields: {
  'signup_source': 'web',
  'plan_type': 'free',
  'user_id': params.userId
}
```

### Test Different Contact Sources

To differentiate signup types:

```typescript
source: inviteToken ? 'Employee Invitation' : 'Direct Registration'
```

## Rollback Procedure

If integration causes issues:

1. **Disable Immediately**:
   ```bash
   # Remove or comment out env vars
   # GHL_API_KEY=
   # GHL_LOCATION_ID=
   ```

2. **Redeploy** (if in production)

3. **Investigate** using logs

4. **Fix and Re-enable** when ready

## Success Criteria

Integration is working correctly when:

- ✅ New users are synced to GoHighLevel
- ✅ "registered user" tag is added
- ✅ Existing contacts have tags merged (not replaced)
- ✅ User signup succeeds even if GHL fails
- ✅ No sensitive data exposed
- ✅ Logs show clear status messages
- ✅ Performance is not impacted

---

## Support

For issues:

1. Check logs for `[GoHighLevel]` entries
2. Review `GOHIGHLEVEL_INTEGRATION.md` for configuration help
3. Test API key directly with curl
4. Check GoHighLevel API status page
5. Contact GoHighLevel support if API issues persist

---

**Last Updated**: November 2025  
**Version**: 1.0.0

