#!/bin/bash
#
# Build Frontend Docker Image with Stripe Configuration
#
# Usage:
#   ./scripts/build-frontend-docker.sh dev    # Build with test keys
#   ./scripts/build-frontend-docker.sh prod   # Build with live keys
#
# SECURITY NOTE:
#   Stripe keys must be set via environment variables or fetched from AWS SSM
#   This script no longer contains hardcoded credentials
#
# Required Environment Variables:
#   STRIPE_PUBLISHABLE_KEY_PROD - Live Stripe publishable key (for prod builds)
#   STRIPE_PUBLISHABLE_KEY_TEST - Test Stripe publishable key (for dev builds)
#

set -e

ENVIRONMENT="${1:-dev}"
PROFILE="${AWS_PROFILE:-dentia}"
REGION="${AWS_REGION:-us-east-2}"

if [ "$ENVIRONMENT" = "prod" ]; then
  FRONTEND_PARAM_PREFIX="/dentia/frontend"
else
  FRONTEND_PARAM_PREFIX="/dentia/${ENVIRONMENT}/frontend"
fi

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Building frontend Docker image for: ${ENVIRONMENT}${NC}"

# Get Stripe keys based on environment
if [ "$ENVIRONMENT" = "prod" ]; then
  echo -e "${YELLOW}Using PRODUCTION (LIVE) Stripe keys${NC}"
  
  # Try environment variable first
  if [ -n "$STRIPE_PUBLISHABLE_KEY_PROD" ]; then
    STRIPE_KEY="$STRIPE_PUBLISHABLE_KEY_PROD"
    echo "✅ Using STRIPE_PUBLISHABLE_KEY_PROD from environment"
  else
    # Fetch from AWS SSM
    echo "🔍 Fetching STRIPE_PUBLISHABLE_KEY from AWS SSM..."
    STRIPE_KEY=$(aws ssm get-parameter \
      --name "/dentia/shared/STRIPE_PUBLISHABLE_KEY" \
      --with-decryption \
      --query "Parameter.Value" \
      --output text \
      --profile "$PROFILE" \
      --region "$REGION" 2>&1)
    
    if [ $? -ne 0 ]; then
      echo -e "${RED}❌ Failed to fetch Stripe key from SSM${NC}"
      echo "Error: $STRIPE_KEY"
      echo ""
      echo "Please either:"
      echo "  1. Set STRIPE_PUBLISHABLE_KEY_PROD environment variable"
      echo "  2. Ensure AWS CLI is configured with 'dentia' profile"
      echo "  3. Check /dentia/shared/STRIPE_PUBLISHABLE_KEY exists in SSM"
      exit 1
    fi
    echo "✅ Fetched from AWS SSM"
  fi
  
  IMAGE_TAG="frontend:prod-$(date +%Y%m%d%H%M%S)"
  
elif [ "$ENVIRONMENT" = "dev" ]; then
  echo -e "${GREEN}Using TEST Stripe keys${NC}"
  
  # Try environment variable first
  if [ -n "$STRIPE_PUBLISHABLE_KEY_TEST" ]; then
    STRIPE_KEY="$STRIPE_PUBLISHABLE_KEY_TEST"
    echo "✅ Using STRIPE_PUBLISHABLE_KEY_TEST from environment"
  else
    # Fetch from AWS SSM (dev environment)
    echo "🔍 Fetching TEST Stripe key from AWS SSM..."
    STRIPE_KEY=$(aws ssm get-parameter \
      --name "/dentia/dev/shared/STRIPE_PUBLISHABLE_KEY" \
      --with-decryption \
      --query "Parameter.Value" \
      --output text \
      --profile "$PROFILE" \
      --region "$REGION" 2>&1)
    
    if [ $? -ne 0 ]; then
      echo -e "${YELLOW}⚠️  Could not fetch from SSM, trying production path...${NC}"
      # Fallback to shared path
      STRIPE_KEY=$(aws ssm get-parameter \
        --name "/dentia/shared/STRIPE_PUBLISHABLE_KEY" \
        --with-decryption \
        --query "Parameter.Value" \
        --output text \
        --profile "$PROFILE" \
        --region "$REGION" 2>&1)
      
      if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to fetch Stripe key from SSM${NC}"
        echo ""
        echo "Please either:"
        echo "  1. Set STRIPE_PUBLISHABLE_KEY_TEST environment variable"
        echo "  2. Run setup: cd ../dentia-infra && ./infra/scripts/put-ssm-secrets-dev.sh"
        exit 1
      fi
    fi
    echo "✅ Fetched from AWS SSM"
  fi
  
  IMAGE_TAG="frontend:dev-$(date +%Y%m%d%H%M%S)"
  
