# Local Development Login Guide

## Quick Start

1. **Ensure services are running:**
   ```bash
   cd /Users/shaunk/Projects/dentia
   ./dev.sh
   ```

2. **Open your browser:**
   ```
   http://localhost:3000/auth/sign-in
   ```

3. **Login with test credentials:**
   ```
   Email: test@example.com
   Password: Thereis1
   ```

## Test Users

### Regular User (Account Manager)
- **Email:** `test@example.com`
- **Password:** `Thereis1`
- **Role:** Account Manager
- **Account:** Test Account
- **Use for:** Testing AI agent setup, campaigns, regular features

### Admin User (Super Admin)
- **Email:** `admin@example.com`
- **Password:** `Thereis1`
- **Role:** Super Admin
- **Account:** Admin Account
- **Use for:** Testing admin features, permissions, system-wide operations

## Access the AI Agent Setup

After logging in:

1. You'll be redirected to the dashboard
2. Navigate to: **http://localhost:3000/home/ai-agent/setup**
3. Complete the 5-step wizard:
   - **Step 1:** Business Details (name, industry, etc.)
   - **Step 2:** Voice Selection (choose from 6 AI voices)
   - **Step 3:** Phone Number (select a phone number)
   - **Step 4:** Knowledge Base (add business info)
   - **Step 5:** Review & Deploy (deploy your AI agent)

## Resetting Test Data

If you need to reset the test users:

```bash
cd /Users/shaunk/Projects/dentia/dentia/packages/prisma
pnpm seed
```

This will:
- Recreate test@example.com user
- Recreate admin@example.com user
- Set up their accounts and memberships
- Reset to clean state

## Environment Configuration

The system uses these environment variables for local auth:

```bash
# In dentia/.env.local
ENABLE_CREDENTIALS_SIGNIN=true
NODE_ENV=development
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=dev-secret-change-in-production-12345678901234567890
```

## Troubleshooting

### "Invalid credentials" error
- Check that you're using `Thereis1` (capital T, no spaces)
- Ensure dev services are running (`./dev.sh`)
- Check that `ENABLE_CREDENTIALS_SIGNIN=true` in `.env.local`

### "User not found" after login
- Run the seed script: `cd packages/prisma && pnpm seed`
- Check database is running: `docker ps` (should see dentia-postgres)

### Can't access AI agent setup
- Make sure you're logged in: Check for user menu in top-right
- Try navigating directly: http://localhost:3000/home/ai-agent/setup
- Check browser console for errors (F12)

## What Works in Local/Dev

✅ **Authentication**: Email/password login (no Cognito required)
✅ **Database**: Local PostgreSQL with seed data
✅ **AI Agent Setup**: Full 5-step wizard
✅ **Backend API**: All GHL endpoints (voices, phones, agents)
✅ **Frontend**: Hot reloading, all pages

## Architecture Notes

- **NextAuth** handles authentication with credentials provider
- **Development mode** bypasses Cognito for local testing
- **Test users** are auto-provisioned on first login
- **Database** seeding ensures clean test state
- **Password** is only checked in development (not hashed/stored)

## Next Steps

Once logged in, you can:

1. **Test Phase 1**: Create a GHL sub-account
   - Navigate to AI agent setup
   - Fill in business details
   - Verify sub-account creation

2. **Test Phase 2**: Configure AI voice agent
   - Select voice (e.g., "Nova")
   - Choose phone number
   - Add knowledge base entries
   - Deploy the agent

3. **Verify Backend**: Check logs
   ```bash
   tail -f logs/backend.log
   tail -f logs/frontend.log
   ```

Happy testing! 🚀
