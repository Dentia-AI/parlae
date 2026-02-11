# CI/CD Pipeline Configuration

This document explains the Continuous Integration and Continuous Deployment (CI/CD) pipeline for the Parlae application.

## Pipeline Overview

```
┌─────────────────┐
│  Push to main   │
└────────┬────────┘
         │
         ├──────────────────────────┬─────────────────────────┐
         ▼                          ▼                         ▼
┌─────────────────┐        ┌─────────────────┐     ┌─────────────────┐
│  Backend Tests  │        │ Frontend Tests  │     │   Other Tests   │
│                 │        │                 │     │   (if any)      │
└────────┬────────┘        └────────┬────────┘     └─────────────────┘
         │                          │
         │ ✅ Success               │ ✅ Success
         ▼                          ▼
┌─────────────────┐        ┌─────────────────┐
│ Deploy Backend  │        │ Deploy Frontend │
│   to AWS ECS    │        │   to AWS ECS    │
└─────────────────┘        └─────────────────┘
```

## Workflow Files

### 1. Test Workflows

#### Backend Tests (`test-backend.yml`)
**Triggers**:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Only when backend or prisma files change

**What it does**:
- Runs NestJS backend tests
- Validates database schema
- Checks code quality

#### Frontend Tests (`test-frontend.yml`)
**Triggers**:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Only when frontend or package files change

**What it does**:
- Runs Next.js frontend tests
- Validates TypeScript compilation
- Checks code quality

### 2. Deployment Workflows

#### Backend Deployment (`deploy-backend.yml`)
**Triggers**:
- ✅ **Automatically**: After "Backend Tests" workflow completes successfully on `main` branch
- 🔧 **Manually**: Via GitHub Actions UI (workflow_dispatch)

**What it does**:
1. Builds Docker image for backend
2. Pushes to AWS ECR
3. Deploys to AWS ECS (parlae-backend service)

**Conditional Deployment**:
```yaml
if: ${{ github.event.workflow_run.conclusion == 'success' || github.event_name == 'workflow_dispatch' }}
```
This ensures deployment only happens if:
- Tests passed successfully, OR
- Manually triggered by a developer

#### Frontend Deployment (`deploy-frontend.yml`)
**Triggers**:
- ✅ **Automatically**: After "Frontend Tests" workflow completes successfully on `main` branch
- 🔧 **Manually**: Via GitHub Actions UI (workflow_dispatch)

**What it does**:
1. Builds Docker image for frontend
2. Pushes to AWS ECR
3. Deploys to AWS ECS (parlae-frontend service)

**Conditional Deployment**:
```yaml
if: ${{ github.event.workflow_run.conclusion == 'success' || github.event_name == 'workflow_dispatch' }}
```

## How It Works

### Automatic Deployment Flow

1. **Developer pushes to `main`**:
   ```bash
   git push origin main
   ```

2. **Tests run automatically**:
   - Backend tests run if backend code changed
   - Frontend tests run if frontend code changed
   - Both can run in parallel

3. **If tests pass**:
   - Backend deployment starts automatically
   - Frontend deployment starts automatically
   - Both deployments run in parallel

4. **If tests fail**:
   - Deployments are **NOT triggered**
   - Developer is notified of test failures
   - Must fix tests before deployment

### Manual Deployment

You can manually trigger deployments even without pushing:

1. Go to GitHub Actions tab
2. Select "Deploy Backend" or "Deploy Frontend"
3. Click "Run workflow"
4. Select the branch
5. Click "Run workflow"

**Note**: Manual deployments bypass the test requirement, so use with caution!

## Path Filters

### Backend Deployment Triggers
Deployment happens when tests pass for changes to:
- `apps/backend/**` - Backend application code
- `packages/prisma/**` - Database schema

### Frontend Deployment Triggers
Deployment happens when tests pass for changes to:
- `apps/frontend/**` - Frontend application code
- `packages/**` - Shared packages

## Best Practices

### 1. Always Test Locally First
```bash
# Backend tests
cd apps/backend
pnpm test

# Frontend tests
cd apps/frontend/apps/web
pnpm build
```

