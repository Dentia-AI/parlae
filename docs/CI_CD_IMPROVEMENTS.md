# CI/CD Pipeline Improvements

## Problem

Previously, the CI/CD pipeline had a critical gap: **build errors were only caught during Docker build in the deployment phase**, not during the test phase. This meant:

- TypeScript compilation errors weren't detected early
- Linting issues weren't caught before deployment
- Tests could pass even if the production build would fail
- Time and resources were wasted on deployments that would fail

### Example Build Error

The variable shadowing issue in `apps/frontend/apps/web/app/api/pms/patients/route.ts` passed tests but failed during Docker build:

```typescript
// This error wasn't caught until deployment
let pmsIntegrationId: string | undefined;
const { pmsIntegrationId } = context; // Shadowing outer variable
pmsIntegrationId = integration?.id;   // ❌ Cannot reassign const
```

## Solution: Multi-Stage Quality Gates

The improved pipeline now follows a **fail-fast** approach with multiple quality gates:

```
┌─────────┐   ┌──────────────┐   ┌───────┐   ┌──────┐   ┌────────┐
│ Lint ⚠️ │ → │  Type Check  │ → │ Build │ → │ Test │ → │ Deploy │
└─────────┘   └──────────────┘   └───────┘   └──────┘   └────────┘
    ↓              ↓                 ↓           ↓
Warning         Fast              Slow        Slow
(non-block)   (15-30s)         (1-2min)    (2-5min)
               ✅ BLOCKS        ✅ BLOCKS   ✅ BLOCKS

⚠️ Lint is currently non-blocking while configs are being fixed
```

### 1. Lint (ESLint) ⚠️ NON-BLOCKING
**Status:** Currently non-blocking due to config issues. See [ESLINT_CONFIG_TODO.md](./ESLINT_CONFIG_TODO.md) for details.

**What it catches:**
- Code style issues
- Common mistakes and anti-patterns
- Unused variables
- Import/export problems

**Command:** `pnpm --filter web lint`

**Example issues detected:**
- Unused imports
- Console.log statements in production code
- Missing return types
- Unreachable code

**Note:** This step uses `continue-on-error: true` and won't fail CI until configs are fixed.

### 2. Type Check (TypeScript)
**What it catches:**
- Type errors
- Variable shadowing
- Incorrect property access
- Missing type definitions
- Invalid type assignments

**Command:** `pnpm --filter web typecheck`

**Example issues detected:**
- `const` reassignment (like our bug)
- Property doesn't exist on type
- Null/undefined access without checks
- Incorrect function signatures

### 3. Build (Next.js/NestJS)
**What it catches:**
- Module resolution errors
- Missing dependencies
- Build-time configuration issues
- Import path problems
- Next.js specific issues (Turbopack errors)

**Command:** `pnpm --filter web build`

**Example issues detected:**
- Cannot resolve module
- Missing environment variables (build-time)
- Invalid next.config.js
- CSS/asset loading issues

### 4. Test (Jest)
**What it catches:**
- Business logic errors
- Regression issues
- Edge cases
- Integration problems

**Command:** `pnpm --filter web test`

**Example issues detected:**
- Failing assertions
- Runtime errors
- API contract violations
- Component rendering issues

### 5. Deploy (Docker + AWS ECS)
**What it does:**
- Builds production Docker image
- Pushes to ECR
- Updates ECS service
- Runs database migrations

**Now only runs if all previous stages pass**

## Updated Workflows

### Backend Tests Workflow (`.github/workflows/test-backend.yml`)

```yaml
steps:
  - Install dependencies
  - Generate Prisma Client       # Ensure DB types are available
  - Lint backend code           # ✅ NEW: Catch style issues
  - Type check backend code     # ✅ NEW: Catch type errors
  - Build backend               # ✅ NEW: Ensure production build works
  - Run backend tests           # Run Jest tests
  - Generate coverage report
```

### Frontend Tests Workflow (`.github/workflows/test-frontend.yml`)

```yaml
steps:
  - Install dependencies
  - Generate Prisma Client       # Ensure DB types are available
  - Lint frontend code          # ✅ NEW: Catch style issues
  - Type check frontend code    # ✅ NEW: Catch type errors
  - Build frontend              # ✅ NEW: Ensure production build works
  - Run frontend tests          # Run Jest tests
  - Generate coverage report
```

### All Tests Workflow (`.github/workflows/test-all.yml`)

```yaml
backend-tests:
  - Install dependencies
  - Generate Prisma Client
  - Lint backend code          # ✅ NEW
  - Type check backend code    # ✅ NEW
  - Build backend              # ✅ NEW
  - Run backend tests
  - Generate coverage

frontend-tests:
  - Install dependencies
  - Generate Prisma Client
  - Lint frontend code         # ✅ NEW
  - Type check frontend code   # ✅ NEW
  - Build frontend             # ✅ NEW
  - Run frontend tests
  - Generate coverage
```

### Deployment Workflow (`.github/workflows/deploy-frontend.yml`)

```yaml
on:
  workflow_run:
    workflows: ["Frontend Tests"]  # Only runs after tests pass
    types: [completed]
```

**No changes needed** - deployment already waits for tests to pass.

## Benefits

### 1. Faster Feedback ⚡
- Lint errors caught in ~10 seconds
- Type errors caught in ~30 seconds
- Build errors caught in ~2 minutes
- Previously: Had to wait for full Docker build (~5-10 minutes)

