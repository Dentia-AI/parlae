# Production Migration Deployment Guide

## 🎯 Problem

Your Aurora database is in a **private VPC** (secure!), so you can't access it directly from your local machine. When you run:

```bash
./scripts/deploy-migrations.sh
```

You get:
```
Error: P1001: Can't reach database server at `dentia-aurora-cluster.cluster-c9kuy2skoi93.us-east-2.rds.amazonaws.com:5432`
```

This is **expected and secure** - your database is not publicly accessible.

---

## ✅ Solutions

You have **3 options** to deploy migrations to production:

### Option 1: Use Bastion Host + Port Forwarding (Recommended for Manual Deploys)

#### Step 1: Connect to Bastion via AWS SSM

```bash
# Get bastion instance ID
BASTION_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=dentia-bastion" \
           "Name=instance-state-name,Values=running" \
  --query "Reservations[0].Instances[0].InstanceId" \
  --output text \
  --profile dentia \
  --region us-east-2)

echo "Bastion Instance ID: $BASTION_ID"

# Start port forwarding session
aws ssm start-session \
  --target $BASTION_ID \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{
    "host":["dentia-aurora-cluster.cluster-c9kuy2skoi93.us-east-2.rds.amazonaws.com"],
    "portNumber":["5432"],
    "localPortNumber":["15432"]
  }' \
  --profile dentia \
  --region us-east-2
```

**Note**: This command will keep running. Leave it open and open a new terminal for the next step.

#### Step 2: Deploy Migrations Through the Tunnel

In a **new terminal**:

```bash
cd /Users/shaunk/Projects/Dentia/dentia

# Get the DATABASE_URL from AWS SSM (without the hostname)
DATABASE_URL=$(aws ssm get-parameter \
  --name "/dentia/backend/DATABASE_URL" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text \
  --profile dentia \
  --region us-east-2)

# Replace the Aurora hostname with localhost:15432
DATABASE_URL_LOCAL=$(echo $DATABASE_URL | sed 's|dentia-aurora-cluster.cluster-c9kuy2skoi93.us-east-2.rds.amazonaws.com:5432|localhost:15432|')

echo "Using DATABASE_URL: $DATABASE_URL_LOCAL"

# Deploy migrations
cd packages/prisma
DATABASE_URL="$DATABASE_URL_LOCAL" npx prisma migrate deploy
```

#### Step 3: Verify

```bash
# Check migration status
DATABASE_URL="$DATABASE_URL_LOCAL" npx prisma migrate status

# View applied migrations
DATABASE_URL="$DATABASE_URL_LOCAL" npx prisma studio
```

---

### Option 2: Let ECS Run Migrations Automatically (Easiest!)

**Best for**: Normal deployments where you just want migrations to run.

Your Docker containers are already configured to run migrations automatically on startup!

#### Step 1: Commit Your Migration

```bash
git add packages/prisma/migrations/
git add packages/prisma/schema.prisma
git commit -m "Add Stripe payment tables"
git push origin main
```

#### Step 2: Deploy Updated Images

```bash
cd /Users/shaunk/Projects/Dentia/dentia

# Build and push backend image
aws ecr get-login-password --region us-east-2 --profile dentia | \
  docker login --username AWS --password-stdin 509852961700.dkr.ecr.us-east-2.amazonaws.com

docker build -f infra/docker/backend.Dockerfile -t dentia-backend:latest .
docker tag dentia-backend:latest 509852961700.dkr.ecr.us-east-2.amazonaws.com/dentia-backend:latest
docker push 509852961700.dkr.ecr.us-east-2.amazonaws.com/dentia-backend:latest

# Update ECS service to use new image
aws ecs update-service \
  --cluster dentia-cluster \
  --service dentia-backend \
  --force-new-deployment \
  --profile dentia \
  --region us-east-2
```

#### Step 3: Watch Migrations Run in CloudWatch

```bash
# Follow the logs to see migrations running
aws logs tail /ecs/dentia-backend --follow --profile dentia --region us-east-2
```

You'll see:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗄️  Running Database Migrations
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Running prisma migrate deploy...

The following migration(s) have been applied:
  ✅ 20251116221828_add_stripe_payments

