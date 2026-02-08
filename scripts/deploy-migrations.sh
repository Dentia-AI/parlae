#!/bin/bash

set -e

echo "============================================"
echo "🗄️  Database Migration Deployment"
echo "============================================"
echo ""

# Default values
PROFILE="${AWS_PROFILE:-dentia}"
REGION="${AWS_REGION:-us-east-2}"
ENV="${ENVIRONMENT:-prod}"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENV="$2"
      shift 2
      ;;
    --profile)
      PROFILE="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --env ENV         Environment (prod or dev, default: prod)"
      echo "  --profile PROFILE AWS profile to use (default: dentia)"
      echo "  --region REGION   AWS region (default: us-east-2)"
      echo "  --help           Show this help message"
      echo ""
      echo "Environment Variables:"
      echo "  DATABASE_URL      Direct database URL (skips SSM lookup)"
      echo "  AWS_PROFILE       AWS profile (alternative to --profile)"
      echo "  AWS_REGION        AWS region (alternative to --region)"
      echo "  ENVIRONMENT       Environment (alternative to --env)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Run with --help for usage information"
      exit 1
      ;;
  esac
done

echo "Environment: $ENV"
echo "AWS Profile: $PROFILE"
echo "AWS Region: $REGION"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: Must run from project root"
  exit 1
fi

# Check if Prisma schema exists
if [ ! -f "packages/prisma/schema.prisma" ]; then
  echo "❌ Error: Prisma schema not found at packages/prisma/schema.prisma"
  exit 1
fi

# Check for pending migrations
if [ ! -d "packages/prisma/migrations" ] || [ -z "$(ls -A packages/prisma/migrations)" ]; then
  echo "⚠️  No migrations found in packages/prisma/migrations"
  echo "Nothing to deploy."
  exit 0
fi

echo "📋 Found migrations:"
ls -1 packages/prisma/migrations | grep -v "migration_lock.toml" || true
echo ""

# Get DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  echo "🔍 Fetching DATABASE_URL from AWS SSM..."
  
  # Check if AWS CLI is available
  if ! command -v aws &> /dev/null; then
    echo "❌ Error: AWS CLI not found. Please install it or set DATABASE_URL manually."
    exit 1
  fi
  
  # Determine SSM parameter path based on environment
  # Try both backend and frontend paths as they should have the same DB URL
  if [ "$ENV" = "dev" ]; then
    SSM_PATHS=(
      "/dentia/dev/backend/DATABASE_URL"
      "/dentia/dev/frontend/DATABASE_URL"
    )
  else
    SSM_PATHS=(
      "/dentia/backend/DATABASE_URL"
      "/dentia/frontend/DATABASE_URL"
    )
  fi
  
  # Try each path until we find one that works
  DATABASE_URL=""
  for SSM_PATH in "${SSM_PATHS[@]}"; do
    DATABASE_URL=$(aws ssm get-parameter --name "$SSM_PATH" --with-decryption --query "Parameter.Value" --output text --profile "$PROFILE" --region "$REGION" 2>/dev/null || echo "")
    if [ -n "$DATABASE_URL" ]; then
      echo "✅ DATABASE_URL fetched from SSM: $SSM_PATH"
      break
    fi
  done
  
  if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: Failed to fetch DATABASE_URL from SSM"
    echo "   Tried paths:"
    for SSM_PATH in "${SSM_PATHS[@]}"; do
      echo "   - $SSM_PATH"
    done
    echo ""
    echo "   Please ensure DATABASE_URL exists in SSM or set it manually:"
    echo "   export DATABASE_URL='postgresql://user:password@host:port/dbname'"
    exit 1
  fi
else
  echo "✅ Using DATABASE_URL from environment"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Deploying Migrations"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Export DATABASE_URL for Prisma
export DATABASE_URL

# Navigate to Prisma directory
cd packages/prisma

# Run migration deployment
# Note: `prisma migrate deploy` is idempotent - it only applies migrations that haven't been applied yet
echo "Running: npx prisma migrate deploy"
echo ""

if npx prisma migrate deploy; then
  echo ""
  echo "✅ Migrations deployed successfully!"
  echo ""
  echo "📊 Current migration status:"
  npx prisma migrate status || true
else
  echo ""
  echo "❌ Migration deployment failed!"
  exit 1
fi

cd ../..

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Migration Deployment Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "ℹ️  Note: Prisma's 'migrate deploy' is idempotent."
echo "   Only new migrations are applied. Already-applied migrations are skipped."
echo ""