### 2. Cost Savings 💰
- Avoid wasting Docker build time on code that won't compile
- Reduce ECR storage from failed builds
- Lower GitHub Actions compute costs

### 3. Better Developer Experience 🎯
- Clear, actionable error messages
- Errors caught at appropriate stage
- Failed builds point to exact problem
- Confidence that passing tests = deployable code

### 4. Deployment Safety 🛡️
- Only deployable code reaches production
- Reduced risk of deployment failures
- Database migrations only run on validated code
- No downtime from build failures

## Time Comparison

### Before (Single Quality Gate)
```
Tests Pass → Docker Build Fails
  ↓              ↓
2 minutes      7 minutes
            ❌ Error found
            (Total: 9 minutes wasted)
```

### After (Multi-Stage Quality Gates)
```
Lint Fails
  ↓
10 seconds
❌ Error found
(Total: 10 seconds saved!)
```

Or if all stages needed:
```
Lint → Type Check → Build → Test → Deploy
 10s →    30s    →  2min → 2min →  7min
✅       ✅         ✅      ✅       ✅
(Total: ~11 minutes, but confident it will succeed)
```

## Running Checks Locally

### Before Pushing Code

**Frontend:**
```bash
# Run all checks locally (recommended before push)
pnpm --filter web lint           # ~10s
pnpm --filter web typecheck      # ~30s
pnpm --filter web build          # ~2min
pnpm --filter web test           # ~2min
```

**Backend:**
```bash
# Run all checks locally (recommended before push)
pnpm --filter @apps/backend lint       # ~10s
pnpm --filter @apps/backend typecheck  # ~20s
pnpm --filter @apps/backend build      # ~1min
pnpm --filter @apps/backend test       # ~2min
```

### Quick Pre-commit Check

**Frontend:**
```bash
# Minimum before committing
pnpm --filter web lint && pnpm --filter web typecheck
```

**Backend:**
```bash
# Minimum before committing
pnpm --filter @apps/backend lint && pnpm --filter @apps/backend typecheck
```

**Both (Recommended):**
```bash
# Check both frontend and backend
pnpm --filter web lint && pnpm --filter web typecheck && \
pnpm --filter @apps/backend lint && pnpm --filter @apps/backend typecheck
```

### VS Code Integration

The workspace is configured to:
- Show TypeScript errors in real-time
- Run ESLint on save
- Highlight issues before you commit

## Package Scripts

### Frontend (`apps/frontend/apps/web/package.json`)
```json
{
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "build": "next build",
    "test": "jest"
  }
}
```

### Backend (`apps/backend/package.json`)
```json
{
  "scripts": {
    "lint": "eslint \"src/**/*.ts\"",
    "typecheck": "tsc --noEmit",        // ✅ ADDED
    "build": "nest build",
    "test": "jest --detectOpenHandles"
  }
}
```

## Common Issues and Solutions

### Issue: "Cannot find module 'undici'"
**Stage caught:** Build ✅
**Previously caught:** Docker build ❌
**Solution:** Add missing dependency to package.json

### Issue: "cannot reassign to a variable declared with `const`"
**Stage caught:** Type Check ✅
**Previously caught:** Docker build ❌
**Solution:** Use different variable name or `let` instead of `const`

### Issue: "Missing semicolon"
**Stage caught:** Lint ✅
**Previously caught:** Never (style issue) ❌
**Solution:** Run `pnpm lint:fix`

## Best Practices

1. **Always run locally before pushing**
   ```bash
   pnpm --filter web lint && pnpm --filter web typecheck
   ```

2. **Fix issues in order**
   - Lint errors first (fastest to fix)
   - Type errors next
   - Build errors
   - Test failures last

3. **Don't skip CI checks**
   - Never use `--no-verify` on commits
   - Don't push directly to main
   - Let CI validate all changes

4. **Monitor CI pipeline**
   - Check GitHub Actions after pushing
   - Fix failures immediately
   - Don't push more code on top of failures

## Migration Notes

### Breaking Changes
- **None** - All existing workflows continue to work
- Additional checks are additive, not breaking

### What to Expect
- First run after merge may be slower (all checks run for first time)
- Build failures will be caught earlier in pipeline
- More detailed error messages from specific stages

### Rollback Plan
If issues arise:
1. Remove new steps from workflow files
2. Previous behavior is restored
3. No data loss or configuration changes

## Metrics to Track

- **Time to detect errors:** Should decrease
- **Docker build failures:** Should decrease to near zero
- **Deployment success rate:** Should increase to near 100%
- **Developer feedback loop:** Should improve (faster failures)

## Future Improvements

1. **Pre-commit hooks** with Husky
   - Run lint + typecheck before allowing commit
   - Prevent bad code from reaching CI

2. **Build caching**
   - Cache TypeScript build output
   - Cache Next.js build
   - Reduce CI time by 30-50%

3. **Parallel jobs**
   - Run lint, typecheck, and tests in parallel
   - Reduce total pipeline time

4. **Progressive deployments**
   - Canary deployments
   - Automatic rollback on errors
   - Zero-downtime deployments

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Next.js Build Output](https://nextjs.org/docs/app/building-your-application/deploying)
- [TypeScript Compiler Options](https://www.typescriptlang.org/tsconfig)
- [ESLint Configuration](https://eslint.org/docs/latest/use/configure/)
