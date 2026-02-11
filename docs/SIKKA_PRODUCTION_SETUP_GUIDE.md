# Sikka PMS Integration - Production Setup Guide

## Overview

This guide covers the complete setup of Sikka PMS integration for production, including:
- Authorization flow setup
- Database configuration
- Background job setup
- Monitoring and maintenance

---

## Prerequisites

1. **Sikka Credentials**:
   - Application ID (App-Id)
   - Application Secret Key (App-Key)
   - Access to Sikka API

2. **Infrastructure**:
   - PostgreSQL database (with migrations applied)
   - Node.js runtime for background jobs
   - Cron or task scheduler

3. **Permissions**:
   - Database access (read/write to `pms_integrations`, `pms_writebacks`)
   - API access (to call Sikka API)

---

## Step 1: Database Setup

### 1.1 Apply Migrations

```bash
cd packages/prisma
npx prisma migrate deploy
npx prisma generate
```

### 1.2 Verify Schema

Check that these tables exist:
- `pms_integrations` (with token management fields)
- `pms_writebacks`
- `vapi_phone_numbers`

```sql
-- Verify columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'pms_integrations' 
  AND column_name IN ('request_key', 'refresh_key', 'token_expiry', 'office_id', 'secret_key');
```

---

## Step 2: Environment Variables

Add to your `.env` file:

```bash
# Sikka API Credentials (provided by Sikka)
SIKKA_APP_ID=your_app_id_here
SIKKA_APP_KEY=your_app_key_here

# Database URL (already configured)
DATABASE_URL=postgresql://...

# Optional: Monitoring
SENTRY_DSN=https://...  # For error tracking
SLACK_WEBHOOK_URL=https://hooks.slack.com/...  # For alerts
```

---

## Step 3: Initial Authorization Flow

For each practice that signs up:

### 3.1 User Action (Sikka Marketplace)

1. User visits Sikka marketplace link (provided by you)
2. User registers/installs your application
3. User installs SPU (Sikka Practice Utility) on their practice server
4. Sikka sends webhook to your system with initial credentials

### 3.2 Automatic Setup (Your Backend)

When webhook received:

```typescript
// 1. Get authorized practices
const practices = await fetchAuthorizedPractices(appId, appKey);
const practice = practices[0];

// 2. Generate initial tokens
const tokens = await generateRequestKey(
  appId,
  appKey,
  practice.office_id,
  practice.secret_key
);

// 3. Save to database
await prisma.pmsIntegration.create({
  data: {
    accountId: user.accountId,
    provider: 'SIKKA',
    status: 'ACTIVE',
    credentials: {
      appId,
      appKey,
      requestKey: tokens.request_key,
      refreshKey: tokens.refresh_key,
      officeId: practice.office_id,
      secretKey: practice.secret_key,
    },
    requestKey: tokens.request_key,
    refreshKey: tokens.refresh_key,
    tokenExpiry: new Date(Date.now() + 86400000), // 24 hours
    officeId: practice.office_id,
    secretKey: practice.secret_key,
  },
});
```

---

## Step 4: Background Jobs Setup

### 4.1 Token Refresh Job (Every 23 hours)

**Purpose**: Automatically refresh Sikka request_key tokens before they expire.

**Setup with cron**:

```bash
# Edit crontab
crontab -e

# Add this line (runs at 11 PM daily)
0 23 * * * cd /path/to/parlae && node -e "require('./dist/pms/sikka-token-refresh.service').refreshAllSikkaTokens().then(r => console.log(r))" >> /var/log/sikka-token-refresh.log 2>&1
```

**Setup with systemd timer** (recommended):

Create `/etc/systemd/system/sikka-token-refresh.service`:

```ini
[Unit]
Description=Sikka Token Refresh Service
After=network.target postgresql.service

[Service]
Type=oneshot
User=parlae
WorkingDirectory=/opt/parlae
Environment="NODE_ENV=production"
Environment="DATABASE_URL=postgresql://..."
ExecStart=/usr/bin/node -e "require('./dist/pms/sikka-token-refresh.service').refreshAllSikkaTokens()"
StandardOutput=journal
StandardError=journal
```

Create `/etc/systemd/system/sikka-token-refresh.timer`:

```ini
[Unit]
Description=Sikka Token Refresh Timer
Requires=sikka-token-refresh.service

[Timer]
OnCalendar=*-*-* 23:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable sikka-token-refresh.timer
sudo systemctl start sikka-token-refresh.timer
sudo systemctl status sikka-token-refresh.timer
```

### 4.2 Writeback Polling Job (Every 10 seconds)

**Purpose**: Poll pending writeback operations with smart rate limiting.

