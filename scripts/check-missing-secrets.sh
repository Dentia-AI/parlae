#!/bin/bash
# Script to check missing secrets in SSM Parameter Store

echo "🔍 Checking for missing secrets..."
echo ""

# Frontend secrets that should exist
FRONTEND_SECRETS=(
  "NEXTAUTH_URL"
  "NEXTAUTH_SECRET"
  "COGNITO_CLIENT_ID"
  "COGNITO_CLIENT_SECRET"
  "COGNITO_ISSUER"
  "COGNITO_DOMAIN"
  "DATABASE_URL"
  "BACKEND_API_URL"
  "DISCOURSE_SSO_SECRET"
  "GHL_API_KEY"
  "GHL_LOCATION_ID"
  "NEXT_PUBLIC_GHL_WIDGET_ID"
  "NEXT_PUBLIC_GHL_LOCATION_ID"
  "NEXT_PUBLIC_GHL_CALENDAR_ID"
  "GOOGLE_CLIENT_ID"
  "GOOGLE_CLIENT_SECRET"
  "VAPI_API_KEY"
  "NEXT_PUBLIC_VAPI_PUBLIC_KEY"
  "VAPI_SERVER_SECRET"
  "ELEVENLABS_API_KEY"
  "OPENAI_API_KEY"
  "TWILIO_ACCOUNT_SID"
  "TWILIO_AUTH_TOKEN"
  "ADMIN_USER_IDS"
)

# Backend secrets that should exist
BACKEND_SECRETS=(
  "DATABASE_URL"
  "SIKKA_APP_ID"
  "SIKKA_APP_KEY"
  "VAPI_API_KEY"
  "VAPI_WEBHOOK_SECRET"
  "TWILIO_ACCOUNT_SID"
  "TWILIO_AUTH_TOKEN"
  "TWILIO_MESSAGING_SERVICE_SID"
  "APP_BASE_URL"
)

# Shared secrets that should exist
SHARED_SECRETS=(
  "AWS_REGION"
  "S3_BUCKET"
  "COGNITO_USER_POOL_ID"
  "COGNITO_CLIENT_ID"
  "COGNITO_ISSUER"
  "STRIPE_SECRET_KEY"
  "STRIPE_WEBHOOK_SECRET"
  "STRIPE_PUBLISHABLE_KEY"
)

MISSING_FRONTEND=()
MISSING_BACKEND=()
MISSING_SHARED=()

echo "Checking FRONTEND secrets..."
for secret in "${FRONTEND_SECRETS[@]}"; do
  if ! aws ssm get-parameter --name "/parlae/frontend/$secret" --region us-east-2 --profile parlae &>/dev/null; then
    MISSING_FRONTEND+=("$secret")
    echo "  ❌ Missing: /parlae/frontend/$secret"
  else
    echo "  ✅ Found: /parlae/frontend/$secret"
  fi
done

echo ""
echo "Checking BACKEND secrets..."
for secret in "${BACKEND_SECRETS[@]}"; do
  if ! aws ssm get-parameter --name "/parlae/backend/$secret" --region us-east-2 --profile parlae &>/dev/null; then
    MISSING_BACKEND+=("$secret")
    echo "  ❌ Missing: /parlae/backend/$secret"
  else
    echo "  ✅ Found: /parlae/backend/$secret"
  fi
done

echo ""
echo "Checking SHARED secrets..."
for secret in "${SHARED_SECRETS[@]}"; do
  if ! aws ssm get-parameter --name "/parlae/shared/$secret" --region us-east-2 --profile parlae &>/dev/null; then
    MISSING_SHARED+=("$secret")
    echo "  ❌ Missing: /parlae/shared/$secret"
  else
    echo "  ✅ Found: /parlae/shared/$secret"
  fi
done

echo ""
echo "======================================"
echo "SUMMARY"
echo "======================================"

if [ ${#MISSING_FRONTEND[@]} -eq 0 ] && [ ${#MISSING_BACKEND[@]} -eq 0 ] && [ ${#MISSING_SHARED[@]} -eq 0 ]; then
  echo "✅ All secrets are present!"
else
  echo "Missing secrets found:"
  
  if [ ${#MISSING_FRONTEND[@]} -gt 0 ]; then
    echo ""
    echo "Frontend (${#MISSING_FRONTEND[@]} missing):"
    for secret in "${MISSING_FRONTEND[@]}"; do
      echo "  - /parlae/frontend/$secret"
    done
  fi
  
  if [ ${#MISSING_BACKEND[@]} -gt 0 ]; then
    echo ""
    echo "Backend (${#MISSING_BACKEND[@]} missing):"
    for secret in "${MISSING_BACKEND[@]}"; do
      echo "  - /parlae/backend/$secret"
    done
  fi
  
  if [ ${#MISSING_SHARED[@]} -gt 0 ]; then
    echo ""
    echo "Shared (${#MISSING_SHARED[@]} missing):"
    for secret in "${MISSING_SHARED[@]}"; do
      echo "  - /parlae/shared/$secret"
    done
  fi
fi
