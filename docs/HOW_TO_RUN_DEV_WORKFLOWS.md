# How to Run Dev Environment Workflows

## 🎯 Quick Start

I've enabled the workflows for you! Here's how to use them:

---

## ✅ Step 1: Commit and Push the Changes

```bash
cd /Users/shaunk/Projects/Dentia/dentia

# Stage the workflow files
git add .github/workflows/deploy-dev-environment.yml
git add .github/workflows/destroy-dev-environment.yml

# Commit
git commit -m "Enable dev environment workflows"

# Push to GitHub
git push origin develop
```

**Important**: The workflows won't appear in GitHub Actions until you push these changes!

---

## 🚀 Step 2: Deploy Dev Environment

### Method 1: GitHub UI (Easiest)

1. **Go to your repository on GitHub**
   ```
   https://github.com/shaunk/dentia
   ```

2. **Click the "Actions" tab** at the top

3. **Find "Deploy Dev Environment"** in the left sidebar

4. **Click "Run workflow"** button (top right)

5. **Select branch**: `develop`

6. **Click the green "Run workflow" button**

7. **Watch it run!**
   - Click on the running workflow to see progress
   - Duration: ~10-15 minutes
   - You'll see:
     - Building frontend image
     - Building backend image
     - Pushing to ECR
     - Running Terraform
     - Deploying to ECS

8. **Access your dev environment**:
   ```
   https://dev.dentiaapp.com
   ```

### Method 2: GitHub CLI

```bash
# Trigger the workflow
gh workflow run deploy-dev-environment.yml --ref develop

# Watch it run in real-time
gh run watch

# Or list recent runs
gh run list --workflow=deploy-dev-environment.yml

# View details of a specific run
gh run view <run-id>
```

### Method 3: API/Curl

```bash
# Get your GitHub token
GITHUB_TOKEN="your_github_token"

# Trigger the workflow
curl -X POST \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/shaunk/dentia/actions/workflows/deploy-dev-environment.yml/dispatches \
  -d '{"ref":"develop"}'
```

---

## 🧹 Step 3: Destroy Dev Environment (When Done)

**Important**: Destroy the dev environment when you're not using it to save ~$150/month!

### Method 1: GitHub UI

1. **Go to Actions tab**
2. **Find "Destroy Dev Environment"** in the left sidebar
3. **Click "Run workflow"**
4. **Select branch**: `develop`
5. **Click "Run workflow"**
6. **Confirm**: This will delete ALL dev environment resources!

### Method 2: GitHub CLI

```bash
# Trigger destroy
gh workflow run destroy-dev-environment.yml --ref develop

# Watch it run
gh run watch
```

---

## 📋 What Each Workflow Does

### Deploy Dev Environment

**File**: `.github/workflows/deploy-dev-environment.yml`

**Steps**:
1. ✅ Checks out your code
2. ✅ Checks out dentia-infra repository
3. ✅ Configures AWS credentials (OIDC role)
4. ✅ Builds frontend Docker image
5. ✅ Builds backend Docker image
6. ✅ Pushes images to ECR with `:dev` tag
7. ✅ Runs Terraform to provision/update infrastructure
8. ✅ ECS starts containers
9. ✅ **Migrations run automatically** on container startup
10. ✅ Apps are live!

**What Gets Created**:
- VPC with public/private subnets
- Aurora PostgreSQL cluster (serverless v2)
- ECS cluster with frontend/backend services
- Application Load Balancer
- CloudFront distribution
- S3 buckets
- Security groups
- Bastion host

**Cost**: ~$135-210/month if left running

### Destroy Dev Environment

**File**: `.github/workflows/destroy-dev-environment.yml`

**Steps**:
1. ✅ Checks out infrastructure code
2. ✅ Configures AWS credentials
3. ✅ Runs `terraform destroy` to remove ALL resources
4. ✅ Deletes:
   - ECS services and tasks
   - Aurora database (⚠️ **including all data**)
   - Load balancers
   - CloudFront distribution
   - S3 buckets
   - VPC and networking
   - All other resources

**⚠️ Warning**: This is **destructive** - all data in the dev environment will be lost!

---

## 🔍 Monitoring the Deployment

### View Workflow Progress in GitHub

```
GitHub → Actions → Click on the running workflow
```

You'll see:
- Live logs for each step
- Build progress
- Terraform plan/apply output
- Success/failure status

### View CloudWatch Logs (After Deployment)

