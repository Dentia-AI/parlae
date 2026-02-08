# Local Development Guide

## 🚀 Quick Start (30 Seconds)

```bash
cd dentia
./dev.sh
```

**That's it!** Open http://localhost:3000

## What Gets Started

The `dev.sh` script automatically:
1. ✅ Cleans up any existing services
2. ✅ Starts PostgreSQL (Docker container on port 5433)
3. ✅ Starts LocalStack for S3 emulation (port 4567)
4. ✅ Runs Prisma migrations
5. ✅ Starts Backend API (NestJS on port 4001)
6. ✅ Starts Frontend (Next.js on port 3000)

## Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | Next.js application |
| Backend API | http://localhost:4001 | NestJS REST API |
| Backend Health | http://localhost:4001/health | Health check endpoint |
| PostgreSQL | postgresql://dentia:dentia@localhost:5433/dentia | Database connection |
| LocalStack | http://localhost:4567 | Local S3 emulator |
| Prisma Studio | Run: `cd packages/prisma && npx prisma studio` | Visual DB editor |

## Development Script Options

### Run Everything (Default)

```bash
./dev.sh
```

Starts: PostgreSQL + LocalStack + Backend + Frontend

### Run Only Frontend

```bash
./dev.sh -m frontend
```

Starts: PostgreSQL + Frontend  
**Note:** Expects backend at http://localhost:4001 (run separately or deployed)

### Run Only Backend

```bash
./dev.sh -m backend
```

Starts: PostgreSQL + LocalStack + Backend  
**Use case:** API development, testing backend

### Run Only Database

```bash
./dev.sh -m db
```

Starts: PostgreSQL only  
**Use case:** Database migrations, Prisma Studio, schema work

### Use Docker for Everything

```bash
./dev.sh --docker
```

Runs all services in Docker containers (slower but more production-like)

### Skip Dependency Installation

```bash
./dev.sh -s
```

Skip `pnpm install` (faster if dependencies already installed)

### Combine Options

```bash
# Frontend only, skip install
./dev.sh -m frontend -s

# Backend in Docker
./dev.sh -m backend --docker
```

## Viewing Logs

### Real-time Logs (Terminal)

All logs are displayed in your terminal by default. You'll see:
- Database startup
- Migration output
- Backend compilation and requests
- Frontend hot reload and requests

### Saved Log Files

Logs are also saved to:
- `logs/backend.log` - Backend service logs
- `logs/frontend.log` - Frontend service logs

```bash
# Tail backend logs
tail -f logs/backend.log

# Tail frontend logs
tail -f logs/frontend.log

# Search logs
grep "ERROR" logs/backend.log
```

### Docker Logs

If running in Docker mode:

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f postgres
docker-compose logs -f backend
docker-compose logs -f frontend
```

## Database Management

### Prisma Studio (Visual Editor)

```bash
cd packages/prisma
npx prisma studio
```

Opens web UI at http://localhost:5555 where you can:
- Browse all tables
- Edit data visually
- Run filters and searches
- View relationships

### psql (Command Line)

```bash
# Connect to database
psql postgresql://dentia:dentia@localhost:5433/dentia

# Useful commands
\dt              # List tables
\d users         # Describe users table
SELECT * FROM users LIMIT 10;
```

### Database Migrations

```bash
cd packages/prisma

# Check migration status
npx prisma migrate status

# Create new migration
npx prisma migrate dev --name add_feature

# Apply migrations
npx prisma migrate deploy

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

### Seed Data

```bash
cd packages/prisma

# Run seed script (if exists)
npx prisma db seed
```

## Stopping Services

### Stop via dev.sh

If you started services with `./dev.sh`:
- Press `Ctrl+C` in the terminal
- Script will gracefully shut down all services

### Manual Cleanup

If services won't stop or you closed the terminal:

```bash
# Stop all services and clean up
./cleanup.sh

# Also remove log files
./cleanup.sh --logs
```

This script:
- Kills processes on ports 3000, 4001, 5433, 4567
- Stops Docker containers
- Removes PID files
- Cleans up lock files
- Optionally removes log files

### Docker Only

