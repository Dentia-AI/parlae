#!/bin/bash

# Parlae Local Development Script
# Runs the full development environment with DB, Backend, and Frontend

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
MODE="all"
USE_DOCKER=false
SKIP_INSTALL=false

# Print colored message
print_message() {
    echo -e "${2}${1}${NC}"
}

# Print section header
print_header() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}${1}${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Show usage
show_usage() {
    cat << EOF
${CYAN}🚀 Parlae Local Development Script${NC}

${YELLOW}Usage:${NC}
  ./dev.sh [OPTIONS]

${YELLOW}Options:${NC}
  -m, --mode MODE        What to run: all, frontend, backend, db (default: all)
  -d, --docker           Use Docker for all services
  -s, --skip-install     Skip dependency installation
  -h, --help             Show this help message

${YELLOW}Examples:${NC}
  ./dev.sh                      # Run everything (DB + Backend + Frontend)
  ./dev.sh -m frontend          # Run only frontend (DB + Frontend)
  ./dev.sh -m backend           # Run only backend (DB + Backend)
  ./dev.sh -m db                # Run only database
  ./dev.sh --docker             # Run everything in Docker
  ./dev.sh -m frontend -s       # Run frontend, skip install

${YELLOW}What runs in each mode:${NC}
  ${GREEN}all${NC}      - PostgreSQL, LocalStack, Backend (NestJS), Frontend (Next.js)
  ${GREEN}frontend${NC} - PostgreSQL, Frontend (Next.js) - expects backend at localhost:3333
  ${GREEN}backend${NC}  - PostgreSQL, LocalStack, Backend (NestJS)
  ${GREEN}db${NC}       - PostgreSQL only

${YELLOW}Output:${NC}
  All service logs are shown in the terminal AND saved to logs/ directory
  Any errors will be immediately visible in your terminal

${YELLOW}Access URLs:${NC}
  Frontend:   http://localhost:3000
  Backend:    http://localhost:3333
  PostgreSQL: localhost:5433
  LocalStack: http://localhost:4567

${YELLOW}Environment:${NC}
  Create a .env.local file in the root for custom variables
  See .env.example for available options

${YELLOW}Cleanup:${NC}
  If services won't start due to port conflicts or lock files:
    ./cleanup.sh          - Stop all services and clean up
    ./cleanup.sh --logs   - Also remove log files

EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -m|--mode)
            MODE="$2"
            shift 2
            ;;
        -d|--docker)
            USE_DOCKER=true
            shift
            ;;
        -s|--skip-install)
            SKIP_INSTALL=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_message "❌ Unknown option: $1" "$RED"
            show_usage
            exit 1
            ;;
    esac
done

# Validate mode
if [[ ! "$MODE" =~ ^(all|frontend|backend|db)$ ]]; then
    print_message "❌ Invalid mode: $MODE" "$RED"
    print_message "   Valid modes: all, frontend, backend, db" "$YELLOW"
    exit 1
fi

print_header "🚀 Parlae Local Development Environment"
print_message "Mode: $MODE" "$CYAN"
print_message "Docker: $USE_DOCKER" "$CYAN"
echo ""

# Check prerequisites
print_header "🔍 Checking Prerequisites"

# Check for required commands
check_command() {
    if ! command -v "$1" &> /dev/null; then
        print_message "❌ $1 is not installed" "$RED"
        return 1
    else
        print_message "✅ $1 is installed" "$GREEN"
        return 0
    fi
}

MISSING_DEPS=false

if [ "$USE_DOCKER" = true ]; then
    check_command "docker" || MISSING_DEPS=true
    check_command "docker-compose" || check_command "docker" || MISSING_DEPS=true
else
    check_command "node" || MISSING_DEPS=true
    check_command "pnpm" || MISSING_DEPS=true
fi

check_command "docker" || MISSING_DEPS=true  # Always need Docker for DB

if [ "$MISSING_DEPS" = true ]; then
    print_message "❌ Missing required dependencies. Please install them first." "$RED"
    exit 1
fi

# Load environment variables (shared .env first, then overrides)
load_env_file() {
    local file="$1"
    if [ -f "$file" ]; then
        print_message "✅ Loading $file" "$GREEN"
        set -a
        # shellcheck disable=SC1090
        source "$file"
        set +a
        return 0
    fi
    return 1
}

if ! load_env_file ".env"; then
    print_message "⚠️  No .env found, using defaults" "$YELLOW"
fi

if ! load_env_file ".env.local"; then
    print_message "⚠️  No .env.local found, using defaults" "$YELLOW"
    print_message "   Create .env.local for custom configuration (see .env.example)" "$YELLOW"
