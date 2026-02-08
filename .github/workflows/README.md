# GitHub Actions CI/CD Workflows

## Overview

This directory contains GitHub Actions workflows for automated testing and deployment of the Dentia application.

## Test Workflows

### 🧪 test-all.yml (Recommended)
**Runs on**: Push to `main` or `develop`, Pull Requests

This is the main testing workflow that runs all tests in parallel:

- ✅ Backend tests (85 tests)
- ✅ Frontend tests (48 tests)
- ✅ Coverage reports to Codecov
- ✅ Test summary on PRs

**Triggers**:
- Every push to `main` or `develop`
- Every pull request to `main` or `develop`

**Duration**: ~3-5 minutes

---

### 🔧 test-backend.yml
**Runs on**: Push to `main` or `develop` (when backend files change)

Runs only backend tests when backend-specific files are modified:

- Backend source files (`apps/backend/**`)
- Prisma schema (`packages/prisma/**`)

**Features**:
- Runs 85 backend tests
- Generates coverage report
- Uploads to Codecov
- Comments results on PRs

---

### 🎨 test-frontend.yml
**Runs on**: Push to `main` or `develop` (when frontend files change)

Runs only frontend tests when frontend-specific files are modified:

- Frontend source files (`apps/frontend/**`)
- Shared packages (`packages/**`)

**Features**:
- Runs 48 frontend tests
- Generates coverage report
- Uploads to Codecov
- Comments results on PRs

---

## Deployment Workflows

### 🚀 deploy-backend.yml
Deploys backend to AWS ECS (currently disabled)

### 🚀 deploy-frontend.yml
Deploys frontend to AWS (currently disabled)

### 🚀 deploy-dev-environment.yml
Deploys to development environment

---

## Workflow Configuration

### Environment Variables

#### Backend Tests
```yaml
NODE_ENV: test
COGNITO_USER_POOL_ID: test-pool
COGNITO_CLIENT_ID: test-client
AWS_REGION: us-east-1
COGNITO_ISSUER: https://cognito-idp.us-east-1.amazonaws.com/test-pool
```

#### Frontend Tests
```yaml
NODE_ENV: test
NEXT_PUBLIC_SITE_URL: http://localhost:3000
NEXTAUTH_SECRET: test-secret-for-ci
NEXTAUTH_URL: http://localhost:3000
```

### Required Secrets

For Codecov integration (optional):
- `CODECOV_TOKEN` - Get from https://codecov.io/

For AWS deployment (if enabled):
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `ECR_REPOSITORY`

---

## Usage

### Automatic Triggers

Tests run automatically when:

1. **Push to main or develop**
   ```bash
   git push origin main
   git push origin develop
   ```

2. **Create Pull Request**
   ```bash
   gh pr create --base main
   ```

### Manual Triggers

Run workflows manually from GitHub:

1. Go to **Actions** tab
2. Select workflow (e.g., "All Tests")
3. Click **Run workflow**
4. Select branch
5. Click **Run workflow**

---

## Workflow Results

### Success ✅
- All tests pass
- Coverage uploaded
- Green check mark on commit
- PR can be merged

### Failure ❌
- One or more tests fail
- Red X on commit
- PR blocked from merging
- Check logs for details

### Example PR Comment

```markdown
## 🧪 Test Results Summary

| Test Suite | Status | Details |
|------------|--------|---------|
| Backend | ✅ | success |
| Frontend | ✅ | success |

### Coverage
View detailed coverage reports in the Codecov dashboard.

### Test Counts
- **Backend**: 85 tests across 8 suites
- **Frontend**: 48 tests across 5 suites
- **Total**: 133 tests 🚀
```

---

## Debugging Failed Tests

### View Test Logs

1. Go to **Actions** tab
2. Click on failed workflow run
3. Click on failed job
4. Expand failed step
5. Read error messages

### Common Issues

#### Backend Tests Fail

```bash
# Run locally to debug
cd apps/backend
pnpm test
```

**Common causes**:
- Missing environment variables
- Database schema changes
- Dependency issues

#### Frontend Tests Fail

```bash
# Run locally to debug
cd apps/frontend/apps/web
pnpm test
```

**Common causes**:
- Mock configuration issues
- Module resolution problems
- Environment variable issues

