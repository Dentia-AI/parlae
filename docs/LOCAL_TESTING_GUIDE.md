# Local Testing Guide - Mobile & Notification Improvements

## Quick Start

### 1. Start the Development Environment

```bash
cd /Users/shaunk/Projects/Dentia/dentia

# Start the database and services
docker-compose up

# Or if you have separate terminals:
# Terminal 1: Start the database
docker-compose up postgres

# Terminal 2: Start the frontend
cd apps/frontend
pnpm install
pnpm run dev

# Terminal 3: Start the backend (optional, for API testing)
cd apps/backend
pnpm install
pnpm run dev
```

### 2. Access the Application

Open your browser and go to:
```
http://localhost:3000
```

### 3. Login or Sign Up

#### Option A: Use Existing Account
- Go to http://localhost:3000/auth/sign-in
- Login with your existing credentials

#### Option B: Create New Account
- Go to http://localhost:3000/auth/sign-up
- Sign up with a new email
- Check your email for verification (or check the backend logs for the verification link)

#### Option C: Use Direct Credentials Login (if enabled)
- Go to http://localhost:3000/auth/sign-in
- Use the email/password login form

---

## Testing the New Features

### Desktop Testing

#### 1. Test Sidebar Notification Bell

**Steps:**
1. After logging in, you should be at `/home`
2. Look at the bottom left sidebar
3. You should see: **"🔔 Notifications [badge]"**

**To Add Test Notifications:**
```bash
# Connect to your database
docker exec -it dentia-postgres-1 psql -U postgres -d dentia

# Insert test notifications
INSERT INTO notifications (
  id, 
  user_id, 
  title, 
  body, 
  type, 
  dismissed, 
  created_at
) VALUES 
  (gen_random_uuid(), 'YOUR_USER_ID', 'Test Notification 1', 'This is a test notification body', 'INFO', false, NOW()),
  (gen_random_uuid(), 'YOUR_USER_ID', 'Test Notification 2', 'Another test notification', 'WARNING', false, NOW()),
  (gen_random_uuid(), 'YOUR_USER_ID', 'Test Notification 3', 'Third notification', 'INFO', false, NOW());
```

**To get your user ID:**
```sql
SELECT id, email FROM "User" LIMIT 5;
```

**Test the feature:**
1. Click the "Notifications" button in sidebar
2. Should expand showing top 3 notifications
3. Click a notification to dismiss it
4. Badge count should decrease

#### 2. Test Account Selector

**Steps:**
1. Look at the top of the sidebar
2. You should see the account selector dropdown
3. Click it to open
4. Type in the search box - verify it shows "Search accounts..." (not `[object Object]`)
5. Click "Create Client Account"
6. Verify a modal opens (not an error)
7. Modal should show "Coming soon" message

---

### Mobile Testing (Responsive View)

#### Option 1: Chrome DevTools

1. Open Chrome DevTools (F12 or Cmd+Option+I on Mac)
2. Click the device toolbar icon (or press Cmd+Shift+M)
3. Select a mobile device (e.g., iPhone 14 Pro)
4. Refresh the page

#### Option 2: Firefox Responsive Design Mode

1. Open Firefox DevTools (F12)
2. Click responsive design mode icon (or Cmd+Option+M)
3. Select a mobile device preset
4. Refresh the page

#### Option 3: Use Real Device

1. Find your computer's local IP:
```bash
# On Mac/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# On Windows
ipconfig | findstr "IPv4"
```

2. Update your `.env` file:
```bash
# In apps/frontend/.env
NEXTAUTH_URL=http://YOUR_LOCAL_IP:3000
```

3. On your phone, open browser and go to:
```
http://YOUR_LOCAL_IP:3000
```

**Test Mobile Features:**

1. **Bottom Navigation Bar**
   - Should see fixed bar at bottom with: Home, Notifications, Menu
   - Tap each icon to navigate

2. **Notifications Badge**
   - Should show badge with number on Notifications icon
   - Badge should be visible and readable

3. **Menu Sheet**
   - Tap the Menu (☰) icon
   - Sheet should slide up from bottom
   - Should show:
     - Account selector at top
     - Settings section with Profile/Billing/Team links
     - Profile dropdown at bottom
   - Tap outside to close

4. **Account Switching**
   - In the menu sheet, tap account selector
   - Should open account list
   - Tap "Create Client Account"
   - Modal should open

---

## Testing Different Scenarios

### Test 1: No Notifications

**Setup:**
```sql
-- Delete all notifications for your user
DELETE FROM notifications WHERE user_id = 'YOUR_USER_ID';
```

**Expected:**
- Badge should not appear
- Clicking notification bell shows "No new notifications"

### Test 2: Many Notifications (>3)

**Setup:**
```sql
-- Add 5 notifications
INSERT INTO notifications (id, user_id, title, body, type, dismissed, created_at)
SELECT 
  gen_random_uuid(),
  'YOUR_USER_ID',
  'Notification ' || generate_series,
  'Test body ' || generate_series,
  'INFO',
  false,
  NOW()
FROM generate_series(1, 5);
```

