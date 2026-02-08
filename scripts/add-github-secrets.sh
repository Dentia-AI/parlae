#!/bin/bash

# Add GitHub Secrets using GitHub CLI
# This script adds all required secrets for CI/CD to your GitHub repository

set -e

echo "=================================================="
echo "Adding GitHub Secrets for CI/CD"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    print_error "GitHub CLI (gh) is not installed"
    echo ""
    echo "Install it with:"
    echo "  brew install gh"
    echo ""
    echo "Or visit: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    print_error "Not authenticated with GitHub CLI"
    echo ""
    echo "Run: gh auth login"
    exit 1
fi

print_success "GitHub CLI is installed and authenticated"
echo ""

# Get the repository (from argument or auto-detect)
if [ -n "$1" ]; then
    REPO="$1"
    print_success "Using specified repository: $REPO"
else
    REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")
    if [ -z "$REPO" ]; then
        print_error "Not in a GitHub repository or repo not found"
        echo ""
        echo "Usage: $0 [OWNER/REPO]"
        echo "Example: $0 rafa-9/parlae"
        echo ""
        echo "Or run this script from within the repository directory"
        exit 1
    fi
fi

print_success "Repository: $REPO"
echo ""

# Collect secret values
echo "=================================================="
echo "Collecting Secret Values"
echo "=================================================="
echo ""

# 1. AWS_ACCESS_KEY_ID
AWS_ACCESS_KEY="AKIA5RWTNYBTIK6LSJBU"
print_success "AWS_ACCESS_KEY_ID: $AWS_ACCESS_KEY"

# 2. AWS_SECRET_ACCESS_KEY
if [ -f ~/.aws/credentials ]; then
    AWS_SECRET=$(grep aws_secret_access_key ~/.aws/credentials | head -1 | cut -d'=' -f2 | tr -d ' ')
    if [ -n "$AWS_SECRET" ]; then
        MASKED="${AWS_SECRET:0:4}...${AWS_SECRET: -4}"
        print_success "AWS_SECRET_ACCESS_KEY: $MASKED (found)"
    else
        print_error "AWS_SECRET_ACCESS_KEY not found in ~/.aws/credentials"
        exit 1
    fi
else
    print_error "~/.aws/credentials file not found"
    exit 1
fi

# 3. AWS_REGION
AWS_REGION="us-east-2"
print_success "AWS_REGION: $AWS_REGION"

# 4. ECR_REPOSITORY
ECR_REPO="234270344223.dkr.ecr.us-east-2.amazonaws.com"
print_success "ECR_REPOSITORY: $ECR_REPO"

# 5. STRIPE_PUBLISHABLE_KEY_PROD
STRIPE_KEY="pk_live_51Sukx4Lkem7BYPMmI3EWAbEvinE3LcbAC7kbNBC9FA7mPC9IIRbhfB6pqs99MjppG4sOFNY7wIHc4x0Ptekynfqb006tkLQJk1"
print_success "STRIPE_PUBLISHABLE_KEY_PROD: ${STRIPE_KEY:0:20}...${STRIPE_KEY: -10}"

echo ""
echo "=================================================="
echo "Adding Secrets to GitHub Repository"
echo "=================================================="
echo ""

# Add secrets using gh CLI
echo "Adding AWS_ACCESS_KEY_ID..."
echo "$AWS_ACCESS_KEY" | gh secret set AWS_ACCESS_KEY_ID --repo "$REPO"
print_success "AWS_ACCESS_KEY_ID added"

echo "Adding AWS_SECRET_ACCESS_KEY..."
echo "$AWS_SECRET" | gh secret set AWS_SECRET_ACCESS_KEY --repo "$REPO"
print_success "AWS_SECRET_ACCESS_KEY added"

echo "Adding AWS_REGION..."
echo "$AWS_REGION" | gh secret set AWS_REGION --repo "$REPO"
print_success "AWS_REGION added"

echo "Adding ECR_REPOSITORY..."
echo "$ECR_REPO" | gh secret set ECR_REPOSITORY --repo "$REPO"
print_success "ECR_REPOSITORY added"

echo "Adding STRIPE_PUBLISHABLE_KEY_PROD..."
echo "$STRIPE_KEY" | gh secret set STRIPE_PUBLISHABLE_KEY_PROD --repo "$REPO"
print_success "STRIPE_PUBLISHABLE_KEY_PROD added"

echo ""
echo "=================================================="
echo "Verifying Secrets"
echo "=================================================="
echo ""

# List all secrets to verify
echo "Current secrets in repository:"
gh secret list --repo "$REPO"

echo ""
echo "=================================================="
echo "✅ All secrets added successfully!"
echo "=================================================="
echo ""

echo "Next steps:"
echo ""
echo "1. Create ECR repositories (if they don't exist):"
echo "   aws ecr create-repository --repository-name parlae-backend --region us-east-2"
echo "   aws ecr create-repository --repository-name parlae-frontend --region us-east-2"
echo ""
echo "2. Deploy ECS infrastructure with Terraform:"
echo "   cd parlae-infra/infra/ecs"
echo "   terraform apply"
echo ""
echo "3. Enable frontend workflow:"
echo "   Edit: .github/workflows/deploy-frontend.yml"
echo "   Remove line: if: \${{ false }}"
echo "   Uncomment push trigger"
echo ""
echo "4. Push to main to trigger deployment:"
echo "   git add ."
echo "   git commit -m \"Enable CI/CD\""
echo "   git push origin main"
echo ""
echo "📖 See CICD_STATUS_AND_SETUP.md for more details"
echo ""