```bash
# Backend logs
aws logs tail /ecs/dentia-dev-backend --follow --profile dentia --region us-east-2

# Frontend logs
aws logs tail /ecs/dentia-dev-frontend --follow --profile dentia --region us-east-2

# Filter for migrations
aws logs tail /ecs/dentia-dev-backend --follow --filter-pattern "Migration" --profile dentia --region us-east-2
```

### Check ECS Status

```bash
# List services
aws ecs list-services --cluster dentia-dev-cluster --profile dentia --region us-east-2

# Describe service
aws ecs describe-services \
  --cluster dentia-dev-cluster \
  --services dentia-dev-backend \
  --profile dentia \
  --region us-east-2
```

---

## 🔧 Prerequisites

### GitHub Secrets Required

Go to: `Settings → Secrets and variables → Actions`

You need:

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `INFRA_REPO_TOKEN` | GitHub PAT with repo access | GitHub Settings → Developer settings → Personal access tokens |
| `STRIPE_PUBLISHABLE_KEY_DEV` | Stripe test key | Stripe Dashboard → Developers → API keys |

### AWS Permissions

The workflow uses OIDC role assumption:
- Role: `arn:aws:iam::509852961700:role/GitHubActionsDentiaDevRole`
- This role needs to already exist in your AWS account
- It should have permissions for ECS, ECR, RDS, VPC, etc.

---

## 📸 Visual Guide

### GitHub Actions UI Flow

```
1. Go to GitHub Repository
   └─> https://github.com/shaunk/dentia

2. Click "Actions" tab
   └─> You'll see a list of workflows

3. Left Sidebar: Select "Deploy Dev Environment"
   └─> Shows history of runs

4. Top Right: Click "Run workflow" button
   └─> Dropdown appears

5. Select "develop" branch
   └─> Or any branch you want to deploy from

6. Click green "Run workflow" button
   └─> Workflow starts immediately

7. Click on the running workflow
   └─> See live progress and logs

8. Wait ~10-15 minutes
   └─> Workflow completes (hopefully green ✅)

9. Access your dev environment
   └─> https://dev.dentiaapp.com
```

---

## ⚡ Quick Commands Reference

```bash
# === PREREQUISITES ===

# 1. Commit and push workflow changes
git add .github/workflows/*.yml
git commit -m "Enable dev environment workflows"
git push origin develop

# === DEPLOY ===

# Via GitHub CLI
gh workflow run deploy-dev-environment.yml --ref develop
gh run watch

# View in browser
open "https://github.com/shaunk/dentia/actions"

# === MONITOR ===

# Watch CloudWatch logs
aws logs tail /ecs/dentia-dev-backend --follow --profile dentia --region us-east-2

# Check ECS status
aws ecs describe-services \
  --cluster dentia-dev-cluster \
  --services dentia-dev-backend dentia-dev-frontend \
  --profile dentia \
  --region us-east-2

# === DESTROY (when done) ===

# Via GitHub CLI
gh workflow run destroy-dev-environment.yml --ref develop
gh run watch

# Verify resources are gone
aws ecs list-services --cluster dentia-dev-cluster --profile dentia --region us-east-2
```

---

## 🐛 Troubleshooting

### "Workflow not found"

**Problem**: Workflow doesn't appear in Actions tab

**Solution**: Make sure you've pushed the workflow files to GitHub
```bash
git push origin develop
```

### "No ref found for: develop"

**Problem**: The `develop` branch doesn't exist

**Solution**: Use `main` instead, or create the develop branch:
```bash
git checkout -b develop
git push origin develop
```

### "Resource 'GitHubActionsDentiaDevRole' not found"

**Problem**: AWS OIDC role doesn't exist

**Solution**: Create the role or use AWS access keys instead (update workflow)

### "Failed to build image"

**Problem**: Docker build error

**Solutions**:
- Check the workflow logs for specific error
- Ensure Dockerfile paths are correct
- Test build locally first:
  ```bash
  docker build -f infra/docker/frontend.Dockerfile .
  ```

### "Terraform apply failed"

**Problem**: Infrastructure provisioning error

**Solutions**:
- Check CloudWatch logs for specific error
- Verify AWS permissions
- Check if resources already exist
- Review Terraform state

### "Can't access https://dev.dentiaapp.com"

**Problem**: Site not loading after deployment

**Solutions**:
1. Check ECS service is running:
   ```bash
   aws ecs describe-services --cluster dentia-dev-cluster --services dentia-dev-frontend --profile dentia --region us-east-2
   ```

