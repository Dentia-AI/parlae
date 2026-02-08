# 🚨 SECURITY ACTION REQUIRED

## ⚠️ Tracked .env Files Found

**Status**: 🟡 **ACTION REQUIRED**

---

## 🔍 Issue

The following `.env` files are **currently tracked by git**:

```
apps/frontend/apps/web/.env
apps/frontend/apps/web/.env.development
apps/frontend/apps/web/.env.production
```

**Risk**: These files may contain sensitive information that should not be in version control.

---

## 📋 Immediate Actions Required

### Step 1: Review the Files

Check if these files contain any sensitive data:

```bash
# Review each file for secrets
cat apps/frontend/apps/web/.env
cat apps/frontend/apps/web/.env.development  
cat apps/frontend/apps/web/.env.production
```

**Look for**:
- Database passwords
- API keys
- Secrets (Stripe, AWS, etc.)
- Real Cognito credentials
- Any production credentials

---

### Step 2: Remove from Git Tracking

**If files contain only public variables (NEXT_PUBLIC_*)**: Keep them
**If files contain ANY secrets**: Remove them immediately

#### To Remove Files from Git:

```bash
cd /Users/shaunk/Projects/Dentia/dentia

# Remove files from git tracking (but keep locally)
git rm --cached apps/frontend/apps/web/.env
git rm --cached apps/frontend/apps/web/.env.development
git rm --cached apps/frontend/apps/web/.env.production

# Commit the removal
git commit -m "chore: remove tracked .env files from git"

# Push to remote
git push origin main
```

**Important**: This only removes the files from future commits. They still exist in git history!

---

### Step 3: Clean Git History (If Secrets Found)

If the files contain **real secrets**, you need to remove them from git history:

#### Option A: BFG Repo-Cleaner (Recommended)

```bash
# Install BFG
brew install bfg

# Backup your repo first!
cd ..
cp -r dentia dentia-backup

# Clean the files from history
cd dentia
bfg --delete-files .env
bfg --delete-files .env.development
bfg --delete-files .env.production

# Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (WARNING: Coordinate with team!)
git push origin --force --all
```

#### Option B: git-filter-repo

```bash
# Install git-filter-repo
brew install git-filter-repo

# Backup first!
cd ..
cp -r dentia dentia-backup

# Remove the files from history
cd dentia
git filter-repo --path apps/frontend/apps/web/.env --invert-paths
git filter-repo --path apps/frontend/apps/web/.env.development --invert-paths
git filter-repo --path apps/frontend/apps/web/.env.production --invert-paths

# Force push (WARNING: Coordinate with team!)
git push origin --force --all
```

---

### Step 4: Rotate Secrets

**If secrets were found in these files**:

1. ✅ **Immediately rotate** all exposed secrets:
   - Database passwords
   - API keys (Stripe, GHL, etc.)
   - AWS credentials
   - Cognito secrets
   - NEXTAUTH_SECRET

2. ✅ **Update in production**:
   - Update environment variables in ECS
   - Update GitHub Secrets
   - Update any other deployment configs

3. ✅ **Notify team** if applicable

---

## 🔐 Correct Setup

### What SHOULD be in Git

**Only commit**:
- `.env.example` ✅ (template file)
- Files with ONLY `NEXT_PUBLIC_*` variables ✅ (if absolutely necessary)

### What should NOT be in Git

**Never commit**:
- `.env` ❌
- `.env.local` ❌
- `.env.development` ❌ (unless only public vars)
- `.env.production` ❌
- `.env.test` ❌
- Any file with secrets ❌

---

## ✅ Verification

After removing the files, verify they're no longer tracked:

```bash
# Check git tracking
git ls-files | grep "\.env"

# Should only show:
# .env.example (if you have one)

# If still showing the files:
git rm --cached <file>
git commit -m "Remove tracked env file"
```

---

## 🎯 Next.js Specific Guidance

### Next.js Environment Variables

Next.js has special handling for environment variables:

#### Public Variables (Can be committed if needed)
```bash
# These are bundled into the client-side JavaScript
NEXT_PUBLIC_APP_URL=https://example.com
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

**Note**: Even `NEXT_PUBLIC_*` variables should generally not be committed. Use CI/CD to inject them.

#### Private Variables (NEVER commit)
```bash
# These are server-side only
DATABASE_URL=postgresql://...
STRIPE_SECRET_KEY=sk_live_...
NEXTAUTH_SECRET=...
```

**Rule**: If it's a secret, it should NEVER be committed!

---

## 📝 Best Practices Going Forward

### 1. Use .env.example

Create a template:

```bash
# .env.example
NEXT_PUBLIC_APP_URL=http://localhost:3000
DATABASE_URL=postgresql://user:password@localhost:5432/db
STRIPE_SECRET_KEY=sk_test_...
NEXTAUTH_SECRET=your-secret-here
```

### 2. Set Up Pre-commit Hooks

```bash
# Install git-secrets
brew install git-secrets

# Set up for this repo
cd /Users/shaunk/Projects/Dentia/dentia
git secrets --install
git secrets --register-aws
git secrets --add 'sk_live_[0-9A-Za-z]*'
git secrets --add 'sk_test_[0-9A-Za-z]*'
git secrets --add 'NEXT.*_SECRET.*=.*[A-Za-z0-9]{20,}'
```

### 3. Use Environment Variable Management

**For Development**:
- Use `.env.local` (gitignored)
- Copy from `.env.example`
- Never commit

**For Production**:
- Use AWS Systems Manager Parameter Store
- Use AWS Secrets Manager
- Use GitHub Secrets for CI/CD

---

## 🚨 Checklist

Before continuing, complete these steps:

- [ ] Review the 3 .env files for secrets
- [ ] If secrets found: Remove files from git tracking
- [ ] If secrets found: Clean git history
- [ ] If secrets found: Rotate all exposed secrets
- [ ] Verify files are no longer tracked
- [ ] Ensure .gitignore is updated (already done ✅)
- [ ] Set up pre-commit hooks (optional but recommended)
- [ ] Update team on changes

---

## 📞 Need Help?

If you find secrets in these files and need help:

1. **Stop pushing to git** immediately
2. **Rotate all exposed secrets** ASAP
3. **Follow the cleanup steps** above
4. **Update production** environments

---

## 🎯 Summary

**Current Status**: 
- ✅ `.gitignore` updated to prevent future issues
- 🟡 3 `.env` files currently tracked in git
- ⚠️ Files need to be reviewed and potentially removed

**Next Steps**:
1. Review the files
2. Remove from git if they contain secrets
3. Rotate secrets if exposed
4. Verify cleanup

---

**Created**: November 14, 2024  
**Priority**: 🔴 **HIGH** - Review immediately  
**Files to Check**:
- `apps/frontend/apps/web/.env`
- `apps/frontend/apps/web/.env.development`
- `apps/frontend/apps/web/.env.production`

