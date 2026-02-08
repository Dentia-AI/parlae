# Complete Local Development Setup Guide

## Quick Start (5 Minutes)

### 1. Install Dependencies

```bash
cd /Users/shaunk/Projects/Dentia/dentia
pnpm install
```

### 2. Start Docker Services

```bash
# Start PostgreSQL and LocalStack
docker-compose up postgres localstack -d
```

**Port Conflicts?** See [DOCKER_PORT_CONFIGURATION.md](./DOCKER_PORT_CONFIGURATION.md)

### 3. Setup Database

```bash
# Run migrations and seed data
./scripts/prepare-testing.sh

# Or manually:
cd packages/prisma
pnpm prisma migrate deploy
pnpm prisma db seed
```

### 4. Configure Environment

Create `apps/frontend/.env.local`:

```bash
# Database
DATABASE_URL=postgresql://dentia:dentia@localhost:5432/dentia

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here-change-in-production

# Cognito (Get these from AWS Console or use provided credentials)
COGNITO_CLIENT_ID=your-client-id
COGNITO_CLIENT_SECRET=your-client-secret
COGNITO_ISSUER=https://cognito-idp.us-east-2.amazonaws.com/your-pool-id

# Or enable credentials login for development
ENABLE_CREDENTIALS_SIGNIN=true

# AWS/S3 (LocalStack for local dev)
AWS_REGION=us-east-1
S3_BUCKET=dentia-local-bucket
NEXT_PUBLIC_S3_PUBLIC_BASE_URL=http://localhost:4566/dentia-local-bucket

# Backend API
BACKEND_API_URL=http://localhost:4000

# GoHighLevel Integration (Optional - only needed if using CRM integration)
GHL_API_KEY=your-gohighlevel-api-key
GHL_LOCATION_ID=your-gohighlevel-location-id
```

### 5. Start Development Servers

```bash
# Terminal 1: Frontend
cd apps/frontend
pnpm run dev

# Terminal 2: Backend (optional, if testing APIs)
cd apps/backend
pnpm run dev
```

### 6. Access the Application

Open: **http://localhost:3000**

**Login credentials:**
- 📧 Email: `test@example.com`
- 🔑 Password: (Set in Cognito or any text if credentials mode enabled)

---

## What Gets Seeded

The seed script (`packages/prisma/seed.ts`) creates:

### Roles and Permissions

**Owner Role** (Full Access):
- `ROLES_MANAGE` - Manage team roles
- `BILLING_MANAGE` - Access billing
- `SETTINGS_MANAGE` - Update settings
- `MEMBERS_MANAGE` - Add/remove members
- `INVITES_MANAGE` - Manage invitations
- `CAMPAIGNS_VIEW/CREATE/EDIT/DELETE` - Campaign management
- `ADS_VIEW/CREATE/EDIT/DELETE` - Ad management
- `ANALYTICS_VIEW` - View analytics

**Admin Role** (Everything except billing):
- All permissions except `BILLING_MANAGE`

**Editor Role** (Create/Edit):
- `CAMPAIGNS_VIEW/CREATE/EDIT`
- `ADS_VIEW/CREATE/EDIT`
- `ANALYTICS_VIEW`

**Viewer Role** (Read-only):
- `CAMPAIGNS_VIEW`
- `ADS_VIEW`
- `ANALYTICS_VIEW`

### Test User

**Email**: `test@example.com`  
**Account**: "Test User's Account" (Personal account)  
**Role**: Owner (full permissions)

---

## Development Workflow

### Making Database Changes

1. **Edit Prisma Schema**:
```bash
# Edit: packages/prisma/schema.prisma
vim packages/prisma/schema.prisma
```

2. **Create Migration**:
```bash
cd packages/prisma
pnpm prisma migrate dev --name your_change_description
```

3. **Apply to Database**:
```bash
pnpm prisma migrate deploy
```

4. **Regenerate Client**:
```bash
pnpm prisma generate
```

### Adding Test Data

You can modify the seed file or add data manually:

```bash
# Connect to database
docker exec -it dentia-postgres-1 psql -U dentia -d dentia

# Add a notification
INSERT INTO notifications (id, user_id, title, body, type, dismissed, created_at)
VALUES (gen_random_uuid(), 'YOUR_USER_ID', 'Test', 'Test body', 'INFO', false, NOW());

# Get your user ID
SELECT id, email FROM "User";
```

### Hot Reload

Both frontend and backend support hot reload:
- **Frontend**: Automatically reloads on file changes
- **Backend**: Uses `nodemon` for auto-restart

### Debugging

**Frontend**:
```bash
# Run with debugging
cd apps/frontend
pnpm run dev

# Then attach debugger in VS Code or Chrome DevTools
```

**Backend**:
```bash
# Run with debugging
cd apps/backend
pnpm run start:dev

# Or with inspector
pnpm run start:debug
```

