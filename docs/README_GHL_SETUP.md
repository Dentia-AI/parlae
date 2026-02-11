# GoHighLevel Setup Script

## ⚠️ SECURITY WARNING

The `setup-ghl.sh` script in this directory **contains your actual GHL credentials** and should NOT be committed to git.

## 📁 Files in This Directory

| File | Description | Git Status |
|------|-------------|------------|
| `setup-ghl.sh.template` | Template without credentials | ✅ Safe to commit |
| `setup-ghl.sh` | **Contains actual credentials** | ❌ **GITIGNORED** |
| `README_GHL_SETUP.md` | This file | ✅ Safe to commit |

## 🚀 How to Use

### First Time Setup

1. **Copy the template:**
   ```bash
   cp scripts/setup-ghl.sh.template scripts/setup-ghl.sh
   ```

2. **Edit the file and add your credentials:**
   ```bash
   # Option A: Edit manually
   nano scripts/setup-ghl.sh
   # Add your credentials at the top
   
   # Option B: Or let the script prompt you
   # Just run it without credentials set
   ```

3. **Run the setup:**
   ```bash
   ./scripts/setup-ghl.sh
   ```

### Using Environment Variables

You can also set credentials as environment variables:

```bash
export GHL_API_KEY="your-api-key"
export GHL_LOCATION_ID="your-location-id"
export GHL_WIDGET_ID="your-widget-id"
export GHL_CALENDAR_ID="your-calendar-id"

./scripts/setup-ghl.sh
```

## 🔒 Security Best Practices

### ✅ DO

- Copy `setup-ghl.sh.template` to `setup-ghl.sh` locally
- Add credentials only to your local `setup-ghl.sh`
- Keep `setup-ghl.sh` in `.gitignore`
- Use environment variables when possible
- Delete `setup-ghl.sh` if you no longer need it

### ❌ DON'T

- **Never commit `setup-ghl.sh` with actual credentials**
- Don't share the file with credentials
- Don't email or Slack the script
- Don't put it in shared drives

## 🧹 Cleanup

If you've already committed the script with credentials:

```bash
# Remove from git history (requires force push - be careful!)
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch scripts/setup-ghl.sh" \
  --prune-empty --tag-name-filter cat -- --all

# Or better: Just rotate your API keys in GoHighLevel
# Then update all your environments with new keys
```

## 🆘 If Credentials Were Exposed

1. **Immediately revoke the API key in GoHighLevel**
   - Log in to GHL
   - Go to Settings → Company → API Keys
   - Delete the exposed key
   - Generate a new one

2. **Update all environments:**
   - Local `.env.local`
   - AWS SSM Parameter Store
   - Any deployed services

3. **Run setup again with new credentials**

## 📚 Alternative: Use the Template Directly

If you prefer not to have a local setup script with credentials:

```bash
# Just use the template and it will prompt you
./scripts/setup-ghl.sh.template

# Or set env vars first
export GHL_API_KEY="your-key"
export GHL_LOCATION_ID="your-location"
export GHL_WIDGET_ID="your-widget"
export GHL_CALENDAR_ID="your-calendar"

./scripts/setup-ghl.sh.template
```

---

**Last Updated**: November 2024  
**Security Level**: Critical