#### Coverage Upload Fails

- Check `CODECOV_TOKEN` secret is set
- Verify coverage files are generated
- Check Codecov dashboard for issues

---

## Optimizing Workflows

### Speed Up Tests

1. **Use pnpm cache**: Already configured ✅
2. **Run tests in parallel**: Already configured ✅
3. **Only run affected tests**: Paths configured ✅

### Reduce CI Minutes

Current workflows use path filters to only run when relevant files change:

- `test-backend.yml`: Only runs when backend files change
- `test-frontend.yml`: Only runs when frontend files change
- `test-all.yml`: Always runs (ensures everything works together)

---

## Best Practices

### Before Pushing

Always run tests locally first:

```bash
# Backend
cd apps/backend && pnpm test

# Frontend
cd apps/frontend/apps/web && pnpm test
```

### Branch Protection

Recommended branch protection rules for `main` and `develop`:

1. ✅ Require status checks to pass
   - `Backend Tests`
   - `Frontend Tests`
2. ✅ Require branches to be up to date
3. ✅ Require pull request reviews
4. ❌ Allow force pushes
5. ✅ Require linear history

### Setting Up Branch Protection

1. Go to **Settings** → **Branches**
2. Click **Add rule**
3. Branch name pattern: `main` or `develop`
4. Check:
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
   - Select: `Backend Tests` and `Frontend Tests`
   - ✅ Require pull request reviews before merging
5. Click **Create**

---

## Coverage Tracking

### Codecov Integration

Workflows automatically upload coverage to Codecov:

- **Backend**: `apps/backend/coverage/lcov.info`
- **Frontend**: `apps/frontend/apps/web/coverage/lcov.info`

### Viewing Coverage

1. Go to https://codecov.io/
2. Find your repository
3. View coverage trends
4. Check file-by-file coverage
5. See coverage diffs in PRs

### Coverage Goals

Current targets:
- **Backend**: >80% (currently 76%)
- **Frontend**: >70% (currently measuring)
- **Overall**: >75%

---

## Monitoring

### GitHub Actions Dashboard

View all workflow runs:
1. Go to **Actions** tab
2. See all recent runs
3. Filter by workflow
4. Filter by status

### Notifications

Get notified of failures:
1. Go to **Settings** → **Notifications**
2. Enable **Actions** notifications
3. Choose email or GitHub notifications

---

## Troubleshooting

### Workflow Not Triggering

**Check**:
1. Workflow file syntax is correct (YAML)
2. Branch name matches trigger (`main` or `develop`)
3. Changed files match path filters
4. Workflows are enabled in repo settings

### Tests Pass Locally But Fail in CI

**Common causes**:
1. Environment variables differ
2. Node version differs
3. Dependencies not in lockfile
4. Timezone differences
5. File system differences

**Fix**:
```bash
# Ensure lockfile is up to date
pnpm install

# Commit lockfile
git add pnpm-lock.yaml
git commit -m "Update lockfile"
```

### Slow Workflow Runs

**Optimize**:
1. Use pnpm cache (already configured)
2. Only install needed dependencies
3. Run tests in parallel
4. Use path filters (already configured)

---

## Adding New Tests

When you add new tests:

1. ✅ Tests run automatically in CI
2. ✅ No workflow changes needed
3. ✅ Coverage automatically updated

Just ensure:
- Tests follow naming convention (`*.test.ts` or `*.spec.ts`)
- Tests are in the correct directory
- Tests pass locally before pushing

---

## Maintenance

### Updating Node Version

To update Node.js version used in CI:

```yaml
# In test-all.yml, test-backend.yml, test-frontend.yml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'  # Update this version
```

### Updating pnpm Version

```yaml
# In all workflow files
- name: Setup pnpm
  uses: pnpm/action-setup@v2
  with:
    version: 9  # Update this version
```

### Updating Actions

Check for action updates:
- `actions/checkout` - Currently v4
- `actions/setup-node` - Currently v4
- `codecov/codecov-action` - Currently v3

---

## Questions?

- **Tests**: See `TESTING.md` files
- **CI/CD**: This document
- **Deployment**: See deployment workflow files

---

**Status**: ✅ Active

**Last Updated**: November 14, 2024

**Workflows**: 3 test workflows, 3 deployment workflows