```bash
# Stop containers
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

## Environment Variables

### Default Values

The `dev.sh` script sets these defaults:

```bash
NODE_ENV=development
DATABASE_URL=postgresql://dentia:dentia@localhost:5433/dentia
BACKEND_URL=http://localhost:4001
BACKEND_API_URL=http://localhost:4001
NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=dev-secret-change-in-production
AWS_REGION=us-east-1
S3_BUCKET_NAME=dentia-local-bucket
S3_PUBLIC_BASE_URL=http://localhost:4567/dentia-local-bucket
COGNITO_USER_POOL_ID=us-east-2_PLACEHOLDER
COGNITO_CLIENT_ID=placeholder-client-id
ENABLE_CREDENTIALS_SIGNIN=true
```

### Custom Configuration

Create `.env.local` in the `dentia/` directory:

```bash
cd dentia
cp .env.example .env.local
nano .env.local
```

Override any defaults:

```bash
# Example: Use real Cognito for local dev
COGNITO_USER_POOL_ID=us-east-2_RealPoolId
COGNITO_CLIENT_ID=real-client-id
COGNITO_CLIENT_SECRET=real-client-secret
COGNITO_ISSUER=https://cognito-idp.us-east-2.amazonaws.com/us-east-2_RealPoolId

# Example: Use real S3
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
S3_BUCKET_NAME=my-dev-bucket

# Example: Custom ports
PORT=4002  # Backend port (update BACKEND_URL too)
```

### Loading Order

1. `.env` (committed defaults)
2. `.env.local` (your overrides, gitignored)
3. `dev.sh` defaults (if not set)

## Troubleshooting

### Port Already in Use

**Error:** `EADDRINUSE: address already in use :::3000`

**Solution:**
```bash
# Stop all services
./cleanup.sh

# Or manually kill port
lsof -ti:3000 | xargs kill -9

# Restart
./dev.sh
```

### Database Won't Start

**Error:** `Container dentia-postgres failed to start`

**Solution:**
```bash
# Check Docker is running
docker ps

# Remove old container
docker rm -f dentia-postgres

# Remove volume (WARNING: deletes data)
docker volume rm dentia_postgres_data

# Restart
./dev.sh
```

### Backend Won't Start

**Error:** `Backend failed to start! Check output above for errors.`

**Common causes:**
1. **Missing dependencies:** Run `cd apps/backend && pnpm install`
2. **Database not ready:** Wait a few more seconds
3. **Port conflict:** Kill port 4001
4. **Compilation error:** Check logs for TypeScript errors

**Solution:**
```bash
# Install dependencies
cd apps/backend
pnpm install

# Check for errors
pnpm run build

# Start manually to see errors
pnpm start:dev
```

### Frontend Won't Start

**Error:** `Frontend failed to start! Check output above for errors.`

**Common causes:**
1. **Missing dependencies:** Run `cd apps/frontend/apps/web && pnpm install`
2. **Port conflict:** Kill port 3000
3. **Backend not running:** Start backend first
4. **Build error:** Check logs for errors

**Solution:**
```bash
# Install dependencies
cd apps/frontend/apps/web
pnpm install

# Clear Next.js cache
rm -rf .next

# Start manually to see errors
pnpm dev
```

### Migration Errors

**Error:** `Migration failed to apply`

**Solution:**
```bash
cd packages/prisma

# Check migration status
npx prisma migrate status

# If migration partially applied
npx prisma migrate resolve --applied MIGRATION_NAME

# If migration failed
npx prisma migrate resolve --rolled-back MIGRATION_NAME

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

### "Command not found: pnpm"

**Solution:**
```bash
# Install pnpm
npm install -g pnpm

# Or use corepack (Node.js 16+)
corepack enable
corepack prepare pnpm@latest --activate
```

### LocalStack Not Working

**Error:** `Cannot connect to LocalStack`

**Solution:**
```bash
# Check container status
docker ps | grep localstack

# Restart LocalStack
docker restart dentia-localstack

# Or remove and recreate
docker rm -f dentia-localstack
./dev.sh -m db
```

### Lock Files

**Error:** `Another instance is already running`

**Solution:**
```bash
# Remove lock file
rm -f apps/frontend/apps/web/.next/dev/lock

# Clean up all locks
./cleanup.sh
```

## Development Tips

### Hot Reload

Both frontend and backend support hot reload:
- **Frontend:** Changes to React components reload instantly
- **Backend:** Changes to NestJS files trigger automatic restart

### Database Changes

After modifying `schema.prisma`:

```bash
cd packages/prisma

# Create migration
npx prisma migrate dev --name my_change

# Regenerate client
npx prisma generate
```

### Testing API Endpoints

```bash
# Health check
curl http://localhost:4001/health

# API endpoints
curl http://localhost:4001/api/auth/profile \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Debugging

**Backend (NestJS):**
```bash
cd apps/backend
pnpm start:debug
# Attach debugger on port 9229
```

**Frontend (Next.js):**
- Use browser DevTools
- Add `console.log()` statements
- Use React DevTools extension

### Code Quality

```bash
# Lint
cd dentia
pnpm lint

