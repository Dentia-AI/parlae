# 🚀 Dentia Local Development - Quick Start

## ✅ Prerequisites

- Docker Desktop running
- Node.js v22+ installed
- pnpm installed

---

## 🎯 **Step 1: Start Services**

```bash
cd /Users/shaunk/Projects/dentia
./dev.sh
```

**What this does:**
- ✅ Kills any processes on ports 3000, 3333, 4000, 4001
- ✅ Starts PostgreSQL (port 5433)
- ✅ Starts LocalStack/S3 (port 4567)
- ✅ Runs database migrations
- ✅ Starts Backend (port 3333)
- ✅ Starts Frontend (port 3000)

---

## 🔐 **Step 2: Login**

### First-time or after errors:

1. **Clear old session cookies:**
   ```
   http://localhost:3000/api/auth/clear-session
   ```

2. **Go to login:**
   ```
   http://localhost:3000/auth/sign-in
   ```

3. **Login with:**
   - Email: `test@example.com`
   - Password: `Thereis1`

---

## 🤖 **Step 3: Test AI Agent Setup**

After login, navigate to:
```
http://localhost:3000/home/ai-agent/setup
```

Complete the 5-step wizard:

1. **Business Details** - Fill in business info
2. **Voice Selection** - Choose an AI voice (6 options)
3. **Phone Number** - Select a phone number
4. **Knowledge Base** - Add business information
5. **Review & Deploy** - Deploy your AI agent

---

## 🐛 **Troubleshooting**

### Port conflicts (EADDRINUSE error)?

```bash
cd /Users/shaunk/Projects/dentia
./cleanup.sh
```

Then try `./dev.sh` again.

### JWT Session Error?

Visit: `http://localhost:3000/api/auth/clear-session`

### Backend won't start?

Check Docker is running:
```bash
docker ps
```

You should see:
- `dentia-postgres` (healthy)
- `dentia-localstack` (healthy)

### Database connection error?

Check `.env.local` has:
```bash
DATABASE_URL=postgresql://dentia:dentia@localhost:5433/dentia?schema=public
```

---

## 📊 **Service Ports**

| Service | Port | URL |
|---------|------|-----|
| Frontend | 3000 | http://localhost:3000 |
| Backend | 3333 | http://localhost:3333 |
| PostgreSQL | 5433 | localhost:5433 |
| LocalStack | 4567 | http://localhost:4567 |

---

## 🧪 **Test Backend Directly**

```bash
# Health check
curl http://localhost:3333/health

# Get sub-accounts (should work without auth in dev)
curl http://localhost:3333/ghl/sub-accounts/my

# Get available voices
curl http://localhost:3333/ghl/voices

# Get phone numbers
curl http://localhost:3333/ghl/phone-numbers
```

---

## 🔄 **Reset Test Data**

```bash
cd /Users/shaunk/Projects/dentia/dentia/packages/prisma
DATABASE_URL="postgresql://dentia:dentia@localhost:5433/dentia?schema=public" pnpm seed
```

This recreates:
- `test@example.com` / `Thereis1` (Account Manager)
- `admin@example.com` / `Thereis1` (Super Admin)

---

## 📝 **Important Files**

```
/Users/shaunk/Projects/dentia/
├── dev.sh                          # Start all services
├── cleanup.sh                      # Clean up ports & processes
├── config.sh                       # Production config
└── dentia/
    ├── .env.local                  # Local environment vars
    ├── logs/
    │   ├── backend.log            # Backend logs
    │   └── frontend.log           # Frontend logs
    ├── packages/prisma/
    │   └── seed.ts                # Database seeding
    └── apps/
        ├── backend/               # NestJS backend (port 3333)
        └── frontend/apps/web/     # Next.js frontend (port 3000)
```

---

## 🎯 **Quick Commands**

```bash
# Start everything
./dev.sh

# Clean up and restart
./cleanup.sh && ./dev.sh

# Check what's running
docker ps
ps aux | grep -E "next dev|ts-node"

# View logs
tail -f dentia/logs/backend.log
tail -f dentia/logs/frontend.log

# Access database
psql postgresql://dentia:dentia@localhost:5433/dentia
```

---

## ✨ **What's Different in Local Development**

- ✅ **No Cognito required** - DevAuthGuard allows requests without JWT
- ✅ **Simple login** - Email/password only (test@example.com / Thereis1)
- ✅ **Auto-provisioning** - Test users created on first login
- ✅ **Backend on 3333** - Not 4000 or 4001
- ✅ **Mock data** - GHL API fallbacks for testing without real GHL account

---

## 🚀 **You're Ready!**

Just run:
```bash
cd /Users/shaunk/Projects/dentia
./dev.sh
```

Then visit:
```
http://localhost:3000/auth/sign-in
```

Login with `test@example.com` / `Thereis1` and start testing! 🎉