fi

# Set default environment variables for local development
export NODE_ENV=${NODE_ENV:-development}
export DATABASE_URL=${DATABASE_URL:-postgresql://parlae:parlae@localhost:5433/parlae?schema=public}
export BACKEND_URL=${BACKEND_URL:-http://localhost:3333}
export BACKEND_API_URL=${BACKEND_API_URL:-http://localhost:3333}
export NEXT_PUBLIC_APP_BASE_URL=${NEXT_PUBLIC_APP_BASE_URL:-http://localhost:3000}
export NEXTAUTH_URL=${NEXTAUTH_URL:-http://localhost:3000}
export NEXTAUTH_SECRET=${NEXTAUTH_SECRET:-dev-secret-change-in-production}
export AWS_REGION=${AWS_REGION:-us-east-2}
export S3_BUCKET_NAME=${S3_BUCKET_NAME:-parlae-local-bucket}
export S3_PUBLIC_BASE_URL=${S3_PUBLIC_BASE_URL:-http://localhost:4567/parlae-local-bucket}
export NEXT_PUBLIC_S3_PUBLIC_BASE_URL=${NEXT_PUBLIC_S3_PUBLIC_BASE_URL:-http://localhost:4567/parlae-local-bucket}

# Cognito config (optional for local dev)
export COGNITO_USER_POOL_ID=${COGNITO_USER_POOL_ID:-us-east-2_PLACEHOLDER}
export COGNITO_CLIENT_ID=${COGNITO_CLIENT_ID:-placeholder-client-id}
export COGNITO_CLIENT_SECRET=${COGNITO_CLIENT_SECRET:-placeholder-client-secret}
export COGNITO_ISSUER=${COGNITO_ISSUER:-https://cognito-idp.us-east-2.amazonaws.com/us-east-2_PLACEHOLDER}
export ENABLE_CREDENTIALS_SIGNIN=${ENABLE_CREDENTIALS_SIGNIN:-true}

# Install dependencies
if [ "$SKIP_INSTALL" = false ] && [ "$USE_DOCKER" = false ]; then
    print_header "📦 Installing Dependencies"
    pnpm install
    print_message "✅ Dependencies installed" "$GREEN"
fi

# Kill process on specific port
kill_port() {
    local port=$1
    local pids=$(lsof -ti:$port 2>/dev/null)
    
    if [ -n "$pids" ]; then
        print_message "Killing process on port $port..." "$YELLOW"
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
}

# Kill processes by name pattern
kill_by_name() {
    local pattern=$1
    local pids=$(pgrep -f "$pattern" 2>/dev/null)
    
    if [ -n "$pids" ]; then
        print_message "Killing processes matching '$pattern'..." "$YELLOW"
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
}

# Pre-cleanup: Kill any existing services before starting
pre_cleanup() {
    print_header "🧹 Cleaning Up Existing Services"
    
    # Kill processes on our ports
    kill_port 3000  # Frontend
    kill_port 3001  # Frontend alternative
    kill_port 3333  # Backend (actual port)
    kill_port 4000  # Backend alternative
    kill_port 4001  # Backend alternative
    
    # Kill Next.js and NestJS processes
    kill_by_name "next dev"
    kill_by_name "nest start"
    kill_by_name "ts-node.*backend"
    kill_by_name "pnpm.*dev"
    kill_by_name "pnpm.*start:dev"
    
    # Clean up PID files
    rm -f .backend.pid .frontend.pid 2>/dev/null || true
    
    # Clean up Next.js lock files
    rm -f apps/frontend/apps/web/.next/dev/lock 2>/dev/null || true
    
    # Stop any Docker containers if they're running or exist (including old dentia- containers)
    if docker ps -a | grep -E "parlae-|dentia-" > /dev/null 2>&1; then
        print_message "Stopping existing Docker containers..." "$YELLOW"
        docker ps -a | grep -E "parlae-|dentia-" | awk '{print $1}' | xargs -r docker rm -f 2>/dev/null || true
        docker-compose down 2>/dev/null || true
    fi
    
    print_message "✅ Cleanup complete" "$GREEN"
    sleep 2
}

# Cleanup function (on exit)
cleanup() {
    print_header "🛑 Shutting Down Services"
    
    if [ "$USE_DOCKER" = true ]; then
        print_message "Stopping Docker containers..." "$YELLOW"
        docker-compose down
    else
        print_message "Stopping local services..." "$YELLOW"
        # Kill background processes
        jobs -p | xargs -r kill 2>/dev/null || true
        
        # Also kill by port/name as backup
        kill_port 3000
        kill_port 3001
        kill_port 3333
        kill_port 4000
        kill_port 4001
        kill_by_name "next dev"
        kill_by_name "nest start"
        kill_by_name "ts-node.*backend"
    fi
    
    # Clean up lock files
    rm -f apps/frontend/apps/web/.next/dev/lock 2>/dev/null || true
    
    print_message "✅ All services stopped" "$GREEN"
    exit 0
}

# Register cleanup on exit
trap cleanup SIGINT SIGTERM EXIT

# Start database services
start_database() {
    print_header "🗄️  Starting Database Services"
    
    # Check if postgres is already running
    if docker ps | grep -q parlae-postgres; then
        print_message "✅ PostgreSQL already running" "$GREEN"
    else
        print_message "Starting PostgreSQL..." "$YELLOW"
        docker-compose up -d postgres
        
        # Wait for PostgreSQL to be ready
        print_message "Waiting for PostgreSQL to be ready..." "$YELLOW"
        sleep 3
        
        # Test connection
        max_attempts=30
        attempt=0
        until docker exec parlae-postgres pg_isready -U parlae &>/dev/null || [ $attempt -eq $max_attempts ]; do
            attempt=$((attempt + 1))
            echo -n "."
            sleep 1
        done
        echo ""
        
        if [ $attempt -eq $max_attempts ]; then
            print_message "❌ PostgreSQL failed to start" "$RED"
            exit 1
        fi
        
        print_message "✅ PostgreSQL is ready" "$GREEN"
    fi
    
    # Start LocalStack if running backend
    if [[ "$MODE" == "all" || "$MODE" == "backend" ]]; then
        if docker ps | grep -q parlae-localstack; then
            print_message "✅ LocalStack already running" "$GREEN"
        else
            print_message "Starting LocalStack (S3)..." "$YELLOW"
            docker-compose up -d localstack
            sleep 2
            print_message "✅ LocalStack is ready" "$GREEN"
        fi
    fi
}

# Run database migrations
run_migrations() {
    print_header "🔄 Running Database Migrations"
    
    cd packages/prisma
    
    # Generate Prisma client
    print_message "Generating Prisma client..." "$YELLOW"
    npx prisma generate
    
    # Check migration status first
    print_message "Checking migration status..." "$YELLOW"
    MIGRATION_STATUS=$(npx prisma migrate status 2>&1 || true)
    
    if echo "$MIGRATION_STATUS" | grep -q "following migrations have not yet been applied"; then
        print_message "📦 New migrations detected, applying..." "$YELLOW"
        
        # Run migrations (they're automatically ordered by timestamp)
        if npx prisma migrate deploy; then
            print_message "✅ Migrations applied successfully!" "$GREEN"
        else
            print_message "⚠️  Migration failed, trying db push as fallback..." "$YELLOW"
            npx prisma db push
        fi
    elif echo "$MIGRATION_STATUS" | grep -q "failed to apply"; then
        print_message "❌ Failed migration detected!" "$RED"
        print_message "   Please resolve manually or run:" "$YELLOW"
        print_message "   cd packages/prisma && npx prisma migrate resolve --help" "$YELLOW"
        exit 1
    else
        print_message "✅ Database schema is up to date!" "$GREEN"
    fi
    
    cd ../..
}

# Start backend
start_backend() {
    print_header "🔧 Starting Backend (NestJS)"
    
    cd apps/backend
    
    if [ "$USE_DOCKER" = true ]; then
        docker-compose up -d backend
        print_message "✅ Backend running in Docker at http://localhost:4001" "$GREEN"
    else
        print_message "Starting backend in development mode..." "$YELLOW"
        
        # Start backend with tee to show output AND log to file
        pnpm start:dev 2>&1 | tee ../../logs/backend.log &
        BACKEND_PID=$!
        echo $BACKEND_PID > ../../.backend.pid
        
        # Wait for backend to start and check if it crashed
        sleep 5
        
        # Check if process is still running
        if kill -0 $BACKEND_PID 2>/dev/null; then
            print_message "✅ Backend running at http://localhost:3333" "$GREEN"
            print_message "   Logs visible in terminal and saved to logs/backend.log" "$CYAN"
        else
            print_message "❌ Backend failed to start! Check output above for errors." "$RED"
            exit 1
        fi
    fi
    
    cd ../..
}

# Start frontend
start_frontend() {
    print_header "🎨 Starting Frontend (Next.js)"
    
    cd apps/frontend/apps/web
    
    if [ "$USE_DOCKER" = true ]; then
        docker-compose up -d frontend
        print_message "✅ Frontend running in Docker at http://localhost:3000" "$GREEN"
    else
        print_message "Starting frontend in development mode..." "$YELLOW"
        
        # Start frontend with tee to show output AND log to file
        pnpm dev 2>&1 | tee ../../../../logs/frontend.log &
        FRONTEND_PID=$!
        echo $FRONTEND_PID > ../../../../.frontend.pid
        
        # Wait for frontend to start and check if it crashed
        sleep 5
        
        # Check if process is still running
        if kill -0 $FRONTEND_PID 2>/dev/null; then
            print_message "✅ Frontend running at http://localhost:3000" "$GREEN"
            print_message "   Logs visible in terminal and saved to logs/frontend.log" "$CYAN"
        else
            print_message "❌ Frontend failed to start! Check output above for errors." "$RED"
            exit 1
        fi
    fi
    
    cd ../../../..
}

# Create logs directory
mkdir -p logs

# Run pre-cleanup to kill existing services
pre_cleanup

# Execute based on mode
if [ "$USE_DOCKER" = true ]; then
    # Docker mode - use docker-compose
    print_header "🐳 Starting Services in Docker"
    
    case $MODE in
        all)
            docker-compose up -d
            ;;
        frontend)
            docker-compose up -d postgres frontend
            ;;
        backend)
            docker-compose up -d postgres localstack backend
            ;;
        db)
            docker-compose up -d postgres
            ;;
    esac
    
    print_header "✅ Docker Services Started"
    print_message "View logs: docker-compose logs -f" "$CYAN"
    print_message "Stop services: docker-compose down" "$CYAN"
    
else
    # Native mode
    case $MODE in
        all)
            start_database
            run_migrations
            start_backend
            start_frontend
            ;;
        frontend)
            start_database
            run_migrations
            start_frontend
            print_message "⚠️  Make sure backend is running separately or accessible" "$YELLOW"
            ;;
        backend)
            start_database
            run_migrations
            start_backend
            ;;
        db)
            start_database
            run_migrations
            ;;
    esac
