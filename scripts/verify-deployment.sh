#!/bin/bash

# Verification Script for Parlae Deployment Issues
# Run this to check deployment status and troubleshoot

set -e

echo "=========================================="
echo "Parlae Production Deployment Verification"
echo "=========================================="
echo ""

# Check GitHub Secrets
echo "1. Checking GitHub Secrets..."
echo "-------------------------------------------"
if command -v gh &> /dev/null; then
    echo "✓ GitHub CLI found"
    gh secret list | grep COGNITO || echo "❌ No COGNITO secrets found"
    gh secret list | grep GHL || echo "⚠️  No GHL secrets found"
else
    echo "⚠️  GitHub CLI not found - install with: brew install gh"
fi
echo ""

# Check Latest GitHub Actions Run
echo "2. Checking Latest Deployment..."
echo "-------------------------------------------"
if command -v gh &> /dev/null; then
    echo "Latest workflow runs:"
    gh run list --workflow=deploy-frontend.yml --limit 3
    echo ""
    echo "To see logs of latest run:"
    echo "  gh run view --log"
else
    echo "Check manually: https://github.com/YOUR_USERNAME/parlae/actions"
fi
echo ""

# Check AWS ECS Service
echo "3. Checking ECS Service Status..."
echo "-------------------------------------------"
if command -v aws &> /dev/null; then
    echo "Checking parlae-frontend service..."
    aws ecs describe-services \
        --cluster parlae-cluster \
        --services parlae-frontend \
        --region us-east-2 \
        --query 'services[0].{RunningCount:runningCount,DesiredCount:desiredCount,Status:status,Deployments:deployments[*].{Status:status,TaskDefinition:taskDefinition,CreatedAt:createdAt}}' \
        --output table 2>/dev/null || echo "❌ AWS CLI not configured or service not found"
else
    echo "⚠️  AWS CLI not found"
    echo "Check manually: https://console.aws.amazon.com/ecs"
fi
echo ""

# Check what's running
echo "4. Testing Production Environment..."
echo "-------------------------------------------"
echo "Fetching app.parlae.ca to check response..."

# Check if site is up
if curl -s -o /dev/null -w "%{http_code}" https://app.parlae.ca | grep -q "200\|302"; then
    echo "✓ Site is responding"
    
    # Check for version or build info
    echo ""
    echo "Checking for build metadata..."
    curl -s https://app.parlae.ca/api/version 2>/dev/null || echo "No version endpoint"
else
    echo "❌ Site not responding correctly"
fi
echo ""

# Summary
echo "=========================================="
echo "Action Items:"
echo "=========================================="
echo ""
echo "IF GOOGLE OAUTH STILL SHOWS 'parlae-auth':"
echo "  1. Verify COGNITO_DOMAIN secret value:"
echo "     gh secret set COGNITO_DOMAIN --body 'parlae-auth-2026.auth.us-east-2.amazoncognito.com'"
echo ""
echo "  2. Force new ECS deployment:"
echo "     aws ecs update-service --cluster parlae-cluster --service parlae-frontend --force-new-deployment --region us-east-2"
echo ""
echo "  3. Wait 5-10 minutes for new tasks to start"
echo ""
echo "  4. Check ECS task logs:"
echo "     aws logs tail /ecs/parlae-frontend --follow --region us-east-2"
echo ""
echo "IF TRANSLATIONS NOT WORKING:"
echo "  - The translation files are in the code"
echo "  - May need to clear browser cache"
echo "  - Check browser console for errors"
echo ""
echo "=========================================="