# Format
pnpm format

# Type check
pnpm type-check

# Run tests
pnpm test
```

## Development Workflow

### Typical Development Session

```bash
# 1. Start services
cd dentia
./dev.sh

# 2. Make code changes
# Frontend: dentia/apps/frontend/
# Backend: dentia/apps/backend/
# Database: dentia/packages/prisma/

# 3. Changes auto-reload
# Frontend: Instant reload
# Backend: Auto-restart on save

# 4. Test in browser
open http://localhost:3000

# 5. When done
# Press Ctrl+C to stop all services
```

### Database Schema Changes

```bash
# 1. Edit schema
nano packages/prisma/schema.prisma

# 2. Create migration
cd packages/prisma
npx prisma migrate dev --name add_feature

# 3. Migration applied automatically to local DB
# 4. Prisma client regenerated automatically
# 5. Restart backend (auto-restart should handle it)
```

### Adding New Features

**Frontend:**
```bash
cd apps/frontend/apps/web

# Create new page
mkdir -p app/my-feature
touch app/my-feature/page.tsx

# Create component
mkdir -p components/my-feature
touch components/my-feature/my-component.tsx

# Hot reload will show changes immediately
```

**Backend:**
```bash
cd apps/backend

# Generate module
nest generate module my-feature
nest generate controller my-feature
nest generate service my-feature

# Files created in src/my-feature/
# Backend auto-restarts on save
```

## Advanced Configuration

### Custom Ports

Edit environment variables:

```bash
# Frontend port (Next.js)
export PORT=3001

# Backend port (NestJS)
export BACKEND_PORT=4002

# Update references
export BACKEND_URL=http://localhost:4002
export BACKEND_API_URL=http://localhost:4002
```

### Multiple Instances

Run backend and frontend in separate terminals:

```bash
# Terminal 1: Database
./dev.sh -m db

# Terminal 2: Backend
cd apps/backend
pnpm start:dev

# Terminal 3: Frontend
cd apps/frontend/apps/web
pnpm dev
```

### Docker Development

For a more production-like environment:

```bash
# Use Docker for all services
./dev.sh --docker

# Or use docker-compose directly
docker-compose up

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## Performance Tips

### Speed Up Builds

```bash
# Skip install if deps haven't changed
./dev.sh -s

# Use Docker layer caching
docker-compose build --parallel

# Clear cache if needed
rm -rf node_modules
pnpm store prune
```

### Reduce Memory Usage

```bash
# Run only what you need
./dev.sh -m frontend  # If working on frontend only
./dev.sh -m backend   # If working on backend only

# Stop unused Docker containers
docker ps
docker stop <container-id>
```

### Faster Database Resets

```bash
# Instead of migrate reset (slow)
cd packages/prisma
npx prisma db push --force-reset
```

## Testing

### Backend Tests

```bash
cd apps/backend

# Unit tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:cov

# E2E tests
pnpm test:e2e
```

### Frontend Tests

```bash
cd apps/frontend/apps/web

# Unit tests
pnpm test

# Watch mode
pnpm test:watch

# E2E tests (Playwright)
pnpm test:e2e
```

### Integration Tests

```bash
# Start all services
./dev.sh

# Run integration tests (in another terminal)
cd dentia
pnpm test:integration
```

## Common Development Tasks

### Create Super Admin User

```bash
# Option 1: Direct SQL
psql postgresql://dentia:dentia@localhost:5433/dentia
UPDATE users SET role = 'super_admin' WHERE email = 'admin@test.com';

# Option 2: Prisma Studio
cd packages/prisma
npx prisma studio
# Navigate to users table
# Edit user role to "super_admin"
```

### View All Routes

**Frontend:**
```bash
cd apps/frontend/apps/web
find app -name "page.tsx" -o -name "route.ts"
```

**Backend:**
```bash
cd apps/backend
grep -r "@Controller" src/
grep -r "@Get\|@Post\|@Put\|@Delete" src/
```

### Clear All Data

```bash
# Reset database (WARNING: deletes all data)
cd packages/prisma
npx prisma migrate reset

# Or manually
psql postgresql://dentia:dentia@localhost:5433/dentia
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

# Then run migrations
npx prisma migrate deploy
```

### Export/Import Data

```bash
# Export
pg_dump postgresql://dentia:dentia@localhost:5433/dentia > backup.sql

# Import
psql postgresql://dentia:dentia@localhost:5433/dentia < backup.sql
```

## Development Best Practices

### 1. Use Feature Branches

```bash
git checkout -b feature/my-feature
# Make changes
git commit -am "Add my feature"
git push origin feature/my-feature
```

