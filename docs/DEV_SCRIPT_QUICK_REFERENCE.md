# 🚀 Dev Script Quick Reference

## One-Line Start

```bash
./dev.sh
```

That's it! Everything runs with defaults.

---

## Common Commands

```bash
# Run everything (default)
./dev.sh
pnpm dev

# Run just frontend
./dev.sh -m frontend
pnpm dev:frontend

# Run just backend  
./dev.sh -m backend
pnpm dev:backend

# Run just database
./dev.sh -m db
pnpm dev:db

# Run in Docker
./dev.sh --docker
pnpm dev:docker

# Skip dependency install
./dev.sh -s

# Show help
./dev.sh --help
```

---

## What Gets Started

### `./dev.sh` (default = all)
✅ PostgreSQL (Docker)  
✅ LocalStack/S3 (Docker)  
✅ Backend at http://localhost:4001  
✅ Frontend at http://localhost:3000

### `./dev.sh -m frontend`
✅ PostgreSQL (Docker)  
✅ Frontend at http://localhost:3000  
⚠️ Expects backend running separately

### `./dev.sh -m backend`
✅ PostgreSQL (Docker)  
✅ LocalStack/S3 (Docker)  
✅ Backend at http://localhost:4001

### `./dev.sh -m db`
✅ PostgreSQL (Docker)  
✅ Database at localhost:5433

---

## URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:4001 |
| Backend API | http://localhost:4001/api |
| PostgreSQL | localhost:5433 |
| LocalStack | http://localhost:4567 |
| Prisma Studio | http://localhost:5555 (run separately) |

---

## Viewing Logs

### Native Mode
```bash
# Backend
tail -f logs/backend.log

# Frontend
tail -f logs/frontend.log

# Both
tail -f logs/*.log
```

### Docker Mode
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

---

## Stopping Services

### If Running `./dev.sh`
Press `Ctrl+C`

### If Running in Docker
```bash
docker-compose down
```

---

## Database Tasks

```bash
# Open Prisma Studio (GUI)
pnpm prisma:studio
# Opens http://localhost:5555

# Run migrations
pnpm prisma:migrate

# Generate Prisma client
pnpm prisma:generate

# Connect with psql
psql postgresql://dentia:dentia@localhost:5433/dentia
```

---

## Testing

```bash
# Run all tests
pnpm test

# Backend tests only
pnpm test:backend

# Frontend tests only
pnpm test:frontend

# With coverage
pnpm test:coverage
```

---

## Troubleshooting

### Port in use?
```bash
lsof -i :3000  # or :4001, :5433
kill -9 <PID>
```

### Database not connecting?
```bash
docker ps | grep postgres
docker-compose restart postgres
```

### Need fresh start?
```bash
docker-compose down -v  # WARNING: deletes data
rm -rf node_modules
pnpm install
./dev.sh
```

---

## Configuration

Create `.env.local` in root:

```bash
# Minimal (defaults work fine)
DATABASE_URL=postgresql://dentia:dentia@localhost:5433/dentia
NEXTAUTH_SECRET=your-secret-here

# Optional - Cognito
COGNITO_USER_POOL_ID=your-pool-id
COGNITO_CLIENT_ID=your-client-id
COGNITO_CLIENT_SECRET=your-client-secret

# Optional - GoHighLevel
GHL_API_KEY=your-api-key
GHL_LOCATION_ID=your-location-id
```

---

## Dev Script Options

```
-m, --mode MODE        What to run: all, frontend, backend, db
-d, --docker           Use Docker for everything
-s, --skip-install     Skip dependency installation
-h, --help             Show help
```

---

## Examples

```bash
# Full stack development
./dev.sh

# Frontend only, skip install
./dev.sh -m frontend -s

# Backend in Docker
./dev.sh -m backend --docker

# Just database
./dev.sh -m db

# Everything in Docker
./dev.sh --docker
```

---

## Status Check

After starting, verify:

```bash
# Frontend
curl http://localhost:3000

# Backend
curl http://localhost:4001/health

# Database
docker exec -it dentia-postgres psql -U dentia -c '\l'
```

---

## Quick Workflow

```bash
# Morning
git pull
pnpm install
./dev.sh

# Develop
# ... make changes ...
# Frontend & backend auto-reload

# Test
pnpm test

# Commit
git add .
git commit -m "Your changes"
git push

# Evening
Ctrl+C  # stops dev.sh
```

---

**Need more details? See [LOCAL_DEV_GUIDE.md](LOCAL_DEV_GUIDE.md)**

