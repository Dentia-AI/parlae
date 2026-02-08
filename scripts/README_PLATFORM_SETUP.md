# Platform API Keys Setup

> **⚠️ OUTDATED DOCUMENTATION**: This document describes advertising platform integrations (Meta, TikTok, Twitter, Snapchat, Reddit, Google Ads) that have been removed from this starter kit. This file is kept for historical reference only.

## ⚠️ SECURITY NOTICE

Platform credentials are **NOT stored in this repository** for security reasons.

## 🔑 Where to Get Credentials

All platform credentials are stored in the **private `dentia-infra` repository**.

### For Local Development

Run the setup script from `dentia-infra`:

```bash
cd /Users/shaunk/Projects/Dentia/dentia-infra
./infra/scripts/setup-local-env.sh
```

This will:
- Create/update `dentia/.env` with all platform credentials
- Configure Meta, TikTok, Twitter, Snapchat, Reddit, Google Ads, and GoHighLevel
- Set up everything for local development

### For Production Deployment

```bash
cd /Users/shaunk/Projects/Dentia/dentia-infra
./infra/scripts/put-ssm-secrets.sh
```

This uploads all credentials to AWS SSM Parameter Store.

---

## 📚 Platform Credentials Included

The setup includes credentials for:

1. **Meta/Facebook** - Social media ads
2. **TikTok** - Production & Sandbox
3. **Twitter/X** - Social media integration
4. **Google Ads** - Advertising platform
5. **Snapchat** - Ads platform
6. **Reddit** - Social platform
7. **GoHighLevel** - CRM & automation

---

## 🚫 What NOT to Do

- ❌ Don't create `setup-meta.sh` or `setup-platform-keys.sh` in this repo
- ❌ Don't add credentials to any files in `dentia` repo
- ❌ Don't commit `.env` files with real values
- ❌ Don't share credentials via email/Slack

## ✅ What TO Do

- ✅ Use `dentia-infra/infra/scripts/setup-local-env.sh` for local setup
- ✅ Use `dentia-infra/infra/scripts/put-ssm-secrets.sh` for production
- ✅ Keep credentials only in private `dentia-infra` repo
- ✅ Share access to `dentia-infra` repo only with authorized team members

---

## 📁 Repository Structure

```
dentia/               # This repo - NO credentials
├── scripts/
│   └── README_PLATFORM_SETUP.md    # This file (instructions only)
└── .env              # Gitignored (created by setup script)

dentia-infra/        # Private repo - HAS credentials
├── infra/scripts/
│   ├── setup-local-env.sh          # Local development setup
│   ├── put-ssm-secrets.sh          # Production deployment
│   ├── put-ssm-secrets-dev.sh      # Dev environment
│   └── put-ssm-secrets-dev-standalone.sh
```

---

## 🆘 Need Help?

1. **Can't access `dentia-infra`**: Ask your team lead for repository access
2. **Missing credentials**: Run `setup-local-env.sh` from `dentia-infra`
3. **Production issues**: Check AWS SSM Parameter Store

---

## 🔒 Security Policy

See [SECURITY_CREDENTIALS.md](../SECURITY_CREDENTIALS.md) for complete security guidelines.

**Last Updated**: November 2024