2. Check CloudWatch logs for errors:
   ```bash
   aws logs tail /ecs/dentia-dev-frontend --follow --profile dentia --region us-east-2
   ```

3. Check DNS is configured:
   ```bash
   dig dev.dentiaapp.com
   ```

4. Check CloudFront distribution status:
   ```bash
   aws cloudfront list-distributions --profile dentia --region us-east-2
   ```

---

## 💡 Tips & Best Practices

### Cost Management

1. **Destroy when not in use**:
   ```bash
   gh workflow run destroy-dev-environment.yml --ref develop
   ```

2. **Set up billing alerts**:
   ```bash
   aws budgets create-budget --account-id YOUR_ACCOUNT_ID ...
   ```

3. **Use Aurora Serverless v2** (already configured):
   - Scales to zero when idle
   - Only pay for what you use

### Development Workflow

1. **Test locally first**:
   ```bash
   ./dev.sh  # Test everything locally
   ```

2. **Deploy to dev for integration testing**:
   ```bash
   gh workflow run deploy-dev-environment.yml --ref develop
   ```

3. **Test in dev environment**:
   - Visit https://dev.dentiaapp.com
   - Run integration tests
   - Verify migrations

4. **Destroy when done**:
   ```bash
   gh workflow run destroy-dev-environment.yml --ref develop
   ```

5. **Deploy to production**:
   - Merge to main
   - Deploy production (manual or automatic)

### Debugging

1. **Check workflow logs first**:
   - GitHub → Actions → Click on run → View logs

2. **Check CloudWatch logs**:
   ```bash
   aws logs tail /ecs/dentia-dev-backend --follow --profile dentia --region us-east-2
   ```

3. **Connect to bastion for DB access**:
   ```bash
   ./scripts/connect-production-db.sh  # Same works for dev
   ```

4. **Check Terraform state**:
   ```bash
   cd dentia-infra/infra/environments/dev
   terraform show
   ```

---

## 📊 Expected Timeline

### Deploy Dev Environment

```
00:00 - Workflow triggered
00:01 - Checkout code
00:02 - Configure AWS credentials
00:05 - Build frontend image (3-5 mins)
00:10 - Build backend image (3-5 mins)
00:11 - Push images to ECR (1-2 mins)
00:13 - Terraform plan (1 min)
00:15 - Terraform apply (5-10 mins)
        ├─ VPC creation
        ├─ Aurora cluster creation (slowest part)
        ├─ ECS cluster setup
        └─ Load balancer configuration
00:25 - ECS tasks starting
        ├─ Migrations run automatically
        └─ Apps start
00:27 - Health checks pass
00:28 - ✅ Deployment complete!
```

**Total**: ~10-15 minutes (first time), ~5-8 minutes (updates)

### Destroy Dev Environment

```
00:00 - Workflow triggered
00:01 - Checkout code
00:02 - Configure AWS credentials
00:03 - Terraform plan destroy
00:05 - Terraform destroy
        ├─ ECS services stop
        ├─ Aurora cluster deletion (slowest)
        ├─ Load balancer deletion
        └─ VPC cleanup
00:15 - ✅ Destruction complete!
```

**Total**: ~10-15 minutes

---

## ✅ Summary

**To Deploy Dev Environment**:
1. Push workflow changes: `git push origin develop`
2. Go to: GitHub → Actions → Deploy Dev Environment
3. Click "Run workflow" → Select develop → Run
4. Wait ~10-15 minutes
5. Access: https://dev.dentiaapp.com

**To Destroy Dev Environment**:
1. Go to: GitHub → Actions → Destroy Dev Environment
2. Click "Run workflow" → Select develop → Run
3. Wait ~10-15 minutes
4. Resources deleted, costs stop

**Via CLI**:
```bash
# Deploy
gh workflow run deploy-dev-environment.yml --ref develop
gh run watch

# Destroy
gh workflow run destroy-dev-environment.yml --ref develop
gh run watch
```

---

## 🔗 Related Documentation

- [DEV_ENVIRONMENT_DEPLOYMENT.md](./docs/DEV_ENVIRONMENT_DEPLOYMENT.md) - Complete dev environment guide
- [DEPLOYMENT_MIGRATION_SUMMARY.md](./DEPLOYMENT_MIGRATION_SUMMARY.md) - Full deployment overview
- [AUTO_MIGRATION_SETUP.md](./docs/AUTO_MIGRATION_SETUP.md) - How migrations work

---

**You're all set! The workflows are enabled and ready to use! 🚀**