fi

# Print status
print_header "✅ Development Environment Ready!"

echo ""
print_message "📍 Service URLs:" "$CYAN"
echo ""

case $MODE in
    all)
        print_message "  Frontend:    http://localhost:3000" "$GREEN"
        print_message "  Backend:     http://localhost:3333" "$GREEN"
        print_message "  Backend API: http://localhost:3333/api" "$GREEN"
        print_message "  PostgreSQL:  localhost:5433" "$GREEN"
        print_message "  LocalStack:  http://localhost:4567" "$GREEN"
        ;;
    frontend)
        print_message "  Frontend:    http://localhost:3000" "$GREEN"
        print_message "  PostgreSQL:  localhost:5433" "$GREEN"
        ;;
    backend)
        print_message "  Backend:     http://localhost:3333" "$GREEN"
        print_message "  Backend API: http://localhost:3333/api" "$GREEN"
        print_message "  PostgreSQL:  localhost:5433" "$GREEN"
        print_message "  LocalStack:  http://localhost:4567" "$GREEN"
        ;;
    db)
        print_message "  PostgreSQL:  localhost:5433" "$GREEN"
        ;;
esac

echo ""
print_message "📚 Useful Commands:" "$CYAN"
echo ""

if [ "$USE_DOCKER" = true ]; then
    print_message "  View logs:        docker-compose logs -f" "$YELLOW"
    print_message "  View service:     docker-compose logs -f [service]" "$YELLOW"
    print_message "  Restart:          docker-compose restart [service]" "$YELLOW"
    print_message "  Stop all:         docker-compose down" "$YELLOW"
else
    print_message "  🎯 All logs shown in terminal below" "$GREEN"
    print_message "  Also saved to:    logs/backend.log & logs/frontend.log" "$YELLOW"
    print_message "  Database client:  psql postgresql://parlae:parlae@localhost:5433/parlae" "$YELLOW"
    print_message "  Prisma Studio:    cd packages/prisma && npx prisma studio" "$YELLOW"
fi

echo ""
print_message "  Stop all:         Ctrl+C" "$YELLOW"
echo ""

# In Docker mode, follow logs
if [ "$USE_DOCKER" = true ]; then
    print_message "📋 Following Docker logs (Ctrl+C to stop)..." "$CYAN"
    echo ""
    docker-compose logs -f
else
    # In native mode, wait for Ctrl+C
    print_message "✨ Press Ctrl+C to stop all services" "$CYAN"
    echo ""
    print_message "📋 All output is shown below and saved to logs/" "$CYAN"
    echo ""
    
    # Keep script running (logs are already being shown via tee)
    wait
fi