**Expected:**
- Badge shows count (5)
- Clicking bell shows top 3
- "View all notifications" link appears

### Test 3: Multiple Accounts

**Setup:**
```sql
-- Create a test client account
INSERT INTO "Account" (id, name, slug, "pictureUrl", "isPersonalAccount")
VALUES (gen_random_uuid(), 'Test Client', 'test-client', null, false);

-- Link to your user (you'll need the account ID from above)
-- This is just for testing the UI
```

**Expected:**
- Account selector shows both accounts
- Can switch between them

---

## Troubleshooting

### Issue: Can't login locally

**Solution 1: Check Cognito Configuration**
```bash
# Check your .env files
cat apps/frontend/.env | grep COGNITO

# Make sure you have:
# COGNITO_CLIENT_ID=...
# COGNITO_CLIENT_SECRET=...
# COGNITO_ISSUER=...
```

**Solution 2: Use Credentials Provider**
```bash
# In apps/frontend/.env
ENABLE_CREDENTIALS_SIGNIN=true
```

### Issue: Database not running

```bash
# Check if postgres is running
docker ps | grep postgres

# Start it if not running
docker-compose up postgres -d
```

### Issue: Notifications not appearing

**Check the table exists:**
```sql
-- Connect to database
docker exec -it dentia-postgres-1 psql -U postgres -d dentia

-- Check if table exists
\dt notifications

-- If not, run migrations
```

```bash
# Run migrations
cd apps/frontend
pnpm run db:push

# Or
cd packages/prisma
pnpm run db:push
```

### Issue: Mobile view not showing bottom nav

**Check:**
1. Browser width is < 768px (use DevTools to check)
2. You're logged in and at `/home` or a sub-page
3. Clear browser cache and refresh

### Issue: TypeScript errors

```bash
# Rebuild types
cd apps/frontend
pnpm run build

# Or just check types
pnpm run type-check
```

---

## Useful Commands

### View Database Tables
```bash
docker exec -it dentia-postgres-1 psql -U postgres -d dentia

\dt  # List tables
\d notifications  # Describe notifications table
SELECT * FROM notifications LIMIT 5;  # View notifications
```

### Check Running Services
```bash
docker-compose ps
```

### View Logs
```bash
# Frontend logs
docker-compose logs -f frontend

# Backend logs
docker-compose logs -f backend

# Database logs
docker-compose logs -f postgres
```

### Reset Database (if needed)
```bash
cd packages/prisma
pnpm run db:reset
```

---

## Quick Test Script

Create a file `test-notifications.sql`:

```sql
-- Replace YOUR_USER_ID with your actual user ID
DO $$
DECLARE
  v_user_id TEXT := 'YOUR_USER_ID';  -- CHANGE THIS
BEGIN
  -- Clean up old test notifications
  DELETE FROM notifications WHERE title LIKE 'Test Notification%';
  
  -- Add 3 test notifications
  INSERT INTO notifications (id, user_id, title, body, type, dismissed, created_at) VALUES
    (gen_random_uuid(), v_user_id, 'Test Notification 1', 'Welcome! This is your first test notification.', 'INFO', false, NOW() - INTERVAL '5 minutes'),
    (gen_random_uuid(), v_user_id, 'Test Notification 2', 'You have a new message waiting for you.', 'WARNING', false, NOW() - INTERVAL '2 minutes'),
    (gen_random_uuid(), v_user_id, 'Test Notification 3', 'Your profile has been updated successfully.', 'INFO', false, NOW());
  
  RAISE NOTICE 'Test notifications created successfully!';
END $$;
```

Run it:
```bash
docker exec -i dentia-postgres-1 psql -U postgres -d dentia < test-notifications.sql
```

---

## Expected Behavior Summary

### Desktop (Sidebar View)
- ✅ Notification bell in bottom left with badge
- ✅ Click to expand inline (no popover)
- ✅ Shows top 3 notifications with dismiss
- ✅ Account selector in header (top of sidebar)
- ✅ No "[object Object]" in search
- ✅ Create account opens modal

### Mobile (< 768px width)
- ✅ Bottom navigation bar appears
- ✅ 3 buttons: Home, Notifications, Menu
- ✅ Badge on Notifications button
- ✅ Menu opens bottom sheet
- ✅ Sheet shows account selector + settings
- ✅ Easy thumb navigation

---

## Video Recording for Testing

If you want to record your tests:

**Mac:**
- Use QuickTime Screen Recording (Cmd+Shift+5)

**Windows:**
- Use Game Bar (Win+G)

**Browser:**
- Chrome DevTools → More tools → Capture screenshot/recording

---

## Need Help?

If you encounter issues:

1. Check the console for errors (F12 → Console tab)
2. Check the network tab for failed requests
3. View the Docker logs: `docker-compose logs -f`
4. Check the database connection: `docker exec -it dentia-postgres-1 psql -U postgres -d dentia`

All features should work locally with the same behavior as production!

