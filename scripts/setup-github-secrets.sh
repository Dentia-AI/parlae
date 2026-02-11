#!/bin/bash
# Setup GitHub Secrets from Terraform Outputs
# This script pulls Cognito credentials from Terraform and sets them as GitHub secrets

set -e

echo "🔐 Setting up GitHub Secrets for Parlae..."
echo ""

# Check prerequisites
if ! command -v gh &> /dev/null; then
    echo "❌ Error: GitHub CLI (gh) is not installed"
    echo "Install with: brew install gh"
    exit 1
fi

if ! command -v terraform &> /dev/null; then
    echo "❌ Error: Terraform is not installed"
    echo "Install with: brew install terraform"
    exit 1
fi

# Check if logged into GitHub CLI
if ! gh auth status &> /dev/null; then
    echo "❌ Error: Not logged into GitHub CLI"
    echo "Run: gh auth login"
    exit 1
fi

# Navigate to terraform directory
INFRA_DIR="/Users/shaunk/Projects/Parlae-AI/parlae-infra/infra/ecs"
if [ ! -d "$INFRA_DIR" ]; then
    echo "❌ Error: Terraform directory not found: $INFRA_DIR"
    exit 1
fi

cd "$INFRA_DIR"

# Check if terraform is initialized
if [ ! -d ".terraform" ]; then
    echo "⚠️  Terraform not initialized. Initializing..."
    terraform init
fi

# Get values from Terraform
echo "📦 Fetching Cognito values from Terraform..."
CLIENT_ID=$(terraform output -raw cognito_client_id 2>/dev/null)
CLIENT_SECRET=$(terraform output -raw cognito_client_secret 2>/dev/null)
USER_POOL_ID=$(terraform output -raw cognito_user_pool_id 2>/dev/null)

if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ] || [ -z "$USER_POOL_ID" ]; then
    echo "❌ Error: Could not fetch Cognito values from Terraform"
    echo "Make sure Terraform state is up to date: terraform apply"
    exit 1
fi

REGION="us-east-1"  # Update if your region is different

# Construct COGNITO_ISSUER
COGNITO_ISSUER="https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}"

echo "✅ Got values from Terraform:"
echo "  Client ID: ${CLIENT_ID:0:20}..."
echo "  User Pool ID: $USER_POOL_ID"
echo "  Issuer: $COGNITO_ISSUER"
echo ""

# Check if NEXTAUTH_SECRET exists
NEXTAUTH_SECRET=""
NEXTAUTH_EXISTS=false

cd /Users/shaunk/Projects/Parlae-AI/parlae

if gh secret list | grep -q "NEXTAUTH_SECRET"; then
    echo "✅ NEXTAUTH_SECRET already exists"
    NEXTAUTH_EXISTS=true
else
    echo "🔑 Generating new NEXTAUTH_SECRET..."
    NEXTAUTH_SECRET=$(openssl rand -base64 32)
    echo "  Generated: ${NEXTAUTH_SECRET:0:10}..."
fi

# Confirm before setting secrets
echo ""
echo "🚀 Ready to set the following GitHub secrets:"
echo "  - COGNITO_CLIENT_ID"
echo "  - COGNITO_CLIENT_SECRET"
echo "  - COGNITO_ISSUER"
if [ "$NEXTAUTH_EXISTS" = false ]; then
    echo "  - NEXTAUTH_SECRET (new)"
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

if [ "$NEXTAUTH_EXISTS" = false ]; then
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
