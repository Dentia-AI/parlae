# Database Migrations Guide

This guide explains how database migrations work in different environments and how to deploy them.

## 🏗️ **Architecture Overview**

### Migration Strategy by Environment

| Environment | Access to DB | Migration Method | When Migrations Run |
|-------------|--------------|------------------|---------------------|
| **Local Development** | ✅ Via port forwarding (localhost:15432) | Manual script | When you run the script |
| **GitHub Actions (CI/CD)** | ❌ No access (outside VPC) | N/A - builds images only | Not applicable |
| **ECS Containers (Production/Dev)** | ✅ Inside AWS VPC | Automatic on startup | Every time a container starts |

### Key Principle: Idempotent Migrations

Prisma's `migrate deploy` command is **idempotent**, meaning:
- ✅ Only new migrations are applied
- ✅ Already-applied migrations are automatically skipped
- ✅ Safe to run multiple times
- ✅ Safe to run on every container startup

This is tracked in the `_prisma_migrations` table in your database.

---

## 📝 **Creating New Migrations**

### Step 1: Create the Migration Locally

```bash
# Make changes to packages/prisma/schema.prisma
# Then create a migration

cd packages/prisma
npx prisma migrate dev --name your_migration_name
```

This creates a new directory in `packages/prisma/migrations/` with:
- A timestamp prefix (e.g., `20251104212242_`)
- Your migration name
- A `migration.sql` file with the SQL changes

### Step 2: Commit the Migration

```bash
git add packages/prisma/migrations/
git add packages/prisma/schema.prisma
git commit -m "Add migration: your_migration_name"
git push
```

---

## 🚀 **Deploying Migrations**

### Option 1: Local Deployment (Manual)

**When to use**: Testing migrations locally before production deployment.

#### Using the Local Script

```bash
cd /Users/shaunk/Projects/Dentia/dentia

# Set your DATABASE_URL (with URL-encoded password)
export DATABASE_URL='postgresql://dentia_admin:S7%23tY4%5EzN9_Rq2%2BxS8%21nV9d@localhost:15432/dentia?schema=public'

# Run migrations
./scripts/deploy-migrations-local.sh
```

#### Using the dentia-infra Script

```bash
cd /Users/shaunk/Projects/Dentia/dentia-infra/infra/scripts
./deploy-production-migrations-run-from-dentia.sh
```

#### Password URL Encoding Reference

Your password: `S7#tY4^zN9_Rq2+xS8!nV9d`

URL-encoded: `S7%23tY4%5EzN9_Rq2%2BxS8%21nV9d`

| Character | Encoded |
|-----------|---------|
| `#` | `%23` |
| `^` | `%5E` |
| `+` | `%2B` |
| `!` | `%21` |

---

### Option 2: Production/Dev Deployment (Automatic)

**When to use**: Normal production/dev deployments.

Migrations run **automatically** when ECS containers start. No manual intervention needed!

#### How It Works

1. **Docker Image Built**: Contains migration files and `migrate-and-start.sh` script
2. **Container Starts**: ECS starts a new task
3. **Entrypoint Runs**: `migrate-and-start.sh` executes
4. **Migrations Applied**: `prisma migrate deploy` runs (only new migrations)
5. **App Starts**: If migrations succeed, the application starts
6. **Rollback**: If migrations fail, container fails to start (safe!)

#### Deployment Process

```bash
cd /Users/shaunk/Projects/Dentia/dentia

# Build and push images
docker build -f infra/docker/frontend.Dockerfile -t dentia-frontend:latest .
docker build -f infra/docker/backend.Dockerfile -t dentia-backend:latest .

# Tag and push to ECR
docker tag dentia-frontend:latest <ecr-uri>/dentia-frontend:latest
docker push <ecr-uri>/dentia-frontend:latest

# Update ECS service (this triggers migration on container startup)
aws ecs update-service \
  --cluster dentia-cluster \
  --service dentia-frontend-service \
  --force-new-deployment \
  --profile dentia \
  --region us-east-2
```

Or use the combined script:

```bash
./scripts/fix-cognito-signin.sh
```

---

## 🔍 **Verifying Migrations**

### Check Migration Status Locally

```bash
cd packages/prisma
DATABASE_URL='postgresql://...' npx prisma migrate status
```

### Check Migration Status in Production

View CloudWatch logs for your ECS tasks. Look for:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗄️  Running Database Migrations
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Running prisma migrate deploy...

The following migrations have been applied:
  20251030031945_first_mig
  20251104175917_add_user_roles_and_permissions
  20251104212242_add_cognito_username

