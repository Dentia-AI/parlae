#!/usr/bin/env bash
set -euo pipefail

# Build and push Docker images to ECR
# Usage: ./scripts/build-and-push-ecr.sh [service] [environment]
#   service: frontend | backend | both (default: both)
#   environment: prod | dev (default: prod)

SERVICE=${1:-both}
ENV=${2:-prod}

# AWS Configuration
AWS_PROFILE="parlae"
AWS_REGION="us-east-2"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text)

if [ "$ENV" = "prod" ]; then
  FRONTEND_PARAM_PREFIX="/dentia/frontend"
else
  FRONTEND_PARAM_PREFIX="/dentia/${ENV}/frontend"
fi

# ECR Repository URLs
# Note: Production repos don't have "-prod" suffix, dev repos have "-dev" suffix
if [ "$ENV" = "prod" ]; then
  ECR_FRONTEND="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/parlae-frontend"
  ECR_BACKEND="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/parlae-backend"
else
  ECR_FRONTEND="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/parlae-${ENV}-frontend"
  ECR_BACKEND="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/parlae-${ENV}-backend"
fi

# Stripe keys (used as build args)
if [ "$ENV" = "prod" ]; then
  STRIPE_KEY="pk_live_51Sukx4Lkem7BYPMmI3EWAbEvinE3LcbAC7kbNBC9FA7mPC9IIRbhfB6pqs99MjppG4sOFNY7wIHc4x0Ptekynfqb006tkLQJk1"
  echo "🎯 Building for PRODUCTION"
else
  STRIPE_KEY="pk_test_51Sukx9LqqFNt4hxPjQN4uw77nAby3eqTxmbGDHPSTrGPcpp9V2NyH8AIGYnVKZpnScmpU5ikoDEASgNFjPNoqfx800HwK62RgB"
  echo "🎯 Building for DEV"
fi

get_parameter() {
  local name="$1"
  local with_decryption="${2:-false}"
  local value
  if [ "$with_decryption" = "true" ]; then
    if ! value=$(
      aws ssm get-parameter \
        --name "$name" \
        --with-decryption \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --query "Parameter.Value" \
        --output text
    ); then
      return 1
    fi
  else
    if ! value=$(
      aws ssm get-parameter \
        --name "$name" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --query "Parameter.Value" \
        --output text
    ); then
      return 1
    fi
  fi

  printf '%s' "$value"
}

