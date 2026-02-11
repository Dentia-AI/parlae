#!/bin/bash
# Setup GitHub Secrets from AWS SSM Parameter Store
# This script pulls Cognito credentials from AWS SSM and sets them as GitHub secrets

set -e

echo "🔐 Setting up GitHub Secrets for Parlae..."
echo ""

# Check prerequisites
if ! command -v gh &> /dev/null; then
    echo "❌ Error: GitHub CLI (gh) is not installed"
    echo "Install with: brew install gh"
    exit 1
fi

if ! command -v aws &> /dev/null; then
    echo "❌ Error: AWS CLI is not installed"
    echo "Install with: brew install awscli"
    exit 1
fi

# Check if logged into GitHub CLI
if ! gh auth status &> /dev/null; then
    echo "❌ Error: Not logged into GitHub CLI"
    echo "Run: gh auth login"
    exit 1
fi

# Get values from AWS SSM Parameter Store
echo "📦 Fetching Cognito values from AWS SSM Parameter Store..."
REGION="us-east-2"  # Parlae uses us-east-2

CLIENT_ID=$(aws ssm get-parameter --name "/parlae/frontend/COGNITO_CLIENT_ID" --profile parlae --region $REGION --with-decryption --query 'Parameter.Value' --output text 2>/dev/null)
CLIENT_SECRET=$(aws ssm get-parameter --name "/parlae/frontend/COGNITO_CLIENT_SECRET" --profile parlae --region $REGION --with-decryption --query 'Parameter.Value' --output text 2>/dev/null)
COGNITO_ISSUER=$(aws ssm get-parameter --name "/parlae/frontend/COGNITO_ISSUER" --profile parlae --region $REGION --query 'Parameter.Value' --output text 2>/dev/null)
NEXTAUTH_SECRET_SSM=$(aws ssm get-parameter --name "/parlae/frontend/NEXTAUTH_SECRET" --profile parlae --region $REGION --with-decryption --query 'Parameter.Value' --output text 2>/dev/null)

if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ] || [ -z "$COGNITO_ISSUER" ]; then
    echo "❌ Error: Could not fetch Cognito values from AWS SSM"
    echo "Make sure:"
    echo "  1. AWS CLI is configured with 'parlae' profile"
    echo "  2. Region is set to us-east-2"
    echo "  3. You have permission to read SSM parameters"
    exit 1
fi

USER_POOL_ID=$(echo "$COGNITO_ISSUER" | awk -F'/' '{print $NF}')

echo "✅ Got values from AWS SSM:"
echo "  Client ID: ${CLIENT_ID:0:20}..."
echo "  Client Secret: ${CLIENT_SECRET:0:10}..."
echo "  User Pool ID: $USER_POOL_ID"
echo "  Issuer: $COGNITO_ISSUER"
echo ""

# Use NEXTAUTH_SECRET from SSM or keep existing GitHub secret
cd /Users/shaunk/Projects/Parlae-AI/parlae

if gh secret list | grep -q "NEXTAUTH_SECRET"; then
    if [ -n "$NEXTAUTH_SECRET_SSM" ]; then
        echo "✅ NEXTAUTH_SECRET exists in both GitHub and SSM"
        echo "  Will update GitHub to match SSM value"
        NEXTAUTH_SECRET="$NEXTAUTH_SECRET_SSM"
        UPDATE_NEXTAUTH=true
    else
        echo "✅ NEXTAUTH_SECRET already exists in GitHub"
        echo "  Keeping existing GitHub secret (SSM value not found)"
        NEXTAUTH_SECRET=""
        UPDATE_NEXTAUTH=false
    fi
else
    if [ -n "$NEXTAUTH_SECRET_SSM" ]; then
        echo "🔑 Using NEXTAUTH_SECRET from SSM..."
        NEXTAUTH_SECRET="$NEXTAUTH_SECRET_SSM"
        UPDATE_NEXTAUTH=true
    else
        echo "🔑 Generating new NEXTAUTH_SECRET..."
        NEXTAUTH_SECRET=$(openssl rand -base64 32)
        UPDATE_NEXTAUTH=true
    fi
    echo "  Value: ${NEXTAUTH_SECRET:0:10}..."
fi

# Confirm before setting secrets
echo ""
echo "🚀 Ready to set the following GitHub secrets:"
echo "  - COGNITO_CLIENT_ID"
echo "  - COGNITO_CLIENT_SECRET"
echo "  - COGNITO_ISSUER"
if [ "$UPDATE_NEXTAUTH" = true ]; then
    echo "  - NEXTAUTH_SECRET"
fi
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborted"
    exit 1
fi

# Set secrets
echo "📝 Setting GitHub secrets..."

echo "$CLIENT_ID" | gh secret set COGNITO_CLIENT_ID
echo "  ✅ COGNITO_CLIENT_ID"

echo "$CLIENT_SECRET" | gh secret set COGNITO_CLIENT_SECRET
echo "  ✅ COGNITO_CLIENT_SECRET"

echo "$COGNITO_ISSUER" | gh secret set COGNITO_ISSUER
echo "  ✅ COGNITO_ISSUER"

if [ "$UPDATE_NEXTAUTH" = true ] && [ -n "$NEXTAUTH_SECRET" ]; then
    echo "$NEXTAUTH_SECRET" | gh secret set NEXTAUTH_SECRET
    echo "  ✅ NEXTAUTH_SECRET"
fi

echo ""
echo "✅ All secrets configured successfully!"
echo ""
echo "📋 Verify with: gh secret list"
echo ""
echo "🚀 You can now deploy:"
echo "  git push origin main"
