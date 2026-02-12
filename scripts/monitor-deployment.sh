#!/bin/bash

# Monitor Deployment and Verify Fix
# Run this to watch deployment progress and verify the fix

echo "=========================================="
echo "Monitoring Parlae Deployment"
echo "=========================================="
echo ""

echo "1. Checking deployment status..."
echo "-------------------------------------------"
gh run list --workflow=deploy-frontend.yml --limit 1
echo ""

echo "2. Expected values after deployment:"
echo "-------------------------------------------"
echo "✓ cognitoDomain: parlae-auth-2026.auth.us-east-2.amazoncognito.com"
echo "✓ cognitoSocialProviders: Google"
echo "✓ languagePriority: user"
echo "✓ gitCommit: $(git log -1 --format='%h')"
echo ""

echo "3. Waiting for deployment to complete..."
echo "   (This takes about 3-5 minutes)"
echo "-------------------------------------------"

# Wait for workflow to complete
echo "Watching workflow progress..."
gh run watch --exit-status 2>/dev/null || {
    echo "Workflow watch failed, waiting 5 minutes..."
    sleep 300
}

echo ""
echo "=========================================="
echo "4. Deployment Complete! Verifying..."
echo "=========================================="
echo ""

# Wait a bit for ECS to update
echo "Waiting 30 seconds for ECS tasks to update..."
sleep 30

echo "Checking /api/version endpoint..."
RESPONSE=$(curl -s https://app.parlae.ca/api/version)
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
echo ""

# Check specific values
COGNITO_DOMAIN=$(echo "$RESPONSE" | jq -r '.cognitoDomain' 2>/dev/null)
GIT_COMMIT=$(echo "$RESPONSE" | jq -r '.gitCommit' 2>/dev/null)

echo "=========================================="
echo "Verification Results:"
echo "=========================================="
echo ""

if [[ "$COGNITO_DOMAIN" == *"amazoncognito.com"* ]]; then
    echo "✅ COGNITO_DOMAIN is correct: $COGNITO_DOMAIN"
else
    echo "❌ COGNITO_DOMAIN is wrong: $COGNITO_DOMAIN"
    echo "   Expected: parlae-auth-2026.auth.us-east-2.amazoncognito.com"
fi

LOCAL_COMMIT=$(git log -1 --format='%h')
if [[ "$GIT_COMMIT" == "$LOCAL_COMMIT" ]] || [[ "$GIT_COMMIT" == *"$LOCAL_COMMIT"* ]]; then
    echo "✅ Git commit matches: $GIT_COMMIT"
else
    echo "⚠️  Git commit mismatch:"
    echo "   Local:    $LOCAL_COMMIT"
    echo "   Deployed: $GIT_COMMIT"
fi

echo ""
echo "=========================================="
echo "Next Steps:"
echo "=========================================="
echo ""
echo "1. Visit: https://app.parlae.ca/auth/sign-in"
echo "2. Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)"
echo "3. Click 'Continue with Google'"
echo "4. Should redirect to Cognito, NOT 'site can't be reached'"
echo "5. Switch to French - should see 'Bienvenue sur Parlae'"
echo ""