else
  echo -e "${RED}Error: Invalid environment. Use 'dev' or 'prod'${NC}"
  exit 1
fi

fetch_public_value() {
  local env_var="$1"
  local param_suffix="$2"
  local human_name="$3"
  local current_value="${!env_var:-}"

  if [ -n "$current_value" ]; then
    echo -e "${GREEN}✅ Using ${env_var} from environment${NC}"
    printf '%s' "$current_value"
    return 0
  fi

  local path="${FRONTEND_PARAM_PREFIX}/${param_suffix}"
  echo -e "${YELLOW}🔍 Fetching ${human_name} from AWS SSM (${path})${NC}"
  local fetched
  if ! fetched=$(
    aws ssm get-parameter \
      --name "$path" \
      --profile "$PROFILE" \
      --region "$REGION" \
      --query "Parameter.Value" \
      --output text
  ); then
    echo -e "${RED}❌ Failed to fetch ${human_name}. Set ${env_var} or ensure ${path} exists${NC}"
    exit 1
  fi

  printf '%s' "$fetched"
}

GHL_WIDGET_ID=$(fetch_public_value "NEXT_PUBLIC_GHL_WIDGET_ID" "NEXT_PUBLIC_GHL_WIDGET_ID" "GHL widget ID")
GHL_LOCATION_ID=$(fetch_public_value "NEXT_PUBLIC_GHL_LOCATION_ID" "NEXT_PUBLIC_GHL_LOCATION_ID" "GHL location ID")
GHL_CALENDAR_ID=$(fetch_public_value "NEXT_PUBLIC_GHL_CALENDAR_ID" "NEXT_PUBLIC_GHL_CALENDAR_ID" "GHL calendar ID")

echo "Building Docker image: $IMAGE_TAG"
echo "Stripe key: ${STRIPE_KEY:0:20}..."

# Get build metadata
GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "Build Info:"
echo "  Git Commit: ${GIT_COMMIT:0:8}"
echo "  Build Time: $BUILD_TIME"
echo ""

# Build the image
docker build \
  --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="$STRIPE_KEY" \
  --build-arg NEXT_PUBLIC_GHL_WIDGET_ID="$GHL_WIDGET_ID" \
  --build-arg NEXT_PUBLIC_GHL_LOCATION_ID="$GHL_LOCATION_ID" \
  --build-arg NEXT_PUBLIC_GHL_CALENDAR_ID="$GHL_CALENDAR_ID" \
  --build-arg GIT_COMMIT_SHA="$GIT_COMMIT" \
  --build-arg BUILD_TIMESTAMP="$BUILD_TIME" \
  -f infra/docker/frontend.Dockerfile \
  -t "$IMAGE_TAG" \
  -t "frontend:$ENVIRONMENT-latest" \
  .

echo -e "${GREEN}✓ Build complete!${NC}"
echo "Image tags:"
echo "  - $IMAGE_TAG"
echo "  - frontend:$ENVIRONMENT-latest"
echo ""
echo "To push to ECR:"
echo "  aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin <account-id>.dkr.ecr.$REGION.amazonaws.com"
echo "  docker tag $IMAGE_TAG <account-id>.dkr.ecr.$REGION.amazonaws.com/dentia-frontend:$ENVIRONMENT-latest"
echo "  docker push <account-id>.dkr.ecr.$REGION.amazonaws.com/dentia-frontend:$ENVIRONMENT-latest"
echo ""
echo "💡 Tip: Set STRIPE_PUBLISHABLE_KEY_PROD or STRIPE_PUBLISHABLE_KEY_TEST"
echo "   to avoid SSM lookups on subsequent builds"
