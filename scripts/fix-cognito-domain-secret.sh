#!/bin/bash

# Fix COGNITO_DOMAIN GitHub Secret
# This script will update the secret with the correct value

set -e

echo "=========================================="
echo "Fixing COGNITO_DOMAIN GitHub Secret"
echo "=========================================="
echo ""

# The correct Cognito domain for Parlae
COGNITO_DOMAIN="parlae-auth-2026.auth.us-east-2.amazoncognito.com"

echo "Setting COGNITO_DOMAIN to: ${COGNITO_DOMAIN}"
echo ""
echo "⚠️  IMPORTANT: Do NOT include https:// in the value!"
echo ""

# Set the secret
gh secret set COGNITO_DOMAIN --body "${COGNITO_DOMAIN}"

if [ $? -eq 0 ]; then
    echo "✅ COGNITO_DOMAIN secret updated successfully!"
    echo ""
    echo "Verification:"
    gh secret list | grep COGNITO_DOMAIN
    echo ""
    echo "Next steps:"
    echo "  1. Trigger deployment: gh workflow run deploy-frontend.yml"
    echo "  2. Wait 5-10 minutes"
    echo "  3. Check logs in ECS or run: curl https://app.parlae.ca/api/version"
    echo "  4. Verify cognitoDomain shows full domain, not 'parlae-auth'"
else
    echo "❌ Failed to set secret. Make sure you're authenticated:"
    echo "   gh auth login"
fi
