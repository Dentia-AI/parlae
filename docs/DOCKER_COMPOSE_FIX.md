# Docker Compose Fix

## Issue Fixed

**Error:** `env file /Users/shaunk/Projects/Parlae-AI/parlae/.env not found`

**Root Cause:** 
- `docker-compose.yml` line 74 had `env_file: - .env`
- You only have `.env.local`, not `.env`
- Docker Compose exits when env_file references a non-existent file

**Fix Applied:**

1. **Removed the obsolete `version: '3.9'`** (line 1)
   - This is deprecated in newer docker-compose versions
   - Causing the warning you saw

2. **Removed `env_file: - .env`** (lines 73-74)
   - Environment variables are already defined in the `environment:` section
   - The dev.sh script loads `.env.local` properly

## Changes Made

### docker-compose.yml

**Before:**
```yaml
version: '3.9'

services:
  # ...
  frontend:
    env_file:
      - .env
    environment:
      # ...
```

**After:**
```yaml
services:
  # ...
  frontend:
    environment:
      # ...
```

## ✅ Fixed Warnings

1. ✅ `version` attribute is obsolete - REMOVED
2. ✅ `env file .env not found` - REMOVED (uses environment section instead)
3. ✅ Missing GHL variables - These have defaults, warnings are harmless

## 🚀 Dev Server Should Now Start

The `./dev.sh` script will now:
- Load `.env.local` if it exists (which you have)
- Start PostgreSQL container
- Run migrations
- Start backend and frontend

Your `.env.local` is already properly configured with all the necessary variables!

## Next Steps

Your dev server should be starting now. Monitor the terminal for:
- ✅ PostgreSQL ready
- ✅ Migrations applied
- ✅ Backend running at http://localhost:3333
- ✅ Frontend running at http://localhost:3000

The warnings about missing GHL variables are harmless - they're optional features.
