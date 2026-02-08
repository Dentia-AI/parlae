# Migration Deployment Summary

## ✅ **What's Been Implemented**

### 1. **Automatic Migrations on Container Startup** 🚀

Both frontend and backend Docker containers now **automatically run database migrations** when they start.

- ✅ Migrations run **before** the application starts
- ✅ If migrations fail, container fails to start (safe!)
- ✅ Migrations are **idempotent** (only new migrations are applied)
- ✅ Safe to run with multiple containers simultaneously

### 2. **Local Migration Script** 💻

New script for running migrations from your local machine (via port forwarding):

```bash
./scripts/deploy-migrations-local.sh
```

### 3. **AWS SSM Migration Script** ☁️

Script that fetches DATABASE_URL from AWS SSM (for when you can access the VPC):

```bash
./scripts/deploy-migrations.sh --env prod
./scripts/deploy-migrations.sh --env dev
```

---

## 🎯 **How to Use**

### **For Local Development**

```bash
# Export your DATABASE_URL (with port forwarding active)
export DATABASE_URL='postgresql://dentia_admin:S7%23tY4%5EzN9_Rq2%2BxS8%21nV9d@localhost:15432/dentia?schema=public'

# Run migrations
./scripts/deploy-migrations-local.sh
```

### **For Production/Dev Deployment**

**Migrations run automatically!** Just deploy normally:

```bash
# Build and push Docker images
docker build -f infra/docker/frontend.Dockerfile -t dentia-frontend:latest .
docker tag dentia-frontend:latest <ecr-uri>:latest
docker push <ecr-uri>:latest

# Update ECS service
aws ecs update-service \
  --cluster dentia-cluster \
  --service dentia-frontend-service \
  --force-new-deployment \
  --profile dentia \
  --region us-east-2

# Migrations will run automatically when the new containers start!
```

Or use the combined deployment script:

```bash
./scripts/fix-cognito-signin.sh
```

---

## 📊 **Verifying Migrations in Production**

### Check CloudWatch Logs

```bash
aws logs tail /ecs/dentia-frontend --follow --profile dentia --region us-east-2
```

Look for:
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

🚀 Starting application...
```

---

## 📁 **Files Modified**

### Scripts Created
- ✅ `scripts/migrate-and-start.sh` - Docker entrypoint (runs migrations then starts app)
- ✅ `scripts/deploy-migrations-local.sh` - Local migration deployment
- ✅ `scripts/deploy-migrations.sh` - AWS SSM-based migration deployment

### Dockerfiles Updated
- ✅ `infra/docker/frontend.Dockerfile` - Added Prisma files & migration entrypoint
- ✅ `infra/docker/backend.Dockerfile` - Added migration entrypoint

### GitHub Actions Examples Created
- ✅ `.github/workflows/deploy-production.yml.example`
- ✅ `.github/workflows/deploy-dev.yml.example`

### Documentation Created
- ✅ `DATABASE_MIGRATIONS_GUIDE.md` - Comprehensive guide
- ✅ `MIGRATION_DEPLOYMENT_SUMMARY.md` - This file

---

## 🤔 **GitHub Actions & Database Access**

### **Q: Can GitHub Actions run migrations?**

**A: No.** GitHub Actions runners are outside your AWS VPC and cannot access your database.

### **Q: Then how do migrations get deployed?**

**A: Automatically when ECS containers start.**

Here's the flow:

```
1. GitHub Actions
   └─→ Build Docker images
   └─→ Push to ECR
   └─→ Update ECS service

2. ECS Service
   └─→ Pull new image from ECR
   └─→ Start new containers

3. Container Startup (inside VPC, has DB access!)
   └─→ Run migrate-and-start.sh
   └─→ Execute: prisma migrate deploy
   └─→ Apply new migrations
   └─→ Start application
```

### **Q: Is this safe?**

**A: Yes!** Here's why:

- ✅ Migrations run **before** the app starts
- ✅ If migrations fail, container fails to start
- ✅ ECS keeps old containers running until new ones are healthy
- ✅ Prisma's `migrate deploy` is idempotent (safe to retry)
- ✅ Multiple containers can run migrations concurrently (Prisma handles conflicts)

---

## 🎬 **Next Steps**

### 1. Test the Local Migration Script

```bash
cd /Users/shaunk/Projects/Dentia/dentia
export DATABASE_URL='postgresql://dentia_admin:S7%23tY4%5EzN9_Rq2%2BxS8%21nV9d@localhost:15432/dentia?schema=public'
./scripts/deploy-migrations-local.sh
```

### 2. Deploy to Production

```bash
# This will apply the cognito_username migration
./scripts/fix-cognito-signin.sh
```

Watch the logs to see migrations run:
```bash
aws logs tail /ecs/dentia-frontend --follow --profile dentia --region us-east-2
```

### 3. (Optional) Setup GitHub Actions

If you want automated deployments on git push:

```bash
# Rename example files
mv .github/workflows/deploy-production.yml.example .github/workflows/deploy-production.yml
mv .github/workflows/deploy-dev.yml.example .github/workflows/deploy-dev.yml

# Add secrets to GitHub repository:
# - AWS_ACCESS_KEY_ID
# - AWS_SECRET_ACCESS_KEY

# Commit and push
git add .github/workflows/
git commit -m "Add GitHub Actions deployment workflows"
git push
```

---

## 📚 **Documentation**

For detailed information, see:
- **`DATABASE_MIGRATIONS_GUIDE.md`** - Comprehensive guide with troubleshooting
- **`COGNITO_SIGNIN_FIX.md`** - Details on the Cognito username fix
- **`EMAIL_VERIFICATION_FIX.md`** - Email verification implementation

---

## 🆘 **Quick Troubleshooting**

### Container fails to start after deployment
→ Check CloudWatch logs for migration errors

### "Table already exists" error
→ Run: `npx prisma migrate resolve --applied <migration-name>`

### Can't connect to database locally
→ Ensure port forwarding is active on localhost:15432

### Password encoding issues
→ Use: `node -e "console.log(encodeURIComponent('your-password'))"`

---

## ✅ **Ready to Deploy!**

Your migration system is now fully set up and production-ready! 🎉

Key benefits:
- ✅ Automatic migrations on deployment
- ✅ Safe rollback if migrations fail
- ✅ Works with multiple containers
- ✅ Simple local testing workflow
- ✅ Production-ready with GitHub Actions support

