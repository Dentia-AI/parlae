# Docker Compose Port Configuration Guide

## Current Port Mappings

Your `docker-compose.yml` currently uses:
- **PostgreSQL**: `5432:5432`
- **LocalStack (S3)**: `4566:4566`
- **Backend**: `4000:4000`
- **Frontend**: `3000:3000`

## How to Change Ports

### Understanding Port Mapping

Port mapping format: `HOST_PORT:CONTAINER_PORT`
- **HOST_PORT**: Port on your computer (can be changed)
- **CONTAINER_PORT**: Port inside Docker (usually keep same)

### Example: Change PostgreSQL Port

If port 5432 is already in use, change it to 5433:

```yaml
services:
  postgres:
    image: postgres:15-alpine
    ports:
      - "5433:5432"  # Changed from 5432:5432
    # ... rest of config
```

**Important**: Also update the DATABASE_URL in other services:

```yaml
services:
  backend:
    environment:
      DATABASE_URL: postgresql://dentia:dentia@postgres:5432/dentia
      # Notice: Still uses 5432 (internal container port)
    # ...
```

When connecting from your host machine:
```bash
# Now use port 5433
psql -h localhost -p 5433 -U dentia -d dentia
```

### Example: Change All Ports

Here's a complete example with all ports changed:

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: dentia
      POSTGRES_PASSWORD: dentia
      POSTGRES_DB: dentia
    ports:
      - "5433:5432"  # Changed: Was 5432:5432
    volumes:
      - postgres_data:/var/lib/postgresql/data

  localstack:
    image: localstack/localstack:3.6
    restart: unless-stopped
    environment:
      - SERVICES=s3
      - AWS_DEFAULT_REGION=us-east-1
    ports:
      - "4567:4566"  # Changed: Was 4566:4566
    volumes:
      - localstack_data:/var/lib/localstack

  backend:
    build:
      context: .
      dockerfile: infra/docker/backend.Dockerfile
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://dentia:dentia@postgres:5432/dentia
      # Note: Internal port stays 5432
      AWS_REGION: us-east-1
      S3_BUCKET_NAME: dentia-local-bucket
      S3_PUBLIC_BASE_URL: http://localstack:4566/dentia-local-bucket
      # Note: Internal port stays 4566
    ports:
      - "4001:4000"  # Changed: Was 4000:4000
    depends_on:
      - postgres
      - localstack

  frontend:
    build:
      context: .
      dockerfile: infra/docker/frontend.Dockerfile
    environment:
      NODE_ENV: production
      APP_BASE_URL: http://localhost:3001
      # Changed: Must match new port
      NEXT_PUBLIC_APP_BASE_URL: http://localhost:3001
      NEXTAUTH_URL: http://localhost:3001
      AWS_REGION: us-east-1
      S3_BUCKET_NAME: dentia-local-bucket
      S3_PUBLIC_BASE_URL: http://localstack:4566/dentia-local-bucket
      NEXT_PUBLIC_S3_PUBLIC_BASE_URL: http://localhost:4567/dentia-local-bucket
      # Changed: Must match new localstack port
      BACKEND_URL: http://backend:4000
      # Note: Internal port stays 4000
    ports:
      - "3001:3000"  # Changed: Was 3000:3000
    depends_on:
      - backend

volumes:
  postgres_data:
  localstack_data:
```

### Quick Port Change Command

You can also override ports without editing the file:

```bash
# Change PostgreSQL port on the fly
docker-compose up postgres -d -p 5433:5432

# Or use environment variable
POSTGRES_PORT=5433 docker-compose up
```

But this requires modifying docker-compose.yml to use environment variables:

```yaml
services:
  postgres:
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
```

## Common Port Conflicts

### Port Already in Use?

Check what's using a port:

```bash
# Mac/Linux
lsof -i :5432

# Windows
netstat -ano | findstr :5432
```

### Kill the process:

```bash
# Mac/Linux - Get PID from lsof output
kill -9 <PID>

# Windows - Get PID from netstat output
taskkill /PID <PID> /F
```

## Recommended Port Configuration

If you want to avoid conflicts with common services:

```yaml
services:
  postgres:
    ports:
      - "5433:5432"  # Avoid conflict with system PostgreSQL

  localstack:
    ports:
      - "4567:4566"  # Avoid conflict if running other AWS services

  backend:
    ports:
      - "4001:4000"  # Standard practice

  frontend:
    ports:
      - "3001:3000"  # Avoid conflict with other dev servers
```

## After Changing Ports

### Update Connection Strings

If using local development (not Docker):

```bash
# In apps/frontend/.env
DATABASE_URL=postgresql://dentia:dentia@localhost:5433/dentia
# Changed from 5432 to 5433

# In apps/backend/.env
DATABASE_URL=postgresql://dentia:dentia@localhost:5433/dentia
```

### Update URLs

```bash
# In apps/frontend/.env
NEXTAUTH_URL=http://localhost:3001
NEXT_PUBLIC_APP_BASE_URL=http://localhost:3001
```

### Restart Services

```bash
# Stop all services
docker-compose down

# Start with new configuration
docker-compose up
```

## Using Specific Services Only

You can run only specific services:

```bash
# Only database (useful for local dev)
docker-compose up postgres -d

# Database and LocalStack
docker-compose up postgres localstack -d

# Everything except frontend (if running frontend locally)
docker-compose up postgres localstack backend -d
```

## Environment-Specific Configurations

Create different compose files:

```bash
# docker-compose.override.yml (ignored by git)
version: '3.9'

services:
  postgres:
    ports:
      - "5433:5432"

  frontend:
    ports:
      - "3001:3000"
```

Then Docker Compose will automatically merge them:

```bash
docker-compose up
# Automatically uses docker-compose.yml + docker-compose.override.yml
```

## Troubleshooting

### "Port is already allocated"

```bash
# Stop all containers
docker-compose down

# Remove all stopped containers
docker system prune -a

# Try again
docker-compose up
```

### Can't connect to database after port change

Check you're using the correct port:

```bash
# If you changed to 5433:
psql -h localhost -p 5433 -U dentia -d dentia

# Not 5432 anymore!
```

### Frontend can't reach backend

If changing backend port, update BACKEND_URL:

```yaml
frontend:
  environment:
    BACKEND_URL: http://backend:4000  # Internal port, stays same
    BACKEND_API_URL: http://localhost:4001  # External port, if calling from host
```

## Summary

✅ **Change HOST port** (left side): When you have port conflicts  
✅ **Keep CONTAINER port** (right side): Internal Docker networking uses this  
✅ **Update environment variables**: URL references must match new host ports  
✅ **Restart services**: `docker-compose down && docker-compose up`

Example if PostgreSQL 5432 is in use:
```yaml
postgres:
  ports:
    - "5433:5432"  # Host:Container
```

Then connect with: `localhost:5433` (from your computer)

