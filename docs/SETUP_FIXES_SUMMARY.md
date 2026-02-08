# Setup Fixes Summary

## Overview
This document summarizes all the fixes applied during the Dentia → Parlae migration and local development setup.

## Issues Fixed

### 1. GitHub Actions Error
**Problem:** GitHub Actions workflow failing with `aws-region` error
```
Error: Input required and not supplied: aws-region
```

**Fix:**
- Updated `.github/workflows/deploy-backend.yml` to use `${{ secrets.AWS_REGION }}` directly
- Updated `.github/workflows/deploy-frontend.yml` to use `${{ secrets.AWS_REGION }}` directly
- Ran `scripts/add-github-secrets.sh` to configure all GitHub secrets including `AWS_REGION=us-east-2`

**Files Changed:**
- `.github/workflows/deploy-backend.yml`
- `.github/workflows/deploy-frontend.yml`
- `scripts/add-github-secrets.sh` (updated with parameter support)

### 2. Git Remote Configuration
**Problem:** Repository had no remote configured
```
no git remotes found
```

**Fix:**
- Added remote: `git remote add origin https://github.com/Dentia-AI/parlae.git`
- Renamed branch: `master` → `main`
- Set up tracking: `git branch --set-upstream-to=origin/main main`
- Reset to remote main to sync with GitHub

### 3. Project Structure & Naming
**Problem:** Scripts referenced non-existent `dentia/` subdirectory
```
./dev.sh: line 201: cd: dentia: No such file or directory
```

**Fix:** Updated all scripts to work from repository root instead of `dentia/` subdirectory

**Files Updated:**
- `dev.sh` - Removed `cd dentia` commands, updated all paths
- `cleanup.sh` - Removed `cd dentia` commands, updated paths
- `setup.sh` - Updated menu options and script references
- `scripts/add-github-secrets.sh` - Updated documentation references

**Naming Changes:**
- "Dentia" → "Parlae" in headers and messages
- Container prefix: `dentia-` → `parlae-` (already done in docker-compose.yml)

### 4. Docker Cleanup Issues
**Problem:** Old Docker containers not being cleaned up, causing port conflicts
```
Bind for 0.0.0.0:5433 failed: port is already allocated
```

**Root Cause:** Old `dentia-postgres` and `dentia-localstack` containers still running

**Fix:**
- Stopped old containers: `docker stop dentia-postgres dentia-localstack`
- Updated cleanup scripts to check for both `parlae-` and `dentia-` containers
- Updated to use `docker ps -a` to catch all container states (running, stopped, created)
- Added force removal with `docker rm -f`

**Files Updated:**
- `cleanup.sh` - Now handles both naming patterns and all container states
- `dev.sh` (pre-cleanup) - Same improvements

### 5. Database Credentials Migration
**Problem:** Backend failing to connect with old credentials
```
PrismaClientInitializationError: Authentication failed against database server at `localhost`, 
the provided database credentials for `dentia` are not valid.
```

**Old Credentials:**
```
postgresql://dentia:dentia@localhost:5433/dentia
```

**New Credentials:**
```
postgresql://parlae:parlae@localhost:5433/parlae
```

**Files Updated:**
- `.env.local` - Root configuration
- `.env.example` - Example template
- `apps/backend/.env.local` - Backend local dev
- `apps/frontend/.env` - Frontend production template (also fixed domain references)
- `apps/frontend/.env.local` - Frontend local dev
- `apps/frontend/apps/web/.env.local` - Web app local dev
- `packages/prisma/.env` - Prisma connection string

### 6. Database Schema & Seed Data
**Problem 1:** PostgreSQL container missing pgvector extension
```
ERROR: extension "vector" is not available
```

**Fix:** Changed Docker image from `postgres:15-alpine` to `ankane/pgvector:v0.5.1`

**Problem 2:** Failed migrations from previous setup attempt

**Fix:** Reset database and applied all migrations fresh
```bash
cd packages/prisma && npx prisma migrate reset --force
```

**Result:** 
- ✅ All 10 migrations applied successfully
- ✅ Seed data created with test accounts

### 7. Test Account Setup
**Problem:** User reported seed data for `test@example.com` not working

**Fix:**
- Reset database cleared old data
- Re-seeded with proper accounts
- Verified credentials authentication is enabled in development mode

**Available Test Accounts:**
```
Test User:
  Email: test@example.com
  Password: Thereis1

Admin User:
  Email: admin@example.com
  Password: Thereis1
```

**How it Works:**
1. **NextAuth Configuration** (`apps/frontend/packages/shared/src/auth/nextauth.ts`, lines 276-292):
   - In development mode, accepts hardcoded credentials
   - Calls `ensureUserProvisioned()` to create/sync user in database
   
2. **Database Seed** (`packages/prisma/seed.ts`):
   - Creates user records with proper roles
   - Creates accounts and memberships
   - Creates role hierarchy

3. **Backend Dev Auth** (`apps/backend/src/auth/dev-auth.guard.ts`):
   - In development, automatically injects mock user for API calls
   - No auth token required for local testing

## Current Status

### ✅ Working Components
- Git repository configured and synced
- GitHub Actions secrets configured
- All development scripts updated (dev.sh, cleanup.sh, setup.sh)
- Docker containers using correct naming and images
- Database credentials updated across all .env files
- PostgreSQL with pgvector support
- Database schema migrated successfully
- Test accounts seeded and ready to use

### 📝 Environment Configuration

**Database:**
- Host: `localhost:5433`
- Database: `parlae`
- User: `parlae`
- Password: `parlae`

**Docker Containers:**
- `parlae-postgres` - PostgreSQL with pgvector (port 5433)
- `parlae-localstack` - Local AWS services (port 4567)
- `parlae-backend` - NestJS backend (port 4001)
- `parlae-frontend` - Next.js frontend (port 3000)

**Test Users:**
- `test@example.com` / `Thereis1` - Regular user
- `admin@example.com` / `Thereis1` - Admin user

## Usage

### Start Development Environment
```bash
# From repository root
./dev.sh

# Access URLs:
# Frontend: http://localhost:3000
# Backend:  http://localhost:3333
# Database: postgresql://parlae:parlae@localhost:5433/parlae
```

### Login
1. Navigate to http://localhost:3000
2. Click "Sign In"
3. Choose "Email" provider
4. Enter credentials:
   - Email: `test@example.com`
   - Password: `Thereis1`

### Cleanup
```bash
# Stop all services and clean up
./cleanup.sh

# Also remove log files
./cleanup.sh --logs
```

### Reset Database
```bash
cd packages/prisma
npx prisma migrate reset --force
```

## Documentation References

For more details, see:
- [DENTIA_TO_PARLAE_MIGRATION.md](./DENTIA_TO_PARLAE_MIGRATION.md) - Migration details
- Repository README.md - General project information
- `dev.sh --help` - Development script options