✅ Migrations completed successfully
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 Starting application...
```

**This is the easiest and safest method!** ✨

---

### Option 3: Connect via Session Manager and Run from Bastion

**Best for**: Debugging or when you need to be inside the VPC.

#### Step 1: Start SSM Session

```bash
# Get bastion instance ID
BASTION_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=dentia-bastion" \
           "Name=instance-state-name,Values=running" \
  --query "Reservations[0].Instances[0].InstanceId" \
  --output text \
  --profile dentia \
  --region us-east-2)

# Connect to bastion
aws ssm start-session \
  --target $BASTION_ID \
  --profile dentia \
  --region us-east-2
```

#### Step 2: Install Tools on Bastion

```bash
# Inside the SSM session:
sudo yum install -y nodejs npm postgresql15

# Install pnpm
sudo npm install -g pnpm
```

#### Step 3: Copy Migration Files and Run

```bash
# On your local machine, create a tarball
cd /Users/shaunk/Projects/Dentia/dentia
tar czf migrations.tar.gz packages/prisma/migrations/ packages/prisma/schema.prisma

# Upload to S3 (temporary)
aws s3 cp migrations.tar.gz s3://your-bucket/migrations.tar.gz --profile dentia --region us-east-2

# Back in SSM session:
# Download and extract
aws s3 cp s3://your-bucket/migrations.tar.gz .
tar xzf migrations.tar.gz

# Get DATABASE_URL from SSM
DATABASE_URL=$(aws ssm get-parameter \
  --name "/dentia/backend/DATABASE_URL" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text \
  --region us-east-2)

# Run migrations
cd packages/prisma
DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy
```

---

## 🎯 Recommended Approach

### For Day-to-Day Deployments: **Option 2 (Let ECS Run Migrations)**

This is the safest and easiest:
1. ✅ Migrations run before app starts
2. ✅ If migrations fail, deployment stops (no downtime)
3. ✅ No manual steps needed
4. ✅ Works in CI/CD automatically

### For Emergency/Manual Deployments: **Option 1 (Bastion + Port Forwarding)**

Use when you need to:
- Run migrations without deploying new code
- Test migrations before deployment
- Troubleshoot database issues

---

## 📋 Quick Reference Scripts

### Connect to Production DB via Bastion

```bash
# Save this as: scripts/connect-production-db.sh
#!/bin/bash

set -e

PROFILE="dentia"
REGION="us-east-2"

echo "🔍 Finding bastion instance..."
BASTION_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=dentia-bastion" \
           "Name=instance-state-name,Values=running" \
  --query "Reservations[0].Instances[0].InstanceId" \
  --output text \
  --profile $PROFILE \
  --region $REGION)

if [ -z "$BASTION_ID" ] || [ "$BASTION_ID" = "None" ]; then
  echo "❌ Bastion instance not found or not running"
  exit 1
fi

echo "✅ Found bastion: $BASTION_ID"
echo ""
echo "🚀 Starting port forwarding session..."
echo "   Local port: 15432"
echo "   Remote host: dentia-aurora-cluster.cluster-c9kuy2skoi93.us-east-2.rds.amazonaws.com"
echo "   Remote port: 5432"
echo ""
echo "💡 Keep this terminal open. Open a new terminal to run migrations."
echo ""

aws ssm start-session \
  --target $BASTION_ID \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{
    "host":["dentia-aurora-cluster.cluster-c9kuy2skoi93.us-east-2.rds.amazonaws.com"],
    "portNumber":["5432"],
    "localPortNumber":["15432"]
  }' \
  --profile $PROFILE \
  --region $REGION
```

### Deploy Migrations to Production via Bastion

```bash
# Save this as: scripts/deploy-production-migrations-via-bastion.sh
#!/bin/bash

set -e

PROFILE="dentia"
REGION="us-east-2"

echo "🔍 Checking if port forwarding is active..."
if ! lsof -i :15432 > /dev/null 2>&1; then
  echo "❌ Port 15432 is not listening"
  echo "   Please run ./scripts/connect-production-db.sh in another terminal first"
  exit 1
fi

echo "✅ Port forwarding is active"
echo ""

echo "🔍 Fetching DATABASE_URL from AWS SSM..."
DATABASE_URL=$(aws ssm get-parameter \
  --name "/dentia/backend/DATABASE_URL" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text \
  --profile $PROFILE \
  --region $REGION)

