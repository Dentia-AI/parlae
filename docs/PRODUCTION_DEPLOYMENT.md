# Production Deployment Guide

## Issue: Special Characters in Database Password

When deploying to production, special characters in database passwords need to be URL-encoded.

### Problem
Your password `S7#tY4^zN9_Rq2+xS8!nV9d` contains special characters that break the connection string:
- `#` is interpreted as a URL fragment
- `^`, `+`, `!` are reserved characters

### URL-Encoded Character Reference
```
#  →  %23
^  →  %5E
+  →  %2B
!  →  %21
_  →  %5F (not required, but safe)
```

---

## Solution: Use the Deployment Script

### Quick Start

```bash
cd /Users/shaunk/Projects/Dentia/dentia

# Run the deployment script
./scripts/deploy-production-migrations.sh
```

The script will:
1. ✅ Automatically URL-encode the password
2. ✅ Deploy all migrations
3. ✅ Optionally seed roles and permissions

---

## Manual Commands (If Needed)

### Option 1: With URL-Encoded Password

```bash
cd /Users/shaunk/Projects/Dentia/dentia

PRISMA_IGNORE_ENV_FILE=1 \
DATABASE_URL='postgresql://dentia_admin:S7%23tY4%5EzN9_Rq2%2BxS8%21nV9d@localhost:15432/dentia?schema=public' \
pnpm --filter @kit/prisma migrate:deploy
```

### Option 2: Using Python to Encode

```bash
# Generate the encoded URL
python3 << EOF
import urllib.parse
password = "S7#tY4^zN9_Rq2+xS8!nV9d"
encoded = urllib.parse.quote(password, safe='')
url = f"postgresql://dentia_admin:{encoded}@localhost:15432/dentia?schema=public"
print(url)
EOF

# Copy the output and use it
PRISMA_IGNORE_ENV_FILE=1 \
DATABASE_URL='<PASTE_ENCODED_URL_HERE>' \
pnpm --filter @kit/prisma migrate:deploy
```

### Option 3: Using Node.js to Encode

```bash
# Generate the encoded URL
node -e "
const password = 'S7#tY4^zN9_Rq2+xS8!nV9d';
const encoded = encodeURIComponent(password);
const url = \`postgresql://dentia_admin:\${encoded}@localhost:15432/dentia?schema=public\`;
console.log(url);
"

# Copy the output and use it
```

---

## Deployment Steps

### Step 1: Deploy Migrations

```bash
cd /Users/shaunk/Projects/Dentia/dentia

# Using the script (recommended)
./scripts/deploy-production-migrations.sh

# OR manually with encoded password
PRISMA_IGNORE_ENV_FILE=1 \
DATABASE_URL='postgresql://dentia_admin:S7%23tY4%5EzN9_Rq2%2BxS8%21nV9d@localhost:15432/dentia?schema=public' \
pnpm --filter @kit/prisma migrate:deploy
```

### Step 2: Seed Roles and Permissions

```bash
PRISMA_IGNORE_ENV_FILE=1 \
DATABASE_URL='postgresql://dentia_admin:S7%23tY4%5EzN9_Rq2%2BxS8%21nV9d@localhost:15432/dentia?schema=public' \
pnpm --filter @kit/prisma db:seed
```

### Step 3: Verify Tables

```bash
# Connect to production database
PGPASSWORD='S7#tY4^zN9_Rq2+xS8!nV9d' \
psql -h localhost -p 15432 -U dentia_admin -d dentia

# List all tables
\dt

# Check roles
SELECT name, "hierarchyLevel" FROM roles ORDER BY "hierarchyLevel";

# Check permissions per role
SELECT r.name, COUNT(rp.*) as permissions
FROM roles r
LEFT JOIN role_permissions rp ON r.name = rp."roleName"
GROUP BY r.name
ORDER BY r."hierarchyLevel";

# Exit psql
\q
```

---

## Expected Tables After Migration

After successful migration, you should have these tables:

### Core Tables
- `users` - User accounts (account managers and employees)
- `accounts` - Client accounts (personal and managed)
- `account_memberships` - User-account relationships with roles
- `roles` - Permission roles (owner, admin, editor, viewer)
- `role_permissions` - Permissions assigned to each role
- `invitations` - Employee invitation tokens

### Business Tables
- `ads` - Advertisement records
- `meta_ad_campaigns` - Meta/Facebook ad campaigns
- `files` - File uploads
- `source_content` - Content sources
- `user_transactions` - Financial transactions

### Supporting Tables
- `subscriptions` - Billing subscriptions
- `orders` - Purchase orders
- `nonces` - One-time tokens for security

