# Dentia to Parlae Migration Summary

## Overview
The project has been renamed from "Dentia" to "Parlae". The repository structure has also changed - the root directory IS now the project (no `dentia/` subdirectory).

## Key Changes Made

### 1. Scripts Updated

#### `dev.sh`
- ✅ Changed header from "Dentia Local Development Script" to "Parlae Local Development Script"
- ✅ Removed `cd dentia` commands - scripts now run from root
- ✅ Updated paths:
  - `dentia/.env` → `.env`
  - `dentia/.env.local` → `.env.local`
  - Container name prefix: `dentia-` → `parlae-` (already done in docker-compose.yml)

#### `cleanup.sh`
- ✅ Changed header from "Dentia" to "Parlae"
- ✅ Updated paths:
  - `dentia/apps/frontend/apps/web/.next/dev/lock` → `apps/frontend/apps/web/.next/dev/lock`
  - `dentia/apps/backend/.env` → `apps/backend/.env`
  - `dentia/logs/` → `logs/`
- ✅ Removed `cd dentia` command

#### `setup.sh`
- ✅ Updated menu options to reference "parlae" instead of "dentia"
- ✅ Updated script references:
  - `deploy-dentia.sh` → `deploy-parlae.sh`
  - `deploy-dentiahub.sh` → `deploy-parlaehub.sh`

#### `scripts/add-github-secrets.sh`
- ✅ Updated instructions to reference `parlae-infra` instead of `dentia-infra`
- ✅ Already had repository parameter support added

### 2. Configuration Files

#### `docker-compose.yml`
- ✅ Already updated with `parlae-` container names
- ✅ Database credentials: `parlae:parlae@localhost:5433/parlae`

### 3. GitHub Actions
- ✅ Fixed `deploy-backend.yml` - AWS region secret reference
- ✅ Fixed `deploy-frontend.yml` - AWS region secret reference

### 4. Git Repository
- ✅ Added remote: `https://github.com/Dentia-AI/parlae`
- ✅ Renamed `master` → `main` branch
- ✅ Set up tracking: `main` → `origin/main`

## Directory Structure

**Old Structure:**
```
parlae/
  dentia/          ← subdirectory
    apps/
    packages/
    scripts/
    docker-compose.yml
    dev.sh
```

**New Structure:**
```
parlae/            ← root is the project
  apps/
  packages/
  scripts/
  docker-compose.yml
  dev.sh
```

## Usage Commands

### Development
```bash
# Start all services (from repository root)
./dev.sh

# Or specific modes
./dev.sh -m frontend
./dev.sh -m backend
./dev.sh -m db

# Cleanup
./cleanup.sh
```

### Docker Services
```bash
# All services use "parlae-" prefix
docker ps | grep parlae-

# Containers:
- parlae-postgres
- parlae-localstack
- parlae-backend
- parlae-frontend
```

### Database Connection
```bash
# PostgreSQL connection string
postgresql://parlae:parlae@localhost:5433/parlae

# Connect with psql
psql postgresql://parlae:parlae@localhost:5433/parlae
```

## Remaining Items

### Documentation
The README.md and other documentation files still reference "dentia" in many places. These are mostly:
1. Historical references in the starter kit template
2. References to companion repositories:
   - `dentiahub` (forum repository)
   - `dentia-infra` (infrastructure repository)
   - `dentiahub-infra` (forum infrastructure repository)

### Note
The companion repositories (`dentiahub`, `dentia-infra`, `dentiahub-infra`) may still use the "dentia" naming. Those would need to be updated separately if they're being renamed.

## Testing Checklist

- ✅ `./dev.sh --help` - Shows correct branding
- ✅ Git remote configured
- ✅ GitHub secrets configured
- ⏳ Full dev environment test: `./dev.sh` (ready to test)
- ⏳ Docker compose test: `./dev.sh --docker` (ready to test)
- ⏳ Cleanup test: `./cleanup.sh` (ready to test)

## Next Steps

1. Test the development environment with `./dev.sh`
2. If companion repositories are being renamed, update cross-references
3. Update README.md if this is no longer a "starter kit" and is specifically Parlae
4. Update documentation references as needed

## GitHub Actions Status

All GitHub secrets have been configured:
- ✅ AWS_ACCESS_KEY_ID
- ✅ AWS_SECRET_ACCESS_KEY
- ✅ AWS_REGION (us-east-2)
- ✅ ECR_REPOSITORY
- ✅ STRIPE_PUBLISHABLE_KEY_PROD

Workflow files have been fixed to use the correct secret references.