resolve_public_env() {
  local var_name="$1"
  local param_suffix="$2"
  local current_value="${!var_name:-}"

  if [ -n "$current_value" ]; then
    printf '%s' "$current_value"
    return 0
  fi

  local path="${FRONTEND_PARAM_PREFIX}/${param_suffix}"
  local fetched
  if ! fetched=$(get_parameter "$path"); then
    echo "❌ Missing $var_name. Set the env var or create SSM parameter $path" >&2
    return 1
  fi

  printf '%s' "$fetched"
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Build & Push to ECR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Service: $SERVICE"
echo "Environment: $ENV"
echo "AWS Account: $AWS_ACCOUNT_ID"
echo "Region: $AWS_REGION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Login to ECR
echo "🔐 Logging into ECR..."
aws ecr get-login-password --region "$AWS_REGION" --profile "$AWS_PROFILE" | \
  docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
echo ""

build_and_push_frontend() {
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🏗️  Building Frontend..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local ghl_widget_id
  local ghl_location_id
  local ghl_calendar_id

  if ! ghl_widget_id=$(resolve_public_env "NEXT_PUBLIC_GHL_WIDGET_ID" "NEXT_PUBLIC_GHL_WIDGET_ID"); then
    exit 1
  fi
  if ! ghl_location_id=$(resolve_public_env "NEXT_PUBLIC_GHL_LOCATION_ID" "NEXT_PUBLIC_GHL_LOCATION_ID"); then
    exit 1
  fi
  if ! ghl_calendar_id=$(resolve_public_env "NEXT_PUBLIC_GHL_CALENDAR_ID" "NEXT_PUBLIC_GHL_CALENDAR_ID"); then
    exit 1
  fi
  
  # Site URL changes based on environment
  if [ "$ENV" = "prod" ]; then
    SITE_URL="https://www.parlae.ca"
  else
    SITE_URL="https://dev.parlae.ca"
  fi
  
  # Get git commit hash and build timestamp
  GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
  BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  echo "📋 Build Info:"
  echo "   Git Commit: ${GIT_COMMIT:0:8}"
  echo "   Build Time: $BUILD_TIME"
  echo ""
  
  docker build \
    --platform linux/amd64 \
    --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="$STRIPE_KEY" \
    --build-arg NEXT_PUBLIC_SITE_URL="$SITE_URL" \
    --build-arg NEXT_PUBLIC_GHL_WIDGET_ID="$ghl_widget_id" \
    --build-arg NEXT_PUBLIC_GHL_LOCATION_ID="$ghl_location_id" \
    --build-arg NEXT_PUBLIC_GHL_CALENDAR_ID="$ghl_calendar_id" \
    --build-arg GIT_COMMIT_SHA="$GIT_COMMIT" \
    --build-arg BUILD_TIMESTAMP="$BUILD_TIME" \
    -t "${ECR_FRONTEND}:latest" \
    -f infra/docker/frontend.Dockerfile \
    .
  
  echo ""
  echo "📤 Pushing Frontend to ECR..."
  docker push "${ECR_FRONTEND}:latest"
  echo "✅ Frontend pushed successfully!"
  echo ""
}

build_and_push_backend() {
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🏗️  Building Backend..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  docker build \
    --platform linux/amd64 \
    -t "${ECR_BACKEND}:latest" \
    -f infra/docker/backend.Dockerfile \
    .
  
  echo ""
  echo "📤 Pushing Backend to ECR..."
  docker push "${ECR_BACKEND}:latest"
  echo "✅ Backend pushed successfully!"
  echo ""
}

# Build and push based on service parameter
case "$SERVICE" in
  frontend)
    build_and_push_frontend
    ;;
  backend)
    build_and_push_backend
    ;;
  both)
    build_and_push_frontend
    build_and_push_backend
    ;;
  *)
    echo "❌ Invalid service: $SERVICE" >&2
    echo "Usage: $0 [frontend|backend|both] [prod|dev]" >&2
    exit 1
    ;;
esac

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All Done!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Next steps:"
echo "  1. Force ECS service update:"
if [ "$ENV" = "prod" ]; then
  CLUSTER_NAME="parlae-cluster"
  if [ "$SERVICE" = "frontend" ] || [ "$SERVICE" = "both" ]; then
    echo "     # Frontend:"
    echo "     aws ecs update-service \\"
    echo "       --cluster ${CLUSTER_NAME} \\"
    echo "       --service parlae-frontend \\"
    echo "       --force-new-deployment \\"
    echo "       --profile ${AWS_PROFILE} \\"
    echo "       --region ${AWS_REGION}"
    echo ""
  fi
  if [ "$SERVICE" = "backend" ] || [ "$SERVICE" = "both" ]; then
    echo "     # Backend:"
    echo "     aws ecs update-service \\"
    echo "       --cluster ${CLUSTER_NAME} \\"
    echo "       --service parlae-backend \\"
    echo "       --force-new-deployment \\"
    echo "       --profile ${AWS_PROFILE} \\"
    echo "       --region ${AWS_REGION}"
  fi
else
  echo "     aws ecs update-service \\"
  echo "       --cluster parlae-${ENV} \\"
  echo "       --service parlae-${ENV}-${SERVICE} \\"
  echo "       --force-new-deployment \\"
  echo "       --profile ${AWS_PROFILE} \\"
  echo "       --region ${AWS_REGION}"
fi
echo ""
echo "  2. Watch deployment:"
if [ "$ENV" = "prod" ]; then
  echo "     aws ecs describe-services \\"
  echo "       --cluster ${CLUSTER_NAME} \\"
  echo "       --services parlae-frontend parlae-backend \\"
  echo "       --profile ${AWS_PROFILE} \\"
  echo "       --region ${AWS_REGION}"
else
  echo "     aws ecs describe-services \\"
  echo "       --cluster parlae-${ENV} \\"
  echo "       --services parlae-${ENV}-${SERVICE} \\"
  echo "       --profile ${AWS_PROFILE} \\"
  echo "       --region ${AWS_REGION}"
fi
echo ""