✅ Migrations completed successfully
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 Starting application...
```

### Check Applied Migrations in Database

```sql
-- Connect to your database and run:
SELECT * FROM _prisma_migrations ORDER BY finished_at DESC;
```

---

## 🔧 **Files & Configuration**

### Migration Scripts

| Script | Purpose | Environment |
|--------|---------|-------------|
| `scripts/deploy-migrations-local.sh` | Deploy migrations from your local machine | Local (via port forwarding) |
| `scripts/migrate-and-start.sh` | Run migrations then start app (Docker entrypoint) | ECS containers |
| `scripts/deploy-migrations.sh` | Deploy migrations via AWS SSM (if DB was publicly accessible) | Not applicable (DB is in VPC) |

### Dockerfiles

Both `infra/docker/frontend.Dockerfile` and `infra/docker/backend.Dockerfile` now:

1. **Copy Prisma files** to the runtime image:
   - `packages/prisma/migrations/` - All migration SQL files
   - `packages/prisma/schema.prisma` - Schema definition
   - `node_modules/.prisma/` - Generated Prisma client
   - `node_modules/@prisma/` - Prisma CLI and engines

2. **Copy migration script**: `scripts/migrate-and-start.sh`

3. **Set entrypoint**: 
   ```dockerfile
   ENTRYPOINT ["/app/migrate-and-start.sh"]
   CMD ["node", "apps/frontend/apps/web/server.js"]
   ```

### GitHub Actions (Optional)

Example workflows provided in:
- `.github/workflows/deploy-production.yml.example`
- `.github/workflows/deploy-dev.yml.example`

To use them:
1. Rename `.example` to `.yml`
2. Add secrets to GitHub: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
3. Adjust repository names and cluster names if needed

**Note**: GitHub Actions **do not** run migrations directly. They only build and push Docker images. Migrations run when ECS starts the containers.

---

## ⚠️ **Important Notes**

### 1. Migration Safety

- ✅ **Always test migrations locally first** using `deploy-migrations-local.sh`
- ✅ **Backup your database** before deploying breaking changes
- ✅ Migrations run **before** the app starts, so failed migrations prevent bad deployments
- ❌ **Never** manually edit migration files after they've been applied
- ❌ **Never** delete migration files from the migrations directory

### 2. Multiple Containers

If you have multiple ECS tasks running:
- Each container will try to run migrations on startup
- Prisma handles concurrent migration attempts safely
- Only one will succeed in applying new migrations
- Others will see "No pending migrations" and continue

### 3. Rollback Strategy

To rollback a migration:

```bash
# Option 1: Rollback to specific migration
cd packages/prisma
npx prisma migrate resolve --rolled-back <migration-name>

# Option 2: Restore database from backup
# (Recommended for production)
```

### 4. Long-Running Migrations

For migrations that take a long time:
- Consider increasing ECS task startup timeout
- Monitor CloudWatch logs to see migration progress
- For very large changes, consider running migrations manually via AWS Systems Manager Session Manager

---

## 🐛 **Troubleshooting**

### Problem: Container fails to start after deployment

**Symptom**: ECS tasks keep restarting

**Solution**: Check CloudWatch logs for migration errors

```bash
aws logs tail /ecs/dentia-frontend --follow --profile dentia --region us-east-2
```

### Problem: Migration fails with "already exists"

**Symptom**: Error about table/column already existing

**Solution**: Mark the migration as resolved

```bash
cd packages/prisma
npx prisma migrate resolve --applied <migration-name>
```

### Problem: Can't connect to database locally

**Symptom**: `Can't reach database server`

**Solution**: Ensure port forwarding is active

```bash
# Check if port 15432 is listening
lsof -i :15432

# If not, restart your SSH tunnel or port forwarding
```

### Problem: Password encoding issues

**Symptom**: `invalid port number in database URL`

**Solution**: Properly URL-encode the password

```bash
# Use this helper to encode:
node -e "console.log(encodeURIComponent('your-password-here'))"
```

---

## 📚 **Additional Resources**

- [Prisma Migrate Documentation](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [Prisma Production Deployment Guide](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-aws-ecs)
- [AWS ECS Task Entrypoints](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/docker-basics.html#docker-basics-entrypoint)

---

## 🎯 **Quick Reference**

### Create a new migration
```bash
cd packages/prisma
npx prisma migrate dev --name your_migration_name
git add . && git commit -m "Add migration: your_migration_name"
```

### Deploy locally
```bash
export DATABASE_URL='postgresql://...'
./scripts/deploy-migrations-local.sh
```

### Deploy to production
```bash
# Build and push images (migrations run automatically on container startup)
./scripts/fix-cognito-signin.sh
```

### Check migration status in production
```bash
aws logs tail /ecs/dentia-frontend --follow --profile dentia --region us-east-2 | grep -A 10 "Running Database Migrations"
```

---

## ✅ **Summary**

- 🔧 **Local**: Use `deploy-migrations-local.sh` with port forwarding
- 🚀 **Production/Dev**: Migrations run automatically on container startup
- 📦 **CI/CD**: GitHub Actions build images (don't run migrations)
- 🔒 **Safety**: Prisma ensures migrations are idempotent and safe to retry
- 📊 **Monitoring**: Check CloudWatch logs to verify migration success

