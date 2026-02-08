# Build Fix Instructions

## Issues Fixed

1. ✅ Wrong `PageHeader` import path - Fixed to use `@kit/ui/page`
2. ✅ Missing `zod` dependency in `@kit/shared` - Added to package.json
3. ✅ Missing `uuid` dependency in `@kit/shared` - Added to package.json
4. ✅ Missing `employee-management` export - Added to exports

## Steps to Rebuild

### Step 1: Install Dependencies

```bash
cd /Users/shaunk/Projects/Dentia/dentia/apps/frontend

# Install the new dependencies
pnpm install
```

### Step 2: Rebuild the Image

```bash
cd /Users/shaunk/Projects/Dentia/dentia

# Rebuild the frontend Docker image
docker build -f infra/docker/frontend.Dockerfile -t dentia-frontend:latest .
```

### Step 3: Verify Build Success

The build should now complete without errors. Look for:
```
✓ Compiled successfully
Creating an optimized production build ...
```

---

## What Was Changed

### 1. `apps/frontend/apps/web/app/home/(user)/employees/page.tsx`

**Before:**
```typescript
import { PageHeader } from '@kit/ui/page-header';
```

**After:**
```typescript
import { PageHeader } from '@kit/ui/page';
```

### 2. `apps/frontend/packages/shared/package.json`

**Added exports:**
```json
"./employee-management": "./src/employee-management/index.ts"
```

**Added dependencies:**
```json
"zod": "catalog:",
"uuid": "catalog:"
```

---

## Quick Command Reference

```bash
# From project root
cd /Users/shaunk/Projects/Dentia/dentia/apps/frontend

# Install dependencies
pnpm install

# Go back to root
cd ../..

# Rebuild Docker image
docker build -f infra/docker/frontend.Dockerfile -t dentia-frontend:latest .

# Or if you want to build and push to ECR in one go:
# (Replace with your ECR repository URI)
docker build -f infra/docker/frontend.Dockerfile -t <your-ecr-uri>:latest .
docker push <your-ecr-uri>:latest
```

---

## Verification

After rebuilding, the build should succeed and you should see output like:

```
✓ Compiled successfully
Route (app)                              Size     First Load JS
┌ ○ /                                    ...
├ ○ /home                                ...
├ ○ /home/employees                      ...  <- Your new page
└ ○ ...
```

---

## If You Still Get Errors

### Error: "Can't resolve '@kit/ui/page'"

**Solution:** The UI package might be missing the PageHeader export. Check:
```bash
# Verify the export exists
ls apps/frontend/packages/ui/src/makerkit/page.tsx
```

### Error: "Module not found: Can't resolve 'zod'"

**Solution:** Make sure you ran `pnpm install` after updating package.json:
```bash
cd apps/frontend
pnpm install --frozen-lockfile=false
```

### Error: "Cannot find module '@kit/shared/employee-management'"

**Solution:** The TypeScript paths might need regeneration:
```bash
cd apps/frontend
pnpm install
```

---

## Next Steps After Successful Build

1. **Push to ECR** (if deploying to ECS)
2. **Update ECS Service** to use the new image
3. **Test the employees page** at `/home/employees`
4. **Deploy database migrations** using the script we created earlier

---

## Related Documentation

- `PRODUCTION_DEPLOYMENT.md` - For deploying database migrations
- `E2E_TESTING_GUIDE.md` - For testing the new features
- `STEP_5_COMPLETE.md` - Details on the UI components

