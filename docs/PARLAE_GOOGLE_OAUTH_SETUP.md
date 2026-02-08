# Parlae - Google OAuth & Cognito Setup Guide

**Project**: Parlae  
**Last Updated**: January 28, 2026  
**Status**: Configuration Required

---

## 🎯 Overview

This guide walks you through setting up Google OAuth as an identity provider for your Parlae application via AWS Cognito.

**What You'll Set Up:**
1. ✅ Google OAuth 2.0 credentials in Google Cloud Console
2. ✅ Cognito callback URLs for your Parlae domains
3. ✅ Terraform configuration to enable Google Identity Provider
4. ✅ Deploy infrastructure with Google OAuth enabled

---

## 📋 Prerequisites

Before starting:
- ✅ Google account (for Google Cloud Console access)
- ✅ AWS account with Cognito permissions
- ✅ Parlae domains configured (app.parlae.ca, api.parlae.ca)
- ✅ Terraform installed and configured

---

## 🔑 Step 1: Create Google OAuth Credentials

### 1.1 Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click **"Select a project"** dropdown at the top
3. Click **"New Project"**
4. Enter details:
   - **Project name**: `Parlae` or `Parlae Authentication`
   - **Organization**: (optional) Your organization
5. Click **"Create"**
6. Wait for project creation (takes a few seconds)

### 1.2 Enable Google+ API

1. In your Google Cloud project, go to **"APIs & Services"** → **"Library"**
2. Search for **"Google+ API"** or **"Google Identity"**
3. Click on **"Google+ API"**
4. Click **"Enable"**

### 1.3 Configure OAuth Consent Screen

1. Go to **"APIs & Services"** → **"OAuth consent screen"**
2. Select **"External"** (or Internal if you have Google Workspace)
3. Click **"Create"**
4. Fill in the required fields:

**App information:**
- **App name**: `Parlae`
- **User support email**: `admin@parlae.ca`
- **App logo**: (optional) Upload your Parlae logo

**App domain:**
- **Application home page**: `https://app.parlae.ca`
- **Application privacy policy link**: `https://app.parlae.ca/privacy` (create this page)
- **Application terms of service link**: `https://app.parlae.ca/terms` (create this page)

**Authorized domains:**
- `parlae.ca`
- `amazoncognito.com` (required for Cognito)

**Developer contact information:**
- **Email addresses**: `admin@parlae.ca`

5. Click **"Save and Continue"**

**Scopes:**
6. Click **"Add or Remove Scopes"**
7. Select these scopes:
   - ✅ `email`
   - ✅ `profile`
   - ✅ `openid`
8. Click **"Update"** then **"Save and Continue"**

**Test users** (optional for development):
9. Add test email addresses if your app is in testing mode
10. Click **"Save and Continue"**

11. Review and click **"Back to Dashboard"**

### 1.4 Create OAuth 2.0 Credentials

1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. Configure:
   - **Application type**: `Web application`
   - **Name**: `Parlae Web App`

**Authorized JavaScript origins:**
Add these URLs:
```
https://app.parlae.ca
https://parlae.ca
https://login.parlae.ca
```

**Authorized redirect URIs:**
Add these callback URLs:
```
https://app.parlae.ca/api/auth/callback/cognito
https://parlae-auth-2026.auth.us-east-2.amazoncognito.com/oauth2/idpresponse
```

**⚠️ IMPORTANT**: The second URL format is:
```
https://{COGNITO_DOMAIN}.auth.{AWS_REGION}.amazoncognito.com/oauth2/idpresponse
```

For Parlae:
- **COGNITO_DOMAIN**: `parlae-auth-2026` (from your config.sh)
- **AWS_REGION**: `us-east-2` (from your config.sh)

4. Click **"Create"**
5. **Save your credentials**:
   - 📝 **Client ID**: (looks like `123456789-abcdefg.apps.googleusercontent.com`)
   - 📝 **Client Secret**: (looks like `GOCSPX-abc123...`)

⚠️ **IMPORTANT**: Save these immediately - you'll need them for Terraform!

---

## 📝 Step 2: Update Terraform Variables

### 2.1 Update dentia-infra Variables

Edit `/Users/shaunk/Projects/dentia/dentia-infra/infra/ecs/variables.tf`:

Find lines 69-85 and update the defaults:

