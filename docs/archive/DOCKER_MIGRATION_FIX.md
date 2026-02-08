# Docker Migration Fix

## Problem

Docker build was failing with:
```
ERROR: "/app/node_modules/@prisma/client": not found
ERROR: "/app/node_modules/@prisma/engines": not found
```

## Root Cause

When using **pnpm**, the `node_modules` structure is different from npm:
- pnpm uses a `.pnpm` store directory with symlinks
- The actual packages are in `/app/node_modules/.pnpm/package-name@version/`
- `node_modules/package-name` is just a symlink pointing to `.pnpm/...`
- Docker COPY cannot follow symlinks across stages

So when we tried to:
```dockerfile
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
```

Docker couldn't find it because `@prisma/client` was a symlink, not an actual directory.

## Solution

Copy the actual `.pnpm` store directories where Prisma packages are located:

```dockerfile
# Copy Prisma package for migrations
COPY --from=builder --chown=nextjs:nodejs /app/packages/prisma ./packages/prisma

# Copy the Prisma CLI and generated client from builder (already built there)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.pnpm/prisma@5.22.0 ./node_modules/.pnpm/prisma@5.22.0
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0 ./node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.pnpm/@prisma+engines@5.22.0 ./node_modules/.pnpm/@prisma+engines@5.22.0
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.pnpm/node_modules ./node_modules/.pnpm/node_modules
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.modules.yaml ./node_modules/.modules.yaml
```

This copies:
1. **prisma@5.22.0** - The Prisma CLI for running migrations
2. **@prisma+client@5.22.0_prisma@5.22.0** - The generated Prisma client
3. **@prisma+engines@5.22.0** - The Prisma query engine binaries
4. **.pnpm/node_modules** - Shared dependencies
5. **.modules.yaml** - pnpm metadata

## Files Fixed

- ✅ `infra/docker/frontend.Dockerfile` - Fixed Prisma package copying
- ✅ `infra/docker/backend.Dockerfile` - Already working (copies entire /app)
- ✅ `scripts/migrate-and-start.sh` - Enhanced with better path detection

## Testing

Build succeeded:
```bash
docker build -f infra/docker/frontend.Dockerfile -t dentia-frontend:test .
# ✅ Success!
```

## Next Steps

1. **Test the migration script locally**:
   ```bash
   export DATABASE_URL='postgresql://test_admin:test_password@localhost:15432/dentia?schema=public'
   ./scripts/deploy-migrations-local.sh
   ```

2. **Deploy to production**:
   ```bash
   cd /Users/shaunk/Projects/Dentia/dentia
   
   # Build and push frontend
   docker build -f infra/docker/frontend.Dockerfile -t dentia-frontend:latest .
   docker tag dentia-frontend:latest <ecr-uri>/dentia-frontend:latest
   docker push <ecr-uri>/dentia-frontend:latest
   
   # Build and push backend
   docker build -f infra/docker/backend.Dockerfile -t dentia-backend:latest .
   docker tag dentia-backend:latest <ecr-uri>/dentia-backend:latest
   docker push <ecr-uri>/dentia-backend:latest
   
   # Update ECS services
   aws ecs update-service \
     --cluster dentia-cluster \
     --service dentia-frontend-service \
     --force-new-deployment \
     --profile dentia \
     --region us-east-2
   
   aws ecs update-service \
     --cluster dentia-cluster \
     --service dentia-backend-service \
     --force-new-deployment \
     --profile dentia \
     --region us-east-2
   ```

3. **Monitor CloudWatch logs** to see migrations run:
   ```bash
   aws logs tail /ecs/dentia-frontend --follow --profile dentia --region us-east-2
   ```

   You should see:
   ```
   🗄️  Running Database Migrations
   Using Prisma directory: /app/packages/prisma
   Running prisma migrate deploy...
   
   The following migrations have been applied:
     20251030031945_first_mig
     20251104175917_add_user_roles_and_permissions
     20251104212242_add_cognito_username
   
   ✅ Migrations completed successfully
   🚀 Starting application...
   ```

## Summary

✅ **Fixed**: Docker build now works with pnpm's symlink structure
✅ **Migrations**: Will run automatically when containers start in ECS
✅ **Idempotent**: Safe to run multiple times (only new migrations applied)
✅ **Safe**: If migrations fail, container won't start

The Cognito sign-in fix migration (`add_cognito_username`) will be applied automatically on next deployment! 🎉

