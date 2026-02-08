#!/bin/bash

# Script to prepare the environment for E2E testing

set -e

echo "🔧 Preparing Environment for E2E Testing"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: Please run this script from the project root"
  exit 1
fi

echo "📦 Step 1: Installing dependencies..."
pnpm install

echo ""
echo "🗄️  Step 2: Generating Prisma client..."
cd packages/prisma
pnpm prisma generate

echo ""
echo "🔄 Step 3: Running database migrations..."
pnpm prisma migrate deploy

echo ""
echo "🌱 Step 4: Seeding database with roles and permissions..."
pnpm prisma db seed

echo ""
echo "✅ Environment prepared successfully!"
echo ""
echo "📋 Next Steps:"
echo "  1. Start the frontend: cd apps/frontend && pnpm dev"
echo "  2. Open http://localhost:3000"
echo "  3. Follow the E2E_TESTING_GUIDE.md for test scenarios"
echo ""
echo "📚 Testing Resources:"
echo "  - E2E_TESTING_GUIDE.md - Complete testing scenarios"
echo "  - STEP_5_COMPLETE.md - Implementation details"
echo "  - NEW_ARCHITECTURE_PROPOSAL.md - System architecture"
echo ""

