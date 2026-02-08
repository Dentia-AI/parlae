#!/bin/bash

# Get GitHub Secrets Values
# This script helps you collect all the values needed for GitHub Actions secrets

set -e

echo "=================================================="
echo "GitHub Secrets Values Collector"
echo "=================================================="
echo ""
echo "This script will help you get all the values you need"
echo "to add as secrets in GitHub Settings → Secrets → Actions"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_section() {
    echo ""
    echo "=================================================="
    echo "$1"
    echo "=================================================="
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# 1. AWS_ACCESS_KEY_ID
print_section "1. AWS_ACCESS_KEY_ID"

if [ -f ~/.aws/credentials ]; then
    AWS_KEY=$(grep aws_access_key_id ~/.aws/credentials | head -1 | cut -d'=' -f2 | tr -d ' ')
    if [ -n "$AWS_KEY" ]; then
        print_success "Found in ~/.aws/credentials"
        echo "Value: $AWS_KEY"
    else
        print_warning "Not found in ~/.aws/credentials"
        echo "Run: aws configure"
        echo "Or: aws iam create-access-key --user-name shaun-parlae"
    fi
else
    print_warning "~/.aws/credentials file not found"
    echo "Run: aws configure"
fi

# 2. AWS_SECRET_ACCESS_KEY
print_section "2. AWS_SECRET_ACCESS_KEY"

if [ -f ~/.aws/credentials ]; then
    AWS_SECRET=$(grep aws_secret_access_key ~/.aws/credentials | head -1 | cut -d'=' -f2 | tr -d ' ')
    if [ -n "$AWS_SECRET" ]; then
        print_success "Found in ~/.aws/credentials"
        # Mask the secret
        MASKED="${AWS_SECRET:0:4}...${AWS_SECRET: -4}"
        echo "Value: $MASKED (full value in ~/.aws/credentials)"
    else
        print_warning "Not found in ~/.aws/credentials"
        echo "Run: aws configure"
    fi
else
    print_warning "~/.aws/credentials file not found"
fi

# 3. AWS_REGION
print_section "3. AWS_REGION"
print_success "Use this value:"
echo "us-east-2"

# 4. ECR_REPOSITORY
print_section "4. ECR_REPOSITORY"

echo "Checking AWS account..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")

if [ -n "$ACCOUNT_ID" ]; then
    print_success "AWS Account ID: $ACCOUNT_ID"
    ECR_URL="${ACCOUNT_ID}.dkr.ecr.us-east-2.amazonaws.com"
    echo "ECR Registry URL: $ECR_URL"
    
    echo ""
    echo "Checking if ECR repositories exist..."
    
    # Check parlae-backend
    if aws ecr describe-repositories --repository-names parlae-backend --region us-east-2 &>/dev/null; then
        print_success "parlae-backend repository exists"
    else
        print_warning "parlae-backend repository does NOT exist"
        echo "Create it: aws ecr create-repository --repository-name parlae-backend --region us-east-2"
    fi
    
    # Check parlae-frontend
    if aws ecr describe-repositories --repository-names parlae-frontend --region us-east-2 &>/dev/null; then
        print_success "parlae-frontend repository exists"
    else
        print_warning "parlae-frontend repository does NOT exist"
        echo "Create it: aws ecr create-repository --repository-name parlae-frontend --region us-east-2"
    fi
else
    print_error "Cannot get AWS account ID"
    echo "Make sure AWS CLI is configured: aws configure"
    ECR_URL="<YOUR-ACCOUNT-ID>.dkr.ecr.us-east-2.amazonaws.com"
fi

# 5. STRIPE_PUBLISHABLE_KEY_PROD
print_section "5. STRIPE_PUBLISHABLE_KEY_PROD"