if [ -z "$DATABASE_URL" ]; then
  echo "❌ Failed to fetch DATABASE_URL"
  exit 1
fi

echo "✅ DATABASE_URL fetched"
echo ""

# Replace Aurora hostname with localhost
DATABASE_URL_LOCAL=$(echo $DATABASE_URL | sed 's|dentia-aurora-cluster.cluster-c9kuy2skoi93.us-east-2.rds.amazonaws.com:5432|localhost:15432|')

echo "🗄️  Deploying migrations..."
echo ""

cd packages/prisma
DATABASE_URL="$DATABASE_URL_LOCAL" npx prisma migrate deploy

echo ""
echo "✅ Migrations deployed successfully!"
echo ""
echo "📊 Checking migration status..."
DATABASE_URL="$DATABASE_URL_LOCAL" npx prisma migrate status
```

### Make Scripts Executable

```bash
chmod +x scripts/connect-production-db.sh
chmod +x scripts/deploy-production-migrations-via-bastion.sh
```

---

## 🚀 Usage Examples

### Example 1: Quick Production Deployment

```bash
# Terminal 1: Start port forwarding
./scripts/connect-production-db.sh

# Terminal 2: Deploy migrations
./scripts/deploy-production-migrations-via-bastion.sh
```

### Example 2: Deploy via ECS (No Manual Steps)

```bash
# Commit your migration
git add packages/prisma/migrations/
git commit -m "Add Stripe payment tables"
git push origin main

# Build and deploy (migrations run automatically)
aws ecr get-login-password --region us-east-2 --profile dentia | \
  docker login --username AWS --password-stdin 509852961700.dkr.ecr.us-east-2.amazonaws.com

docker build -f infra/docker/backend.Dockerfile -t 509852961700.dkr.ecr.us-east-2.amazonaws.com/dentia-backend:latest .
docker push 509852961700.dkr.ecr.us-east-2.amazonaws.com/dentia-backend:latest

aws ecs update-service --cluster dentia-cluster --service dentia-backend --force-new-deployment --profile dentia --region us-east-2

# Watch it happen
aws logs tail /ecs/dentia-backend --follow --profile dentia --region us-east-2
```

---

## 🔍 Troubleshooting

### "Can't reach database server"

**Cause**: No port forwarding active or bastion not running.

**Solution**:
```bash
# Check if bastion is running
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=dentia-bastion" \
  --query "Reservations[*].Instances[*].[InstanceId,State.Name]" \
  --output table \
  --profile dentia \
  --region us-east-2

# Check if port forwarding is active
lsof -i :15432
```

### "Session Manager plugin not found"

**Solution**: Install the Session Manager plugin:

```bash
# macOS
brew install --cask session-manager-plugin

# Verify installation
session-manager-plugin --version
```

### Bastion Not Connecting

**Check SSM agent**:
```bash
# View bastion logs
aws ssm get-command-invocation \
  --instance-id <bastion-instance-id> \
  --command-id <command-id> \
  --profile dentia \
  --region us-east-2
```

---

## ✅ Summary

| Method | When to Use | Pros | Cons |
|--------|-------------|------|------|
| **ECS Auto-Deploy** | Normal deployments | ✅ Automatic<br>✅ Safe<br>✅ No manual steps | ❌ Requires full deployment |
| **Bastion + Port Forward** | Manual migrations<br>Testing<br>Debugging | ✅ Fast<br>✅ Direct control<br>✅ No deployment needed | ❌ Manual steps<br>❌ Requires bastion |
| **SSM + Bastion Shell** | Emergency fixes<br>Advanced troubleshooting | ✅ Full DB access<br>✅ Can run SQL directly | ❌ Most complex<br>❌ Need to install tools |

**🎯 Recommendation**: Use **ECS Auto-Deploy** for normal workflow. Use **Bastion + Port Forward** only when you need to deploy migrations without deploying new code.

---

## 📚 Related Documentation

- [AUTO_MIGRATION_SETUP.md](./AUTO_MIGRATION_SETUP.md) - How automatic migrations work
- [DATABASE_MIGRATIONS_GUIDE.md](./DATABASE_MIGRATIONS_GUIDE.md) - Complete migration guide
- `scripts/migrate-and-start.sh` - Container migration script

