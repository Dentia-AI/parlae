#!/usr/bin/env bash
#
# Starter Kit Configuration
# Copy this file to config.sh and fill in your values
# DO NOT commit config.sh to version control!
#

#=============================================================================
# PROJECT SETTINGS
#=============================================================================
export PROJECT_NAME="dentia"           # Your project name (lowercase, no spaces)
export AWS_PROFILE="dentia"            # AWS CLI profile name
export AWS_REGION="us-east-2"             # AWS region

#=============================================================================
# DOMAIN SETTINGS
#=============================================================================
# Main Application Domains
export APP_DOMAIN="app.parlae.ca"      # Main app domain
export MARKETING_DOMAIN="www.parlae.ca" # Marketing site
export API_DOMAIN="api.parlae.ca"       # API domain
export APEX_DOMAIN="parlae.ca"          # Root domain

# Forum/Community Domains
# export HUB_DOMAIN="hub.example.com"       # Discourse forum domain

#=============================================================================
# DATABASE SETTINGS
#=============================================================================
export DB_MASTER_USERNAME="parlae"
export DB_MASTER_PASSWORD="aK9#mNp2!vRx7Lq!tY5wB3j"              # Generate strong password
export DB_NAME="parlae_production"
export DISCOURSE_DB_NAME="parlaehub_production"
export DISCOURSE_DB_PASSWORD="aK9#mNp2!vdfTRgSDF32#wB3j"           # Generate strong password

#=============================================================================
# EMAIL / SMTP SETTINGS
#=============================================================================
export SMTP_ADDRESS="email-smtp.${AWS_REGION}.amazonaws.com"
export SMTP_PORT="587"
export SMTP_USERNAME="admin@parlae.ca"                   # AWS SES SMTP username
export SMTP_PASSWORD="Singularity!2026"                   # AWS SES SMTP password
export SMTP_DOMAIN="${APEX_DOMAIN}"
export NOTIFICATION_EMAIL="noreply@${APEX_DOMAIN}"
export DEVELOPER_EMAIL="admin@${APEX_DOMAIN}"

#=============================================================================
# AUTHENTICATION SETTINGS
#=============================================================================
# NextAuth
export NEXTAUTH_SECRET=""                 # Generate with: openssl rand -base64 32
export NEXTAUTH_URL="https://${APP_DOMAIN}"

# Cognito (will be created during setup)
export COGNITO_USER_POOL_NAME="${PROJECT_NAME}-users"
export COGNITO_CLIENT_NAME="${PROJECT_NAME}-app"
export COGNITO_DOMAIN="${PROJECT_NAME}-auth" # Must be globally unique

# Google OAuth (for Cognito Identity Provider - optional)
# Get from: https://console.cloud.google.com → APIs & Services → Credentials
export GOOGLE_CLIENT_ID=""                   # Google OAuth Client ID
export GOOGLE_CLIENT_SECRET=""               # Google OAuth Client Secret

#=============================================================================
# DISCOURSE SSO
#=============================================================================
export DISCOURSE_SSO_SECRET=""            # Generate with: openssl rand -hex 32
export DISCOURSE_CONNECT_URL="https://${HUB_DOMAIN}"

#=============================================================================
# AWS SERVICES
#=============================================================================
export S3_BUCKET_NAME="${PROJECT_NAME}-uploads-${AWS_REGION}"
export DISCOURSE_S3_BUCKET="${PROJECT_NAME}-discourse-uploads-${AWS_REGION}"

#=============================================================================
# GOHIGHLEVEL (GHL) INTEGRATION
#=============================================================================
# Required for AI voice agent configuration and CRM integration
# Get these from: https://app.gohighlevel.com/settings/company
export GHL_API_KEY=""                         # Settings → Company → API Keys
export GHL_LOCATION_ID=""                     # Settings → Business Profile
export GHL_WIDGET_ID=""                       # Chat Widget ID (optional)
export GHL_CALENDAR_ID=""                     # Calendar ID (optional)

#=============================================================================
# STRIPE BILLING
#=============================================================================
# Get from: https://dashboard.stripe.com/apikeys
# Development/Test Keys (for local development and testing)
export STRIPE_PUBLISHABLE_KEY_TEST="pk_test_..."
export STRIPE_SECRET_KEY_TEST="sk_test_..."

# Production Keys (for production environment)
export STRIPE_PUBLISHABLE_KEY_PROD="pk_live_..."
export STRIPE_SECRET_KEY_PROD="sk_live_..."

# Active Keys (will be set based on ENVIRONMENT)
export STRIPE_PUBLISHABLE_KEY="${STRIPE_PUBLISHABLE_KEY_PROD}"
export STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY_PROD}"
export NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="${STRIPE_PUBLISHABLE_KEY}"

# Set to test keys if not in production
if [[ "$ENVIRONMENT" != "production" ]]; then
  export STRIPE_PUBLISHABLE_KEY="${STRIPE_PUBLISHABLE_KEY_TEST}"
  export STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY_TEST}"
  export NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="${STRIPE_PUBLISHABLE_KEY}"
fi

#=============================================================================
# DEPLOYMENT SETTINGS
#=============================================================================
export ENVIRONMENT="production"           # production, staging, or dev
export DEPLOY_FRONTEND="true"
export DEPLOY_BACKEND="true"
export DEPLOY_DISCOURSE="true"

#=============================================================================
# TERRAFORM BACKEND (for state management)
#=============================================================================
export TF_STATE_BUCKET="${PROJECT_NAME}-terraform-state"
export TF_STATE_REGION="${AWS_REGION}"
export TF_LOCK_TABLE="${PROJECT_NAME}-terraform-locks"

#=============================================================================
# OPTIONAL: CloudFront CDN
#=============================================================================
export ENABLE_CLOUDFRONT="false"
export CDN_DOMAIN=""                      # e.g., cdn.example.com

#=============================================================================
# OPTIONAL: Custom SSL Certificates
#=============================================================================
export ACM_CERTIFICATE_ARN=""             # If you have existing cert

#=============================================================================
# VALIDATION
#=============================================================================
validate_config() {
  local errors=0
  
  # Required fields
  if [[ -z "$DB_MASTER_PASSWORD" ]]; then
    echo "ERROR: DB_MASTER_PASSWORD is required"
    ((errors++))
  fi
  
  if [[ -z "$DISCOURSE_DB_PASSWORD" ]]; then
    echo "ERROR: DISCOURSE_DB_PASSWORD is required"
    ((errors++))
  fi
  
  if [[ -z "$NEXTAUTH_SECRET" ]]; then
    echo "ERROR: NEXTAUTH_SECRET is required"
    ((errors++))
  fi
  
  if [[ -z "$DISCOURSE_SSO_SECRET" ]]; then
    echo "ERROR: DISCOURSE_SSO_SECRET is required"
    ((errors++))
  fi
  
  if [[ -z "$SMTP_USERNAME" ]] || [[ -z "$SMTP_PASSWORD" ]]; then
    echo "WARNING: SMTP credentials not set. Email won't work."
  fi
  
  if [[ $errors -gt 0 ]]; then
    echo ""
    echo "Please fill in all required fields in config.sh"
    echo ""
    echo "Generate secrets with:"
    echo "  openssl rand -base64 32  # For NEXTAUTH_SECRET"
    echo "  openssl rand -hex 32     # For DISCOURSE_SSO_SECRET"
    echo "  openssl rand -base64 16  # For passwords"
    return 1
  fi
  
  return 0
}

# Auto-validate when sourced
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
  validate_config
fi