if [ -f "dentia/.env.local" ]; then
    TEST_KEY=$(grep STRIPE_PUBLISHABLE_KEY dentia/.env.local | head -1 | cut -d'=' -f2)
    if [[ $TEST_KEY == pk_test_* ]]; then
        print_warning "Found TEST key in .env.local: $TEST_KEY"
        echo ""
        echo "⚠️  You need a PRODUCTION key (starts with pk_live_)"
        echo ""
        echo "Get it from: https://dashboard.stripe.com/apikeys"
        echo "1. Switch to 'Live mode' (toggle in top-right)"
        echo "2. Copy the 'Publishable key'"
        echo "3. It should start with: pk_live_"
    else
        echo "Found key: $TEST_KEY"
    fi
else
    print_warning "dentia/.env.local not found"
fi

echo ""
echo "To get your production Stripe key:"
echo "1. Visit: https://dashboard.stripe.com/apikeys"
echo "2. Toggle to 'Live mode' (top-right)"
echo "3. Copy 'Publishable key' (starts with pk_live_)"

# Summary
print_section "SUMMARY - Copy These to GitHub Secrets"

echo "Go to: GitHub.com → Your Repo → Settings → Secrets and variables → Actions"
echo ""
echo "Add these 5 secrets:"
echo ""

if [ -n "$AWS_KEY" ]; then
    echo "1. AWS_ACCESS_KEY_ID = $AWS_KEY"
else
    echo "1. AWS_ACCESS_KEY_ID = <get from ~/.aws/credentials>"
fi

if [ -n "$AWS_SECRET" ]; then
    MASKED="${AWS_SECRET:0:4}...${AWS_SECRET: -4}"
    echo "2. AWS_SECRET_ACCESS_KEY = $MASKED (see ~/.aws/credentials for full value)"
else
    echo "2. AWS_SECRET_ACCESS_KEY = <get from ~/.aws/credentials>"
fi

echo "3. AWS_REGION = us-east-2"

if [ -n "$ECR_URL" ]; then
    echo "4. ECR_REPOSITORY = $ECR_URL"
else
    echo "4. ECR_REPOSITORY = <YOUR-ACCOUNT-ID>.dkr.ecr.us-east-2.amazonaws.com"
fi

echo "5. STRIPE_PUBLISHABLE_KEY_PROD = pk_live_... (get from Stripe Dashboard)"

# Additional checks
print_section "ADDITIONAL CHECKS"

echo "Checking ECS cluster..."
if aws ecs describe-clusters --clusters parlae-cluster --region us-east-2 &>/dev/null; then
    print_success "parlae-cluster exists"
else
    print_warning "parlae-cluster does NOT exist"
    echo "You need to deploy infrastructure first:"
    echo "  cd dentia-infra/infra/ecs"
    echo "  terraform init"
    echo "  terraform apply"
fi

echo ""
echo "Checking ECS services..."
if aws ecs describe-services --cluster parlae-cluster --services parlae-backend --region us-east-2 &>/dev/null 2>&1; then
    print_success "parlae-backend service exists"
else
    print_warning "parlae-backend service does NOT exist"
fi

if aws ecs describe-services --cluster parlae-cluster --services parlae-frontend --region us-east-2 &>/dev/null 2>&1; then
    print_success "parlae-frontend service exists"
else
    print_warning "parlae-frontend service does NOT exist"
fi

print_section "NEXT STEPS"

echo "1. ✅ Create ECR repositories (if they don't exist)"
echo "   aws ecr create-repository --repository-name parlae-backend --region us-east-2"
echo "   aws ecr create-repository --repository-name parlae-frontend --region us-east-2"
echo ""
echo "2. ✅ Add all 5 secrets to GitHub"
echo "   GitHub.com → Settings → Secrets and variables → Actions"
echo ""
echo "3. ✅ Enable frontend workflow"
echo "   Edit: dentia/.github/workflows/deploy-frontend.yml"
echo "   Remove line: if: \${{ false }}"
echo ""
echo "4. ✅ Test deployment"
echo "   Make a small change and push to main"
echo ""
echo "📖 See GITHUB_SECRETS_SETUP.md for detailed instructions"
echo ""