```hcl
variable "cognito_google_client_id" {
  description = "Google OAuth client ID for the Cognito identity provider (leave blank to disable)."
  type        = string
  default     = "YOUR-CLIENT-ID.apps.googleusercontent.com"  # ADD YOUR CLIENT ID HERE
}

variable "cognito_google_client_secret" {
  description = "Google OAuth client secret for the Cognito identity provider (leave blank to disable)."
  type        = string
  default     = "YOUR-CLIENT-SECRET"  # ADD YOUR CLIENT SECRET HERE
  sensitive   = true
}

variable "cognito_custom_domain" {
  description = "Optional custom domain for the Cognito hosted UI (e.g., auth.example.com). Leave blank to use the AWS-provided domain."
  type        = string
  default     = "login.parlae.ca"  # UPDATE TO PARLAE DOMAIN
}
```

### 2.2 Update Cognito Callback URLs

Edit `/Users/shaunk/Projects/dentia/dentia-infra/infra/ecs/cognito.tf`:

Find line 104-106 and update:

```hcl
callback_urls = [
  "https://app.parlae.ca/api/auth/callback/cognito",  # UPDATED TO PARLAE
  "https://www.parlae.ca/api/auth/callback/cognito",  # ADD IF NEEDED
]
```

Find line 113-115 and update:

```hcl
logout_urls = [
  "https://app.parlae.ca",  # UPDATED TO PARLAE
  "https://www.parlae.ca",  # ADD IF NEEDED
]
```

### 2.3 Update Project Variables

Edit `/Users/shaunk/Projects/dentia/dentia-infra/infra/ecs/variables.tf`:

Lines 7-26, update to Parlae:

```hcl
variable "profile" {
  type    = string
  default = "parlae"  # CHANGED FROM dentia
}

variable "project_name" {
  type    = string
  default = "parlae"  # CHANGED FROM dentia
}

variable "domain" {
  description = "Root domain managed in Route53 (e.g., parlae.ca)."
  type        = string
  default     = "parlae.ca"  # CHANGED
}

variable "alb_hostname" {
  description = "Hostname for the app served by the ALB (e.g., app.parlae.ca)."
  type        = string
  default     = "app.parlae.ca"  # CHANGED
}

variable "additional_cert_names" {
  description = "Optional extra names on the cert (e.g., api.parlae.ca)."
  type        = list(string)
  default     = ["api.parlae.ca"]  # CHANGED
}
```

---

## 🚀 Step 3: Deploy Infrastructure with Google OAuth

### 3.1 Plan Terraform Changes

```bash
cd /Users/shaunk/Projects/dentia/dentia-infra/infra/ecs

# Initialize Terraform (if not already done)
terraform init

# Plan the changes
terraform plan \
  -var="cognito_google_client_id=YOUR-CLIENT-ID.apps.googleusercontent.com" \
  -var="cognito_google_client_secret=YOUR-CLIENT-SECRET" \
  -var="project_name=parlae" \
  -var="alb_hostname=app.parlae.ca" \
  -var="domain=parlae.ca"
```

Review the output. You should see:
- ✅ `aws_cognito_identity_provider.google` will be created
- ✅ `aws_cognito_user_pool_client.frontend` will be updated (adds Google to supported providers)
- ✅ Domain and callback URLs updated

### 3.2 Apply Terraform Changes

```bash
terraform apply \
  -var="cognito_google_client_id=YOUR-CLIENT-ID.apps.googleusercontent.com" \
  -var="cognito_google_client_secret=YOUR-CLIENT-SECRET" \
  -var="project_name=parlae" \
  -var="alb_hostname=app.parlae.ca" \
  -var="domain=parlae.ca"
```

Type `yes` when prompted.

**⏱️ Time**: ~5-10 minutes

---

## 🔧 Step 4: Update Environment Configuration

### 4.1 Add to config.sh

Edit `/Users/shaunk/Projects/dentia/config.sh`:

Add after the Cognito section (around line 58):

```bash
#=============================================================================
# GOOGLE OAUTH (for Cognito Identity Provider)
#=============================================================================
export GOOGLE_CLIENT_ID="YOUR-CLIENT-ID.apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="YOUR-CLIENT-SECRET"
```

### 4.2 Update SSM Secrets Script

The `put-ssm-secrets.sh` script should be updated to include Google OAuth credentials.

Edit `/Users/shaunk/Projects/dentia/dentia-infra/infra/scripts/put-ssm-secrets.sh`:

Add after the Cognito parameters (around line 60):