### 2. Keep Database in Sync

After pulling changes:
```bash
cd packages/prisma
npx prisma migrate deploy
npx prisma generate
```

### 3. Test Before Committing

```bash
# Run linter
pnpm lint

# Run tests
pnpm test

# Type check
pnpm type-check

# Build check
pnpm build
```

### 4. Clean Restart

If things are acting strange:
```bash
# Stop all services
./cleanup.sh --logs

# Clear dependency cache
rm -rf node_modules
pnpm store prune

# Reinstall
pnpm install

# Clear Next.js cache
rm -rf apps/frontend/apps/web/.next

# Restart
./dev.sh
```

## Environment Setup

### First Time Setup

```bash
# 1. Clone repository
git clone <repo-url>
cd dentia-starter-kit

# 2. Install dependencies
cd dentia
pnpm install

# 3. Create environment file
cp .env.example .env.local

# 4. Start services
./dev.sh
```

### Team Onboarding

New team member setup:

```bash
# 1. Install prerequisites
brew install node pnpm docker

# 2. Clone repo
git clone <repo-url>
cd dentia-starter-kit/dentia

# 3. Start dev environment
./dev.sh

# 4. Create account
open http://localhost:3000
# Sign up with test account
```

## IDE Setup

### VS Code

**Recommended Extensions:**
- ESLint
- Prettier
- Prisma
- Docker
- GitLens

**Settings (.vscode/settings.json):**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.tsdk": "node_modules/typescript/lib",
  "prisma.fileWatcher": true
}
```

### Debug Configuration

**Backend (.vscode/launch.json):**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "attach",
      "name": "Attach to Backend",
      "port": 9229,
      "restart": true,
      "sourceMaps": true
    }
  ]
}
```

## Performance Monitoring

### Backend Performance

```bash
# Check backend health
curl http://localhost:4001/health

# Monitor response times
curl -w "@curl-format.txt" http://localhost:4001/api/endpoint
```

### Frontend Performance

- Use Chrome DevTools → Performance tab
- Check Network tab for slow requests
- Use Lighthouse for audits

### Database Performance

```bash
# Connect to database
psql postgresql://dentia:dentia@localhost:5433/dentia

# Check slow queries
SELECT * FROM pg_stat_activity WHERE state = 'active';

# View table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## FAQ

### Q: Do I need AWS credentials for local development?

**A:** No! Local development uses:
- Docker PostgreSQL (not RDS)
- LocalStack (not real S3)
- Placeholder Cognito values (or real ones if you want)

### Q: Can I use a different database?

**A:** Technically yes, but not recommended. The app is built for PostgreSQL. To try:
- Update `DATABASE_URL` in `.env.local`
- Ensure Prisma supports your database
- Some features may not work (vector search requires pgvector)

### Q: How do I add a new npm package?

**A:**
```bash
# For frontend
cd apps/frontend/apps/web
pnpm add package-name

# For backend
cd apps/backend
pnpm add package-name

# For shared package
cd packages/prisma
pnpm add package-name
```

### Q: How do I update dependencies?

**A:**
```bash
# Check outdated
pnpm outdated

# Update all
pnpm update

# Update specific package
pnpm update package-name

# Update to latest (breaking changes possible)
pnpm update package-name@latest
```

### Q: Can I run multiple dev environments?

**A:** Yes, but you'll need different ports:

```bash
# Project 1 (default ports)
cd project1/dentia
./dev.sh

# Project 2 (custom ports)
cd project2/dentia
export DATABASE_URL=postgresql://dentia:dentia@localhost:5434/dentia
export PORT=3001
export BACKEND_PORT=4002
docker-compose up -d postgres  # Expose on 5434
# Start backend on 4002
# Start frontend on 3001
```

### Q: How do I debug database queries?

**A:** Enable Prisma logging:

```typescript
// apps/backend/src/prisma/prisma.service.ts
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});
```

### Q: How do I test email sending locally?

**A:** Use a service like Mailhog or Mailtrap:

```bash
# Install Mailhog
brew install mailhog
mailhog

# Update .env.local
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=

# View emails at http://localhost:8025
```

## Next Steps

- ✅ Start developing features
- ✅ Read component documentation in `dentia/README.md`
- ✅ Review database schema in `packages/prisma/schema.prisma`
- ✅ Check API endpoints in `apps/backend/src/`
- ✅ Explore frontend pages in `apps/frontend/apps/web/app/`
- ✅ Test admin features (see `docs/ADMIN_IMPERSONATION_GUIDE.md`)

---

**Happy coding!** 🚀

For production deployment, see `docs/AWS_DEPLOYMENT_READINESS.md`