---

## Verification Queries

After deployment, run these to verify everything is correct:

### 1. Check Roles
```sql
SELECT name, "hierarchyLevel" FROM roles ORDER BY "hierarchyLevel";
```

Expected output:
```
   name   | hierarchyLevel
----------+---------------
 owner    |             1
 admin    |             2
 editor   |             3
 viewer   |             4
```

### 2. Check Permission Counts
```sql
SELECT 
  r.name as role,
  COUNT(rp.permission) as permission_count
FROM roles r
LEFT JOIN role_permissions rp ON r.name = rp."roleName"
GROUP BY r.name
ORDER BY r."hierarchyLevel";
```

Expected output:
```
  role  | permission_count
--------+-----------------
 owner  |              14
 admin  |              13
 editor |               9
 viewer |               5
```

### 3. Check All Tables Exist
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

### 4. Check Test User (If Seeded)
```sql
SELECT id, email, "displayName", role FROM users WHERE email = 'test@example.com';
```

---

## Troubleshooting

### Error: "invalid port number in database URL"
**Cause**: Special characters in password not URL-encoded  
**Solution**: Use the deployment script or manually encode the password

### Error: "Authentication failed"
**Cause**: Incorrect credentials or encoded password  
**Solution**: 
1. Verify password is correct
2. Ensure encoding is proper
3. Check database user has correct permissions

### Error: "Connection refused"
**Cause**: Database not accessible or port forwarding not set up  
**Solution**:
```bash
# Check if port forwarding is active
lsof -i :15432

# If using SSH tunnel, ensure it's running:
ssh -L 15432:localhost:5432 your-server -N
```

### Error: "relation already exists"
**Cause**: Tables already exist from previous attempts  
**Solution**: 
```bash
# Check migration history
PRISMA_IGNORE_ENV_FILE=1 \
DATABASE_URL='...' \
pnpm --filter @kit/prisma migrate status

# If needed, reset (⚠️ DESTRUCTIVE - only for fresh setup)
# This will DROP ALL TABLES
PRISMA_IGNORE_ENV_FILE=1 \
DATABASE_URL='...' \
pnpm --filter @kit/prisma migrate reset
```

---

## Environment Variables for Production

If deploying to ECS or similar, add these environment variables:

```bash
DATABASE_URL=postgresql://dentia_admin:S7%23tY4%5EzN9_Rq2%2BxS8%21nV9d@your-rds-endpoint:5432/dentia?schema=public
```

Or use AWS Secrets Manager/SSM Parameter Store and retrieve at runtime.

---

## Quick Reference: Your Encoded Password

```
Original: S7#tY4^zN9_Rq2+xS8!nV9d
Encoded:  S7%23tY4%5EzN9_Rq2%2BxS8%21nV9d
```

Full connection string:
```
postgresql://dentia_admin:S7%23tY4%5EzN9_Rq2%2BxS8%21nV9d@localhost:15432/dentia?schema=public
```

---

## Security Note

⚠️ **Never commit passwords to git**

For production deployments:
1. Use environment variables
2. Use AWS Secrets Manager / SSM Parameter Store
3. Use `.env` files that are gitignored
4. Rotate passwords regularly

---

## Post-Deployment Checklist

- [ ] Migrations deployed successfully
- [ ] All tables created (verify with `\dt`)
- [ ] Roles seeded (4 roles: owner, admin, editor, viewer)
- [ ] Permissions seeded (14 total permissions)
- [ ] Test user created (optional)
- [ ] Connection string added to production environment variables
- [ ] Frontend environment variables updated
- [ ] Test signup flow in production
- [ ] Test employee invitation in production

---

## Need Help?

If you encounter issues:

1. Check the error message carefully
2. Verify password encoding is correct
3. Ensure database is accessible (port forwarding, network, etc.)
4. Check migration history: `pnpm --filter @kit/prisma migrate status`
5. Review Prisma logs for detailed errors

---

## Next Steps After Deployment

1. **Test Signup Flow**
   - Sign up as account manager
   - Verify personal account created
   
2. **Test Employee Invitation**
   - Invite an employee
   - Accept invitation
   - Verify employee access

3. **Configure Email Service**
   - Update `invite-employee.ts` to use SendGrid/AWS SES
   - Test invitation emails

4. **Add Translation Files**
   - Add i18n keys to translation files
   - Test with different locales

5. **Monitor Logs**
   - Check CloudWatch logs for errors
   - Monitor database performance
   - Set up alerts

---

## Success! 🎉

Once migrations are deployed and verified, your production database is ready for the multi-tenant agency platform!