### 2. Use Feature Branches
```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes, test locally
git add .
git commit -m "Add feature"
git push origin feature/my-feature

# Create Pull Request
# Tests run automatically on PR
# After approval, merge to main
# Deployment happens automatically
```

### 3. Monitor Deployments
- Watch the Actions tab during deployments
- Check AWS ECS console for service health
- Review CloudWatch logs if issues occur

### 4. Rollback if Needed
If a deployment causes issues:

```bash
# Option 1: Revert the commit
git revert <commit-hash>
git push origin main
# This will trigger tests and redeploy

# Option 2: Manual rollback in AWS ECS
# Use AWS Console to rollback to previous task definition
```

## Environment Requirements

### GitHub Secrets Required
All deployment workflows need these secrets:

| Secret | Value | Purpose |
|--------|-------|---------|
| `AWS_REGION` | `us-east-2` | AWS region |
| `ECR_REPOSITORY` | `234270344223.dkr.ecr.us-east-2.amazonaws.com` | ECR registry URL |
| `AWS_ACCESS_KEY_ID` | Your AWS key | AWS authentication |
| `AWS_SECRET_ACCESS_KEY` | Your AWS secret | AWS authentication |

See [GITHUB_ACTIONS_AWS_SETUP.md](./GITHUB_ACTIONS_AWS_SETUP.md) for complete setup.

### AWS Resources Required
- ECR Repositories: `parlae-backend`, `parlae-frontend`
- ECS Cluster: `parlae-cluster`
- ECS Services: `parlae-backend`, `parlae-frontend`

## Troubleshooting

### Tests Pass but Deployment Doesn't Start

**Check**:
1. Verify you pushed to `main` branch
2. Check if path filters match your changes
3. Look for failed workflow runs in Actions tab

**Solution**:
- Manually trigger deployment via workflow_dispatch
- Check workflow permissions in repo settings

### Deployment Fails After Tests Pass

**Common Issues**:
1. **AWS credentials expired/invalid**
   - Verify GitHub Secrets are correct
   - Check IAM user permissions

2. **ECR push fails**
   - Check ECR repository exists
   - Verify network connectivity
   - Review error logs in workflow

3. **ECS update fails**
   - Check ECS service exists
   - Verify task definition is valid
   - Check container health checks

### Tests Keep Failing

**Debug Steps**:
1. Pull the latest `main` branch
2. Run tests locally
3. Check for missing dependencies
4. Review test output in Actions tab
5. Fix issues and push again

## Workflow Dependencies

The deployment workflows use `workflow_run` to depend on test workflows:

```yaml
on:
  workflow_run:
    workflows: ["Backend Tests"]  # Must match test workflow name exactly
    types:
      - completed
    branches:
      - main
```

**Important**: The workflow name in brackets must **exactly match** the name in the test workflow file:
- Backend: `"Backend Tests"` (from `name: Backend Tests`)
- Frontend: `"Frontend Tests"` (from `name: Frontend Tests`)

## Benefits of This Approach

✅ **Safety**: Never deploy broken code to production
✅ **Automation**: No manual steps after pushing to main
✅ **Flexibility**: Can still manually deploy when needed
✅ **Efficiency**: Tests and deployments run in parallel
✅ **Visibility**: Clear feedback in GitHub Actions UI
✅ **Reliability**: Consistent deployment process

## Future Enhancements

Potential improvements to consider:

1. **Staging Environment**:
   - Add `staging` branch
   - Deploy to staging environment first
   - Promote to production after validation

2. **Smoke Tests**:
   - Run post-deployment health checks
   - Rollback automatically if checks fail

3. **Notifications**:
   - Slack/Discord notifications on deployment
   - Email alerts on failures

4. **Blue-Green Deployment**:
   - Deploy to new ECS task definitions
   - Switch traffic after validation
   - Quick rollback capability

## Related Documentation

- [GITHUB_ACTIONS_AWS_SETUP.md](./GITHUB_ACTIONS_AWS_SETUP.md) - AWS and GitHub Actions configuration
- [DEPLOYMENT_FIXES.md](./DEPLOYMENT_FIXES.md) - Common deployment issues and fixes