**Database**:
```bash
# View logs
docker-compose logs -f postgres

# Connect with psql
docker exec -it dentia-postgres-1 psql -U dentia -d dentia
```

---

## Testing the New Features

### Desktop Testing

1. **Notification Bell**:
   - Bottom left sidebar
   - Click to expand
   - Shows top 3 notifications

2. **Account Selector**:
   - Top of sidebar
   - Search works (no "[object Object]")
   - "Create Account" opens modal

### Mobile Testing

1. **Open Chrome DevTools** (F12)
2. **Toggle Device Toolbar** (Cmd+Shift+M)
3. **Select iPhone 14 Pro**
4. **Refresh Page**

**You should see:**
- Bottom navigation bar (Home, Notifications, Menu)
- Badge on Notifications
- Menu opens bottom sheet with account selector

---

## Common Issues

### Port 5432 Already in Use

```bash
# Option 1: Stop conflicting service
brew services stop postgresql

# Option 2: Change Docker port
# Edit docker-compose.yml:
ports:
  - "5433:5432"  # Changed from 5432

# Then update connection strings to use 5433
```

### Can't Login

**Check Cognito configuration**:
```bash
cat apps/frontend/.env.local | grep COGNITO
```

**Or enable credentials mode**:
```bash
echo "ENABLE_CREDENTIALS_SIGNIN=true" >> apps/frontend/.env.local
```

### Database Connection Error

```bash
# Check database is running
docker-compose ps postgres

# If not running
docker-compose up postgres -d

# Check logs
docker-compose logs postgres
```

### Frontend Build Errors

```bash
# Clean and reinstall
cd apps/frontend
rm -rf node_modules .next
pnpm install
pnpm run dev
```

### Prisma Client Out of Sync

```bash
cd packages/prisma
pnpm prisma generate
```

---

## VS Code Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: debug server-side",
      "type": "node-terminal",
      "request": "launch",
      "command": "cd apps/frontend && pnpm dev"
    },
    {
      "name": "Next.js: debug client-side",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:3000"
    }
  ]
}
```

---

## Useful Commands

### Database

```bash
# Reset database (WARNING: Deletes all data!)
cd packages/prisma
pnpm prisma migrate reset

# View database in Prisma Studio
pnpm prisma studio

# Create new migration
pnpm prisma migrate dev

# Check migration status
pnpm prisma migrate status
```

### Docker

```bash
# View running containers
docker-compose ps

# View logs
docker-compose logs -f [service]

# Restart a service
docker-compose restart [service]

# Stop all services
docker-compose down

# Remove volumes (WARNING: Deletes database data!)
docker-compose down -v
```

### Development

```bash
# Run type checking
pnpm run type-check

# Run linting
pnpm run lint

# Build for production
pnpm run build

# Run tests (if configured)
pnpm run test
```

---

## Production-Like Testing

To test with Docker (like production):

```bash
# Build and start all services
docker-compose up --build

# Access at:
# - Frontend: http://localhost:3000
# - Backend: http://localhost:4000
# - Database: localhost:5432
```

---

## Environment Files

### apps/frontend/.env.local
```bash
DATABASE_URL=postgresql://dentia:dentia@localhost:5432/dentia
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=dev-secret-change-in-production
COGNITO_CLIENT_ID=your-client-id
COGNITO_CLIENT_SECRET=your-client-secret
COGNITO_ISSUER=https://cognito-idp.us-east-2.amazonaws.com/your-pool-id
ENABLE_CREDENTIALS_SIGNIN=true
BACKEND_API_URL=http://localhost:4000
AWS_REGION=us-east-1
S3_BUCKET=dentia-local-bucket
NEXT_PUBLIC_S3_PUBLIC_BASE_URL=http://localhost:4566/dentia-local-bucket
```

### apps/backend/.env
```bash
DATABASE_URL=postgresql://dentia:dentia@localhost:5432/dentia
PORT=4000
NODE_ENV=development
AWS_REGION=us-east-1
S3_BUCKET=dentia-local-bucket
COGNITO_USER_POOL_ID=your-pool-id
COGNITO_CLIENT_ID=your-client-id
COGNITO_ISSUER=https://cognito-idp.us-east-2.amazonaws.com/your-pool-id
```

---

## Next Steps

1. ✅ Follow [LOCAL_TESTING_GUIDE.md](./LOCAL_TESTING_GUIDE.md) to test mobile features
2. ✅ Check [DOCKER_PORT_CONFIGURATION.md](./DOCKER_PORT_CONFIGURATION.md) if you have port conflicts
3. ✅ Read [E2E_TESTING_GUIDE.md](./E2E_TESTING_GUIDE.md) for comprehensive testing

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `docker-compose up -d` | Start all services in background |
| `pnpm run dev` | Start development server |
| `pnpm prisma db seed` | Seed database with test data |
| `pnpm prisma studio` | Open database GUI |
| `docker-compose logs -f` | View live logs |
| `docker-compose down` | Stop all services |

---

Happy coding! 🚀

