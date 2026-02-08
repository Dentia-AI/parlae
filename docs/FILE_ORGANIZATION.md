# File Organization Summary

This document shows where all Meta integration files are located after reorganization.

## 📁 Directory Structure

```
dentia/
├── META_README.md              # Quick pointer to documentation
├── .env                        # Your local secrets (gitignored)
├── .env.meta.example          # Safe template for .env
├── docker-compose.yml         # Backend config (no hardcoded secrets)
│
├── docs/                       # All documentation
│   ├── START_HERE_META.md           ⭐ Start here!
│   ├── META_QUICK_REFERENCE.md      Quick lookup
│   ├── META_APP_REGISTRATION_GUIDE.md   Detailed guide
│   ├── META_CONFIGURATION_COMPLETE.md   Technical details
│   ├── META_SECURITY_NOTES.md        Security best practices
│   ├── META_CORRECTED_SETUP.md      What was fixed
│   ├── META_CHANGES_SUMMARY.md      Summary of changes
│   └── META_SETUP_SUMMARY.md        Original summary
│
├── scripts/                    # All scripts
│   └── SETUP_META.sh          # Quick setup automation
│
└── apps/backend/src/meta/      # Backend code
    ├── meta.controller.ts      # Data deletion endpoint
    ├── meta.service.ts         # Business logic
    └── meta.module.ts          # Module config
```

## 🚀 Quick Start

```bash
# 1. Run setup script
./scripts/SETUP_META.sh

# 2. Start backend
docker-compose up -d backend

# 3. Register with Meta
# See docs/START_HERE_META.md
```

## 📚 Documentation Quick Access

| When you need... | Read this file... |
|------------------|-------------------|
| **Quick setup** | `docs/START_HERE_META.md` |
| **Fast URL lookup** | `docs/META_QUICK_REFERENCE.md` |
| **Full guide** | `docs/META_APP_REGISTRATION_GUIDE.md` |
| **What changed** | `docs/META_CHANGES_SUMMARY.md` |
| **Security info** | `docs/META_SECURITY_NOTES.md` |

## 🔧 Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `scripts/SETUP_META.sh` | Automated local setup | `./scripts/SETUP_META.sh` |

## 🌐 Important URLs

### For Meta Registration (Production)
- Privacy Policy: `https://www.dentiaapp.com/privacy-policy`
- Terms of Service: `https://www.dentiaapp.com/terms-of-service`
- Data Deletion: `https://api.dentiaapp.com/meta/data-deletion`

### Local Testing
- Privacy Policy: `http://localhost:3009/privacy-policy`
- Terms of Service: `http://localhost:3009/terms-of-service`
- Data Deletion: `http://localhost:4001/meta/data-deletion`

## 🔐 Credentials Location

| What | Where | Committed? |
|------|-------|-----------|
| App ID | `docker-compose.yml` (default) | ✅ Yes (it's public) |
| App Secret | `.env` file | ❌ No (gitignored) |
| App Secret | AWS SSM Parameter Store | ❌ No (encrypted) |

## 📝 What's Safe to Commit

### ✅ Safe to Commit
- All files in `docs/`
- All files in `scripts/`
- `META_README.md`
- `.env.meta.example`
- `docker-compose.yml` (no secrets in it)
- Backend code in `apps/backend/src/meta/`

### ❌ Never Commit
- `.env` (gitignored)
- Any file with `your-meta-app-secret-here` hardcoded

## 🔄 Migration Notes

All Meta-related files have been organized:
- ✅ Documentation moved to `docs/`
- ✅ Scripts moved to `scripts/`
- ✅ Root kept clean with just `META_README.md` as pointer
- ✅ All secrets removed from committed files
- ✅ URLs corrected to use public website (www)

---

**For setup instructions, start with: `docs/START_HERE_META.md`**
