# 📚 Dentia Documentation

Complete documentation for the Dentia application.

---

## 🚀 Quick Start

### For Developers

**First time setup?** Start here:
1. [Local Development Guide](LOCAL_DEV_GUIDE.md) - Complete setup guide
2. [Dev Script Quick Reference](DEV_SCRIPT_QUICK_REFERENCE.md) - Command cheat sheet
3. [Local Dev Setup Complete](LOCAL_DEV_SETUP_COMPLETE.md) - What was configured

**Then run**:
```bash
./dev.sh
```

### For Testing

1. [Testing Quick Start](TESTING_QUICK_START.md) - Run tests immediately
2. [Testing Complete Summary](TESTING_COMPLETE_SUMMARY.md) - Full testing overview

### For Deployment

1. [Production Deployment](PRODUCTION_DEPLOYMENT.md) - Deploy to production
2. [CI/CD Setup Complete](CI_CD_SETUP_COMPLETE.md) - Automated testing/deployment

---

## 📖 Documentation Index

### Development

| Document | Description |
|----------|-------------|
| [Local Dev Guide](LOCAL_DEV_GUIDE.md) | Complete local development setup (600+ lines) |
| [Dev Script Quick Reference](DEV_SCRIPT_QUICK_REFERENCE.md) | Quick command reference for dev.sh |
| [Local Dev Setup Complete](LOCAL_DEV_SETUP_COMPLETE.md) | Summary of development setup |
| [Database Migrations Guide](DATABASE_MIGRATIONS_GUIDE.md) | Database migration procedures |

### Testing

| Document | Description |
|----------|-------------|
| [Testing Quick Start](TESTING_QUICK_START.md) | Get started with testing immediately |
| [Testing Complete Summary](TESTING_COMPLETE_SUMMARY.md) | Comprehensive testing overview (133 tests) |
| [API Testing Guide](API_TESTING_GUIDE.md) | API endpoint testing |
| [E2E Testing Guide](E2E_TESTING_GUIDE.md) | End-to-end testing guide |
| [Local Testing Guide](LOCAL_TESTING_GUIDE.md) | Local testing procedures |

### Deployment & CI/CD

| Document | Description |
|----------|-------------|
| [CI/CD Setup Complete](CI_CD_SETUP_COMPLETE.md) | GitHub Actions CI/CD configuration |
| [Production Deployment](PRODUCTION_DEPLOYMENT.md) | Production deployment guide |

### Security

| Document | Description |
|----------|-------------|
| [Security Audit Complete](SECURITY_AUDIT_COMPLETE.md) | Security audit results |
| [Security Action Required](SECURITY_ACTION_REQUIRED.md) | Security actions needed |

### GoHighLevel Integration

| Document | Description |
|----------|-------------|
| [GoHighLevel Quick Start](GOHIGHLEVEL_QUICK_START.md) | GHL integration quick start |
| [GoHighLevel Activity Quick Start](GOHIGHLEVEL_ACTIVITY_QUICK_START.md) | GHL activity tracking |
| [GoHighLevel Integration](GOHIGHLEVEL_INTEGRATION.md) | Complete GHL integration guide |
| [GoHighLevel Testing](GOHIGHLEVEL_TESTING.md) | GHL testing procedures |

### Other

| Document | Description |
|----------|-------------|
| [Review Checklist](REVIEW_CHECKLIST.md) | Code review checklist |
| [Session Summary](SESSION_SUMMARY.md) | Latest development session summary |

---

## 📂 Archive

Historical documentation (fixes, troubleshooting, implementation notes) has been moved to [`archive/`](archive/):

- Build and Docker fixes
- Cognito authentication troubleshooting
- JWT implementation fixes
- Database migration fixes
- UI and notification improvements
- Step-by-step implementation logs
- ChatGPT conversation logs

See [`archive/README.md`](archive/README.md) for a complete index.

---

## 🎯 Common Tasks

### Start Development
```bash
./dev.sh
# See: Local Dev Guide
```

### Run Tests
```bash
pnpm test
# See: Testing Quick Start
```

### Deploy to Production
```bash
# See: Production Deployment Guide
```

### Database Migrations
```bash
pnpm prisma:migrate
# See: Database Migrations Guide
```

---

## 📊 Documentation Stats

- **Active Guides**: 19 documents
- **Archived Docs**: 43 documents
- **Total Documentation**: 62+ documents
- **Lines of Documentation**: 10,000+

---

## 🔍 Finding Information

### By Topic

- **Setup**: Local Dev Guide, Local Dev Setup Complete
- **Testing**: Testing Quick Start, Testing Complete Summary
- **Deployment**: Production Deployment, CI/CD Setup
- **Security**: Security Audit, Security Action Required
- **Database**: Database Migrations Guide
- **GHL Integration**: GoHighLevel Quick Start, GHL Integration
- **Troubleshooting**: Check archive/ folder

### By Action

- **I want to start developing**: [Local Dev Guide](LOCAL_DEV_GUIDE.md)
- **I want to run tests**: [Testing Quick Start](TESTING_QUICK_START.md)
- **I want to deploy**: [Production Deployment](PRODUCTION_DEPLOYMENT.md)
- **I want to understand the setup**: [Session Summary](SESSION_SUMMARY.md)
- **I need quick commands**: [Dev Script Quick Reference](DEV_SCRIPT_QUICK_REFERENCE.md)

---

## 📝 Documentation Standards

### Active Documentation
Located in `docs/` - these are current, maintained guides that developers use regularly.

### Archived Documentation
Located in `docs/archive/` - these are historical records of:
- Bug fixes and troubleshooting sessions
- Implementation steps and iterations
- Debug logs and solutions
- One-time setup procedures
- Conversation logs

---

## 🤝 Contributing

When adding new documentation:

1. **Guides** → Place in `docs/`
2. **Troubleshooting/Fixes** → Place in `docs/archive/`
3. **Update this README** with new entries
4. **Use clear naming**: `TOPIC_TYPE.md` (e.g., `API_TESTING_GUIDE.md`)

---

## 📞 Getting Help

1. **Quick Reference**: [Dev Script Quick Reference](DEV_SCRIPT_QUICK_REFERENCE.md)
2. **Detailed Help**: [Local Dev Guide](LOCAL_DEV_GUIDE.md)
3. **Testing Help**: [Testing Quick Start](TESTING_QUICK_START.md)
4. **Historical Issues**: Check `archive/` folder

---

**Last Updated**: November 14, 2024
**Documentation Version**: 1.0
**Status**: ✅ Complete and organized