```bash
# Google OAuth (optional - only if using Google Identity Provider)
if [[ -n "$GOOGLE_CLIENT_ID" ]] && [[ -n "$GOOGLE_CLIENT_SECRET" ]]; then
  put_param "/${PROJECT_NAME}/shared/GOOGLE_CLIENT_ID" "$GOOGLE_CLIENT_ID"
  put_param "/${PROJECT_NAME}/shared/GOOGLE_CLIENT_SECRET" "$GOOGLE_CLIENT_SECRET" SecureString
  echo "✓ Google OAuth credentials uploaded"
fi
```

### 4.3 Run Setup Script

```bash
cd /Users/shaunk/Projects/dentia/dentia
source ../config.sh
./setup-local-env.sh
```

This will regenerate your `.env.local` files with the latest configuration.

---

## ✅ Step 5: Verify Configuration

### 5.1 Check Cognito Configuration

1. Go to [AWS Cognito Console](https://console.aws.amazon.com/cognito)
2. Select your user pool: `parlae-user-pool`
3. Go to **"Sign-in experience"** → **"Federated identity provider sign-in"**
4. You should see **"Google"** listed as an identity provider
5. Click on **"Google"** to verify:
   - Client ID matches your Google OAuth Client ID
   - Attribute mapping is configured correctly

### 5.2 Check App Client

1. In Cognito, go to **"App integration"** → **"App clients"**
2. Click on `parlae-frontend-client`
3. Verify:
   - **Identity providers**: Should include "Cognito" and "Google"
   - **Callback URLs**: Should include `https://app.parlae.ca/api/auth/callback/cognito`
   - **Sign out URLs**: Should include `https://app.parlae.ca`
   - **OAuth flows**: Authorization code grant
   - **OAuth scopes**: email, openid, profile

### 5.3 Test Cognito Hosted UI

1. Get your Cognito domain from Terraform output:
```bash
cd /Users/shaunk/Projects/dentia/dentia-infra/infra/ecs
terraform output cognito_domain
```

2. Construct the login URL:
```
https://parlae-auth-2026.auth.us-east-2.amazoncognito.com/login?client_id=YOUR_CLIENT_ID&response_type=code&scope=email+openid+profile&redirect_uri=https://app.parlae.ca/api/auth/callback/cognito
```

3. Open this URL in your browser
4. You should see the Cognito login page with:
   - ✅ Email/Password sign in
   - ✅ **"Continue with Google"** button

5. Try logging in with Google - it should:
   - Redirect to Google sign-in
   - Ask for permission (first time only)
   - Redirect back to your app
   - Create a Cognito user automatically

---

## 🔐 Step 6: Update Callback URLs in Google Console

After deployment, verify the callback URL is correct:

1. Go back to [Google Cloud Console](https://console.cloud.google.com)
2. Go to **"APIs & Services"** → **"Credentials"**
3. Click on your **"Parlae Web App"** OAuth 2.0 Client
4. Verify/Update **Authorized redirect URIs**:

After Cognito is created, get the EXACT Cognito domain:

```bash
cd /Users/shaunk/Projects/dentia/dentia-infra/infra/ecs
terraform output cognito_domain
# Output: parlae-auth-2026.auth.us-east-2.amazoncognito.com
```

Add this exact URL to Google:
```
https://parlae-auth-2026.auth.us-east-2.amazoncognito.com/oauth2/idpresponse
```

5. Click **"Save"**

---

## 🧪 Step 7: Test the Integration

### 7.1 Test Locally (Optional)

For local testing, you'll need to:

1. Use a tunneling service like ngrok to expose localhost
2. Add the ngrok URL to Google's authorized redirect URIs
3. Update NEXTAUTH_URL to use the ngrok URL

**For Production Testing (Recommended):**
Skip local testing and test directly in production after deployment.

### 7.2 Test in Production

1. Deploy your frontend application:
```bash
cd /Users/shaunk/Projects/dentia
./setup.sh
# Choose option [5] Deploy Main App Only
```

2. Go to `https://app.parlae.ca/auth/sign-in`

3. You should see sign-in options:
   - Email/Password
   - **"Sign in with Google"** button

4. Click **"Sign in with Google"**

5. Complete the Google OAuth flow

6. Verify you're redirected back and logged in

7. Check Cognito Console to see the new user created:
   - Go to AWS Cognito Console
   - Select `parlae-user-pool`
   - Go to **"Users"**
   - You should see the user with:
     - Username: `Google_[sub-from-google]`
     - Email: Your Google email
     - Status: Confirmed

---

## 📊 Callback URL Reference

Here's a complete reference of all callback URLs you need:

### For Google Cloud Console

**Authorized JavaScript origins:**
```
https://app.parlae.ca
https://parlae.ca
https://login.parlae.ca
```

**Authorized redirect URIs:**
```
https://app.parlae.ca/api/auth/callback/cognito
https://parlae-auth-2026.auth.us-east-2.amazoncognito.com/oauth2/idpresponse
```

### For Cognito (in Terraform)

**Callback URLs:**
```hcl
callback_urls = [
  "https://app.parlae.ca/api/auth/callback/cognito"
]
```

**Logout URLs:**
```hcl
logout_urls = [
  "https://app.parlae.ca"
]
```

### URL Format Explanation

**NextAuth Callback** (your app):
```
https://{YOUR_DOMAIN}/api/auth/callback/cognito
```
- This is where NextAuth expects the OAuth response
- Handled by Next.js API route

**Cognito IdP Response** (AWS):
```
https://{COGNITO_DOMAIN}.auth.{AWS_REGION}.amazoncognito.com/oauth2/idpresponse
```
- This is where Google sends the OAuth response
- Cognito processes it and redirects to your app

---

## 🔍 Troubleshooting

### Issue: "redirect_uri_mismatch" Error

**Cause**: Callback URL in Google doesn't match what Cognito is sending.

**Solution**:
1. Check the exact error message for the URL Google received
2. Add that EXACT URL to Google's authorized redirect URIs
3. Make sure there are no trailing slashes or typos

### Issue: Google Sign-In Button Not Showing

**Cause**: Frontend not configured with correct Cognito settings.

**Solution**:
1. Verify environment variables in `.env.local`:
```bash
COGNITO_CLIENT_ID=<from terraform output>
COGNITO_CLIENT_SECRET=<from terraform output>
COGNITO_ISSUER=https://cognito-idp.us-east-2.amazonaws.com/<user-pool-id>
```

2. Restart your development server

### Issue: "Invalid_client" Error

**Cause**: Client ID or secret mismatch.

**Solution**:
1. Verify Google Client ID in Terraform matches Google Console
2. Verify Google Client Secret is correct
3. Re-run terraform apply with correct values

### Issue: User Created but No Email

**Cause**: Attribute mapping not configured correctly.

**Solution**:
1. Check Cognito attribute mapping includes email
2. Verify Google OAuth scopes include email
3. Should be configured automatically by Terraform

### Issue: CORS Error

**Cause**: JavaScript origins not configured in Google.

**Solution**:
1. Add your domain to **Authorized JavaScript origins** in Google Console
2. Add both `https://app.parlae.ca` and `https://parlae.ca`

---

## 📋 Checklist

- [ ] Google Cloud project created
- [ ] OAuth consent screen configured
- [ ] OAuth 2.0 credentials created
- [ ] Client ID and Secret saved
- [ ] Authorized redirect URIs added to Google
- [ ] Terraform variables updated with Google credentials
- [ ] Terraform variables updated with Parlae domains
- [ ] Cognito callback URLs updated to Parlae
- [ ] Terraform applied successfully
- [ ] Google Identity Provider visible in Cognito
- [ ] config.sh updated with Google OAuth credentials
- [ ] SSM secrets script updated
- [ ] Frontend deployed with new configuration
- [ ] Google sign-in button appears on login page
- [ ] Google OAuth flow completes successfully
- [ ] User created in Cognito after Google login
- [ ] User can sign in again with Google

---

## 🔗 Useful Links

- **Google Cloud Console**: https://console.cloud.google.com
- **AWS Cognito Console**: https://console.aws.amazon.com/cognito
- **Google OAuth Documentation**: https://developers.google.com/identity/protocols/oauth2
- **Cognito Social Identity Providers**: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-social-idp.html
- **NextAuth Cognito Provider**: https://next-auth.js.org/providers/cognito

---

## 🎯 Summary

**What This Enables:**
- ✅ Users can sign in with their Google account
- ✅ No separate password to remember
- ✅ Email automatically verified (from Google)
- ✅ User profile auto-populated (name, email, picture)
- ✅ Seamless integration with existing Cognito setup

**Security Notes:**
- Google OAuth credentials are sensitive - keep them secret
- Use different credentials for dev/staging/production
- Review Google OAuth permissions quarterly
- Monitor failed login attempts in Google Console

---

**Ready to Deploy!** Follow the steps above and you'll have Google OAuth working in ~30 minutes! 🚀


