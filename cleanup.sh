#!/bin/bash

# Cleanup script for Parlae Local Development
# Stops all running services and cleans up lock files

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_message() {
    echo -e "${2}${1}${NC}"
}

print_header() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}${1}${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Parse arguments
REMOVE_LOGS=false
if [[ "$1" == "--logs" ]]; then
    REMOVE_LOGS=true
fi

print_header "🧹 Cleaning Up Development Environment"

# Kill processes on specific ports
print_message "Killing processes on ports 3000, 3333, 4000, 4001..." "$YELLOW"
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:3333 | xargs kill -9 2>/dev/null || true
lsof -ti:4000 | xargs kill -9 2>/dev/null || true
lsof -ti:4001 | xargs kill -9 2>/dev/null || true
sleep 1

# Kill Node.js development processes
print_message "Killing Next.js and backend processes..." "$YELLOW"
pkill -f "next dev" 2>/dev/null || true
pkill -f "nest start" 2>/dev/null || true
pkill -f "ts-node.*backend" 2>/dev/null || true
pkill -f "pnpm.*dev" 2>/dev/null || true
pkill -f "pnpm.*start:dev" 2>/dev/null || true
sleep 1

# Clean up PID files
print_message "Removing PID files..." "$YELLOW"
rm -f .backend.pid .frontend.pid 2>/dev/null || true

# Clean up Next.js lock files
print_message "Removing Next.js lock files..." "$YELLOW"
rm -f apps/frontend/apps/web/.next/dev/lock 2>/dev/null || true

# Clean up temporary .env files
print_message "Removing temporary .env files..." "$YELLOW"
rm -f apps/backend/.env 2>/dev/null || true

# Stop Docker containers (check both running and stopped containers, including old dentia- containers)
if docker ps -a | grep -E "parlae-|dentia-" > /dev/null; then
    print_message "Stopping and removing Docker containers..." "$YELLOW"
    
    # Force remove all parlae and dentia containers
    docker ps -a | grep -E "parlae-|dentia-" | awk '{print $1}' | xargs -r docker rm -f 2>/dev/null || true
    
    # Also try docker-compose down
    docker-compose down 2>/dev/null || true
    
    print_message "✅ Docker containers stopped and removed" "$GREEN"
else
    print_message "✅ No Docker containers to stop" "$GREEN"
fi

# Remove logs if requested
if [ "$REMOVE_LOGS" = true ]; then
    print_message "Removing log files..." "$YELLOW"
    rm -rf logs/*.log 2>/dev/null || true
    print_message "✅ Log files removed" "$GREEN"
fi

print_header "✅ Cleanup Complete!"

echo ""
print_message "All processes stopped and ports freed:" "$GREEN"
print_message "  ✅ Port 3000 (Frontend)" "$GREEN"
print_message "  ✅ Port 3333 (Backend)" "$GREEN"
print_message "  ✅ Port 4000 (Backend alt)" "$GREEN"
print_message "  ✅ Port 4001 (Backend alt)" "$GREEN"
echo ""
print_message "You can now run ./dev.sh to start fresh!" "$CYAN"
echo ""
