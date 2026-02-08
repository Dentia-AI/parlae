# 🚀 Local Development Guide

Complete guide for running Dentia locally with a production-like environment.

---

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Prerequisites](#-prerequisites)
- [Setup](#-setup)
- [Running the Application](#-running-the-application)
- [Development Modes](#-development-modes)
- [Troubleshooting](#-troubleshooting)
- [Common Tasks](#-common-tasks)

---

## ⚡ Quick Start

```bash
# 1. Clone and install
git clone <repository>
cd dentia
pnpm install

# 2. Set up environment
cp .env.example .env.local
# Edit .env.local with your configuration (optional for basic dev)

# 3. Make dev script executable
chmod +x dev.sh

# 4. Run everything!
./dev.sh
```

That's it! Your app is now running at:
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:4001
- **Database**: localhost:5433

---

## 📦 Prerequisites

### Required

1. **Node.js** (v20+)
   ```bash
   node --version  # Should be 20.x or higher
   ```

2. **pnpm** (v9+)
   ```bash
   npm install -g pnpm@9
   pnpm --version
   ```

3. **Docker** (for database and localstack)
   ```bash
   docker --version
   docker-compose --version
   ```

### Optional

- **PostgreSQL client** (for database inspection)
  ```bash
  brew install postgresql  # macOS
  apt install postgresql-client  # Linux
  ```

---

## 🔧 Setup

### 1. Install Dependencies

```bash
pnpm install
```

This installs all packages in the monorepo.

### 2. Configure Environment

```bash
cp .env.example .env.local
```

**For basic development**, the defaults in `.env.example` work out of the box!

**Optional customization** (edit `.env.local`):

```bash
# Database (default works fine)
DATABASE_URL=postgresql://dentia:dentia@localhost:5433/dentia

# NextAuth Secret (generate a strong one for real use)
NEXTAUTH_SECRET=$(openssl rand -base64 32)

# Cognito (use real values if testing auth)
COGNITO_USER_POOL_ID=your-pool-id
COGNITO_CLIENT_ID=your-client-id
COGNITO_CLIENT_SECRET=your-client-secret

# GoHighLevel (if using)
GHL_API_KEY=your-api-key
GHL_LOCATION_ID=your-location-id
```

> ℹ️ `./dev.sh` now loads `.env` first and then `.env.local`, so you can keep shared values (like `NEXT_PUBLIC_GHL_WIDGET_ID`) in `.env` and override them in `.env.local` when needed.

### 3. Make Dev Script Executable

```bash
chmod +x dev.sh
```

---

## 🚀 Running the Application

### Default: Run Everything

Starts database, backend, and frontend:

```bash
./dev.sh
```

This will:
1. ✅ Start PostgreSQL (Docker)
2. ✅ Start LocalStack/S3 (Docker)
3. ✅ Run database migrations
4. ✅ Start backend at http://localhost:4001
5. ✅ Start frontend at http://localhost:3000

**Access your app**: Open http://localhost:3000

### Stop All Services

Press `Ctrl+C` in the terminal running `./dev.sh`

---

## 🎯 Development Modes

The `dev.sh` script supports different modes for flexibility.

### Run Frontend Only

Runs just the frontend + database:

```bash
./dev.sh --mode frontend
# or
./dev.sh -m frontend
```

**Use case**: Backend is running separately (another terminal or IDE), or you're using a deployed backend.

### Run Backend Only

Runs just the backend + database + localstack:

```bash
./dev.sh --mode backend
# or
./dev.sh -m backend
```

**Use case**: Frontend is running separately, or you're testing backend APIs only.

### Run Database Only

Runs just PostgreSQL:

```bash
./dev.sh --mode db
# or
./dev.sh -m db
```

**Use case**: Running backend and frontend via your IDE, but need the database.

### Run Everything in Docker

Runs all services (including backend and frontend) in Docker:

```bash
./dev.sh --docker
# or
./dev.sh -d
```

**Use case**: You want a fully containerized environment (closer to production).

### Skip Dependency Installation

If dependencies are already installed:

```bash
./dev.sh --skip-install
# or
./dev.sh -s
```

### Combine Options

```bash
# Frontend only, skip install
./dev.sh -m frontend -s

# Backend only in Docker
./dev.sh -m backend -d

# Everything in Docker, skip install
./dev.sh -d -s
```

---

## 📊 Service URLs and Ports

| Service | URL | Notes |
|---------|-----|-------|
| **Frontend** | http://localhost:3000 | Next.js app |
| **Backend** | http://localhost:4001 | NestJS API |
| **Backend API** | http://localhost:4001/api | REST endpoints |
| **PostgreSQL** | localhost:5433 | Database (external port) |
| **LocalStack** | http://localhost:4567 | S3-compatible storage |
| **Prisma Studio** | http://localhost:5555 | Database GUI (see below) |

---

## 🛠️ Common Tasks

### View Backend Logs

```bash
# If running natively
tail -f logs/backend.log

# If running in Docker
docker-compose logs -f backend
```

### View Frontend Logs

```bash
# If running natively
tail -f logs/frontend.log

# If running in Docker
docker-compose logs -f frontend
```

### Access Database

#### Using Prisma Studio (Recommended)

```bash
cd packages/prisma
npx prisma studio
```

Opens a GUI at http://localhost:5555

#### Using psql

```bash
psql postgresql://dentia:dentia@localhost:5433/dentia
```

### Run Database Migrations

```bash
cd packages/prisma

# Create a new migration
npx prisma migrate dev --name your_migration_name

# Apply migrations
npx prisma migrate deploy

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

### Generate Prisma Client

After changing `schema.prisma`:

```bash
cd packages/prisma
npx prisma generate
```

### Seed Database

```bash
cd packages/prisma
npx prisma db seed
```

### Run Tests

```bash
# Backend tests
cd apps/backend
pnpm test

# Frontend tests
cd apps/frontend/apps/web
pnpm test

# All tests with coverage
pnpm test:cov  # backend
pnpm test:coverage  # frontend
```

### Format Code

```bash
# Format all code
pnpm format

# Lint all code
pnpm lint
```

### Clean Everything

```bash
# Stop all Docker containers
docker-compose down

# Remove volumes (deletes database data)
docker-compose down -v

# Clean node_modules
rm -rf node_modules apps/*/node_modules packages/*/node_modules

# Clean build artifacts
rm -rf apps/*/dist apps/*/.next

# Reinstall
pnpm install
```

---

## 🐛 Troubleshooting

### Port Already in Use

**Error**: `Port 3000 (or 4001, 5433) is already in use`

**Fix**:
```bash
# Find process using the port
lsof -i :3000  # or 4001, 5433

# Kill the process
kill -9 <PID>

# Or change port in .env.local
BACKEND_PORT=4002  # for backend
# Frontend port: change in apps/frontend/apps/web/package.json
```

### Database Connection Failed

**Error**: `Can't reach database server at localhost:5433`

**Fix**:
```bash
# Check if PostgreSQL container is running
docker ps | grep postgres

# If not, start it
docker-compose up -d postgres

# Check logs
docker-compose logs postgres

# Verify connection
docker exec -it dentia-postgres-1 psql -U dentia -d dentia
```

### Prisma Client Not Generated

**Error**: `Cannot find module '@prisma/client'`

**Fix**:
```bash
cd packages/prisma
npx prisma generate
```

### Module Not Found (TypeScript)

**Error**: `Cannot find module '@kit/...'`

**Fix**:
```bash
# Rebuild TypeScript references
pnpm install

# Or restart your IDE/TypeScript server
```

### Environment Variables Not Loading

**Fix**:
1. Make sure `.env.local` exists in the root
2. Restart the dev script
3. Check that variables are exported:
   ```bash
   echo $DATABASE_URL
   ```

### Docker: Container Name Conflict

**Error**: `Conflict. The container name "/dentia-postgres-1" is already in use`

**Fix**:
```bash
# Stop and remove containers
docker-compose down

# If still failing, force remove
docker rm -f $(docker ps -aq)

# Restart
./dev.sh
```

### Migration Failed

**Error**: Migration fails during startup

**Fix**:
```bash
# Reset database (WARNING: deletes all data)
cd packages/prisma
npx prisma migrate reset

# Or manually apply migrations
npx prisma migrate deploy
```

### Frontend Can't Connect to Backend

**Error**: `Failed to fetch` or `ECONNREFUSED localhost:4001`

**Check**:
1. Backend is running: `curl http://localhost:4001/health`
2. Environment variables:
   ```bash
   # In frontend .env.local or environment
   BACKEND_URL=http://localhost:4001
   BACKEND_API_URL=http://localhost:4001
   ```
3. Ports match in backend and frontend config

### LocalStack S3 Not Working

**Fix**:
```bash
# Restart LocalStack
docker-compose restart localstack

# Check logs
docker-compose logs localstack

# Verify endpoint
curl http://localhost:4567/_localstack/health
```

---

## 🎓 Development Workflow

### Typical Daily Workflow

```bash
# 1. Start your day
git pull origin develop
pnpm install  # if dependencies changed
./dev.sh

# 2. Make changes
# Edit code in your IDE...

# 3. Test changes
# Frontend/backend auto-reload
# Visit http://localhost:3000

# 4. Run tests
cd apps/backend && pnpm test
cd apps/frontend/apps/web && pnpm test

# 5. Commit
git add .
git commit -m "Your changes"
git push

# 6. End of day
Ctrl+C  # stops dev.sh
```

### Working on Backend Only

```bash
# Terminal 1: Run DB
./dev.sh -m db

# Terminal 2: Run backend with watch mode
cd apps/backend
pnpm start:dev

# Your IDE or separate terminal for testing
```

### Working on Frontend Only

```bash
# Terminal 1: Run DB + Backend
./dev.sh -m backend

# Terminal 2: Run frontend with watch mode
cd apps/frontend/apps/web
pnpm dev

# Your IDE or separate terminal for testing
```

---

## 📝 Environment Variables Reference

### Essential Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://dentia:dentia@localhost:5433/dentia` | PostgreSQL connection string |
| `BACKEND_URL` | `http://localhost:4001` | Backend URL for frontend |
| `NEXTAUTH_URL` | `http://localhost:3000` | Frontend URL for auth |
| `NEXTAUTH_SECRET` | `dev-secret-...` | NextAuth encryption secret |
| `NODE_ENV` | `development` | Environment mode |

### Optional Variables

| Variable | Description |
|----------|-------------|
| `COGNITO_USER_POOL_ID` | AWS Cognito user pool (optional for local) |
| `COGNITO_CLIENT_ID` | AWS Cognito client ID |
| `GHL_API_KEY` | GoHighLevel API key |
| `ENABLE_CREDENTIALS_SIGNIN` | Enable email/password login (default: true) |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) |

See `.env.example` for the complete list.

---

## 🆘 Getting Help

### Documentation

- **Testing**: See `TESTING_QUICK_START.md`
- **CI/CD**: See `CI_CD_SETUP_COMPLETE.md`
- **Database**: See `DATABASE_MIGRATIONS_GUIDE.md`
- **Backend**: See `apps/backend/README.md`
- **Frontend**: See `apps/frontend/apps/web/README.md`

### Useful Commands Summary

```bash
# Start everything
./dev.sh

# Start specific service
./dev.sh -m [all|frontend|backend|db]

# Use Docker
./dev.sh --docker

# View help
./dev.sh --help

# Database GUI
cd packages/prisma && npx prisma studio

# Run tests
cd apps/backend && pnpm test
cd apps/frontend/apps/web && pnpm test

# View logs
tail -f logs/backend.log
tail -f logs/frontend.log
docker-compose logs -f
```

---

## ✅ Success Checklist

After running `./dev.sh`, verify:

- [ ] ✅ Frontend loads at http://localhost:3000
- [ ] ✅ Backend responds at http://localhost:4001/health
- [ ] ✅ Database is accessible (check with Prisma Studio)
- [ ] ✅ Frontend can call backend APIs
- [ ] ✅ No errors in logs

**If all checked, you're ready to develop! 🎉**

---

## 🎉 You're All Set!

Your local development environment mirrors production:

- ✅ **PostgreSQL** database
- ✅ **NestJS** backend with hot reload
- ✅ **Next.js** frontend with hot reload
- ✅ **LocalStack** for S3 (optional)
- ✅ **All services communicate** like production

**Happy coding! 🚀**