**Key Features**:
- ✅ Respects 200 requests/**minute** rate limit per practice
- ✅ 10-second initial delay before first check
- ✅ Polls every 10 seconds for fast confirmation
- ✅ Exponential backoff for stuck operations (10s, 10s, 20s, 30s, 1m, 2m, 5m, 10m, 30m)
- ✅ **Average confirmation time: 20-30 seconds** 🚀

**Setup as a systemd service**:

Create `/etc/systemd/system/sikka-writeback-poll.service`:

```ini
[Unit]
Description=Sikka Writeback Polling Service
After=network.target postgresql.service

[Service]
Type=simple
User=parlae
WorkingDirectory=/opt/parlae
Environment="NODE_ENV=production"
Environment="DATABASE_URL=postgresql://..."
ExecStart=/usr/bin/node dist/pms/sikka-writeback-poll-worker.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Create the worker script `sikka-writeback-poll-worker.js`:

```javascript
// dist/pms/sikka-writeback-poll-worker.js
const { pollSikkaWritebacks } = require('./sikka-writeback.service');

async function poll() {
  try {
    const result = await pollSikkaWritebacks();
    console.log(
      `[${new Date().toISOString()}] ` +
      `Checked: ${result.checked}, Updated: ${result.updated}, ` +
      `Skipped: ${result.skipped}, Rate-limited: ${result.rateLimited}`
    );
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error:`, error);
  }
  
  // Poll again in 10 seconds (fast confirmation with 200/min limit!)
  setTimeout(poll, 10000);
}

// Start polling
console.log('Starting Sikka writeback polling service...');
console.log('Rate limit: 200 req/MINUTE per practice');
console.log('Strategy: 10s initial delay + frequent polling');
poll();
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable sikka-writeback-poll.service
sudo systemctl start sikka-writeback-poll.service
sudo systemctl status sikka-writeback-poll.service
```

View logs:

```bash
sudo journalctl -u sikka-writeback-poll.service -f
```

### 4.3 Low-Traffic Retry Job (During off-hours)

**Purpose**: Retry failed writebacks during low-traffic periods (midnight-6am).

**Setup with cron**:

```bash
# Edit crontab
crontab -e

# Add this line (runs at 2 AM daily)
0 2 * * * cd /opt/parlae && node -e "require('./dist/pms/sikka-writeback.service').retrySikkaWritebacks().then(r => console.log(r))" >> /var/log/sikka-retry.log 2>&1
```

---

## Step 5: API Integration

### 5.1 Using SikkaPmsService

```typescript
import { SikkaPmsService } from '@/shared/pms/sikka.service';

// Load from database
const integration = await prisma.pmsIntegration.findUnique({
  where: { id: pmsIntegrationId },
});

// Create service instance
const service = new SikkaPmsService(
  integration.accountId,
  integration.credentials as SikkaCredentials,
  integration.config || {}
);

// Use the service
const appointments = await service.getAppointments({
  startDate: new Date(),
  endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  limit: 50,
});

if (appointments.success) {
  console.log('Appointments:', appointments.data);
} else {
  console.error('Error:', appointments.error);
}
```

### 5.2 Writeback Operations

```typescript
// Book appointment (async operation)
const result = await service.bookAppointment({
  patientId: '12345',
  providerId: 'DOC1',
  appointmentType: 'Checkup',
  startTime: new Date('2026-02-15T10:00:00'),
  duration: 60,
  notes: 'Annual checkup',
});

// Result will be:
// - success: true if writeback completed successfully
// - success: false if writeback failed or timeout
```

---

## Step 6: Monitoring & Alerts

### 6.1 Token Expiry Monitoring

Add to your monitoring dashboard:

```sql
-- Query: Tokens expiring in next 2 hours
SELECT 
  id,
  account_id,
  office_id,
  token_expiry,
  EXTRACT(EPOCH FROM (token_expiry - NOW())) / 3600 AS hours_until_expiry
FROM pms_integrations
WHERE provider = 'SIKKA'
  AND status = 'ACTIVE'
  AND token_expiry < NOW() + INTERVAL '2 hours';
```

**Alert**: If any tokens are expiring soon but haven't been refreshed.

### 6.2 Rate Limit Monitoring

**Critical**: Monitor API usage to avoid hitting the 200 requests/**minute** limit.

```typescript
// Get rate limit status via API
const service = new SikkaWritebackService();
const report = await service.getApiUsageReport();

// Example output:
[
  {
    pmsIntegrationId: "pms-123",
    officeName: "Main Dental Clinic",
    requestsUsed: 87,
    requestsRemaining: 63,
    percentUsed: 58,
    windowStart: "2026-02-07T15:32:00Z" // Per minute window
  }
]
```

**Alert Thresholds**:
- ⚠️ Warning at 80% (120/150 safe limit used **this minute**)
- 🚨 Critical at 93% (140/150 safe limit used)
- 🔴 Emergency at 100% (all requests exhausted)

**Dashboard Query**:
```sql
-- Practices approaching rate limit THIS MINUTE
SELECT 
  pi.id,
  (pi.metadata->>'practiceName') as practice_name,
  COUNT(*) FILTER (WHERE pal.timestamp > NOW() - INTERVAL '1 minute') as requests_last_minute,
  200 - COUNT(*) FILTER (WHERE pal.timestamp > NOW() - INTERVAL '1 minute') as remaining
FROM pms_integrations pi
LEFT JOIN pms_audit_logs pal ON pal.pms_integration_id = pi.id
WHERE pi.provider = 'SIKKA'
GROUP BY pi.id
HAVING COUNT(*) FILTER (WHERE pal.timestamp > NOW() - INTERVAL '1 minute') > 120
ORDER BY requests_last_minute DESC;
```

### 6.3 Writeback Status Monitoring

```sql
-- Query: Stuck writebacks (pending for >30 minutes)
SELECT 
  id,
  operation,
  submitted_at,
  check_count,
  EXTRACT(EPOCH FROM (NOW() - submitted_at)) / 60 AS minutes_pending
FROM pms_writebacks
WHERE result = 'pending'
  AND submitted_at < NOW() - INTERVAL '30 minutes';
```

**Alert**: If any writebacks are stuck in pending state for >30 minutes.

### 6.4 Failed Writebacks Monitoring

```sql
-- Query: Recent failed writebacks
SELECT 
  id,
  operation,
  error_message,
  submitted_at,
  completed_at
FROM pms_writebacks
WHERE result = 'failed'
  AND completed_at > NOW() - INTERVAL '24 hours'
ORDER BY completed_at DESC;
```

**Alert**: If failure rate exceeds threshold (e.g., >5% in last hour).

### 6.5 Slack Alerts (Optional)

Add to your background jobs:

```typescript
async function sendAlert(message: string) {
  if (process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
  }
}

// In token refresh service
if (failed > 0) {
  await sendAlert(`⚠️ Sikka Token Refresh: ${failed} integration(s) failed`);
}

// In writeback service
if (stuckCount > 0) {
  await sendAlert(`⚠️ Sikka Writebacks: ${stuckCount} operation(s) stuck`);
}
```

---

## Step 7: Testing in Production

### 7.1 Verify Token Refresh

```bash
# Manually trigger token refresh
node -e "require('./dist/pms/sikka-token-refresh.service').refreshAllSikkaTokens().then(console.log)"

# Expected output:
# { success: 1, failed: 0 }
```

### 7.2 Verify Writeback Polling

```bash
# Check service status
sudo systemctl status sikka-writeback-poll.service

# View logs
sudo journalctl -u sikka-writeback-poll.service --since "5 minutes ago"
```

### 7.3 Test End-to-End

```bash
# Run test scripts
node scripts/test-sikka-auth-flow.js
node scripts/test-sikka-writebacks.js
```

---

## Troubleshooting

### Token Refresh Failures

**Symptom**: Token refresh job reports failures.

**Possible Causes**:
1. `refresh_key` expired (need user to re-authorize)
2. Network connectivity issues
3. Sikka API downtime

**Solution**:
```sql
-- Check token status
SELECT id, status, token_expiry, last_error 
FROM pms_integrations 
WHERE provider = 'SIKKA';

-- If refresh_key expired, update status
UPDATE pms_integrations 
SET status = 'SETUP_REQUIRED', 
    last_error = 'Token expired, user must re-authorize' 
WHERE id = 'xxx';
```

### Writeback Timeouts

**Symptom**: Writebacks stuck in pending state.

**Possible Causes**:
1. SPU (on practice server) is offline
2. Practice PMS database is locked
3. Network issues between practice and Sikka

**Solution**:
- Background job automatically marks stuck writebacks as failed after 5 minutes
- Notify user that operation may need to be retried
- Check with practice that SPU is running

### 401 Unauthorized Errors

**Symptom**: API calls return 401.

**Possible Causes**:
1. `request_key` expired
2. Invalid credentials
3. Writeback operations not enabled for account

**Solution**:
```typescript
// Force token refresh
const service = new SikkaTokenRefreshService();
await service.refreshIntegrationToken(pmsIntegrationId);
```

---

## Production Checklist

- [ ] Database migrations applied
- [ ] Environment variables configured
- [ ] Token refresh job scheduled (23 hours)
- [ ] Writeback polling service running (5 seconds)
- [ ] Monitoring dashboards created
- [ ] Alerts configured
- [ ] Backup credentials stored securely
- [ ] Error tracking enabled (Sentry, etc.)
- [ ] Logging configured (CloudWatch, Datadog, etc.)
- [ ] Load testing completed
- [ ] Documentation updated
- [ ] Team trained on troubleshooting

---

## Support & Maintenance

### Daily Tasks
- Check monitoring dashboard for alerts
- Review failed writebacks
- Verify token refresh job ran successfully

### Weekly Tasks
- Review error logs
- Check writeback success rate
- Verify all integrations are active

### Monthly Tasks
- Review API usage and rate limits
- Update Sikka API client if new endpoints available
- Performance optimization review

---

## Contact Information

**Sikka API Support**:
- Email: support@sikkasoft.com
- Portal: https://support.sikkasoft.com
- API Docs: https://apidocs.sikkasoft.com

**Internal Team**:
- On-call: #eng-oncall
- Slack: #pms-integrations
- Documentation: /docs/SIKKA_*.md
