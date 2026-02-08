# Parlae OAuth Quick Reference Card

**Quick answers to common questions about Google OAuth & Cognito setup**

---

## 🔑 What Callback URLs Do I Need?

### For Google Cloud Console

Add these to **Authorized redirect URIs**:

```
https://app.parlae.ca/api/auth/callback/cognito
https://parlae-auth-2026.auth.us-east-2.amazoncognito.com/oauth2/idpresponse
```

### For Cognito (Already Configured in Terraform)

The Terraform configuration at `dentia-infra/infra/ecs/cognito.tf` already sets:

```hcl
callback_urls = [
  "https://${var.alb_hostname}/api/auth/callback/cognito"
]
```

You just need to update `var.alb_hostname` from `app.dentiaapp.com` → `app.parlae.ca`

---

## 📝 What Needs to Be Updated?

### 1. Terraform Variables (`dentia-infra/infra/ecs/variables.tf`)

**Change these defaults:**
```hcl
variable "profile" {
  default = "parlae"  # was: "dentia"
}

variable "project_name" {
  default = "parlae"  # was: "dentia"
}

variable "domain" {
  default = "parlae.ca"  # was: "dentiaapp.com"
}

variable "alb_hostname" {
  default = "app.parlae.ca"  # was: "app.dentiaapp.com"
}

variable "additional_cert_names" {
  default = ["api.parlae.ca"]  # was: ["api.dentiaapp.com"]
}

variable "cognito_custom_domain" {
  default = "login.parlae.ca"  # was: "login.dentiaapp.com"
}

# ADD YOUR GOOGLE CREDENTIALS:
variable "cognito_google_client_id" {
  default = "YOUR-CLIENT-ID.apps.googleusercontent.com"  # was: ""
}

variable "cognito_google_client_secret" {
  default = "YOUR-CLIENT-SECRET"  # was: ""
  sensitive = true
}
```

### 2. Environment File (`.env.production`)

**Current (wrong):**
```bash
NEXTAUTH_URL=https://app.dentiaapp.com
```

**Should be:**
```bash
NEXTAUTH_URL=https://app.parlae.ca
COGNITO_DOMAIN=parlae-auth-2026
```

This file should be updated by the `setup-local-env.sh` script, but verify it.

---

## 🚀 Quick Setup Steps

### 1. Get Google OAuth Credentials (10 minutes)

```
1. Go to: https://console.cloud.google.com
2. Create new project: "Parlae"
3. Enable Google+ API
4. Configure OAuth consent screen
5. Create OAuth 2.0 credentials (Web application)
6. Add redirect URIs (see above)
7. Save Client ID & Client Secret
```

### 2. Update Terraform (5 minutes)

```bash
cd /Users/shaunk/Projects/dentia/dentia-infra/infra/ecs

# Edit variables.tf - update all "dentia" → "parlae"
# Add Google Client ID and Secret

# OR use -var flags:
terraform plan \
  -var="project_name=parlae" \
  -var="alb_hostname=app.parlae.ca" \
  -var="domain=parlae.ca" \
  -var="cognito_google_client_id=YOUR-ID" \
  -var="cognito_google_client_secret=YOUR-SECRET"
```

### 3. Deploy (10 minutes)

```bash
terraform apply \
  -var="project_name=parlae" \
  -var="alb_hostname=app.parlae.ca" \
  -var="domain=parlae.ca" \
  -var="cognito_google_client_id=YOUR-ID" \
  -var="cognito_google_client_secret=YOUR-SECRET"
```

### 4. Get Cognito Domain & Update Google (2 minutes)

```bash
# Get the exact Cognito domain
terraform output cognito_domain
# Example output: parlae-auth-2026.auth.us-east-2.amazoncognito.com

# Go back to Google Console and add exact redirect URI:
# https://parlae-auth-2026.auth.us-east-2.amazoncognito.com/oauth2/idpresponse
```

### 5. Deploy Frontend (5 minutes)

```bash
cd /Users/shaunk/Projects/dentia
./setup.sh
# Choose: [5] Deploy Main App Only
```

---

## 🧪 How to Test

```bash
# 1. Go to your app
https://app.parlae.ca/auth/sign-in

# 2. You should see:
- Email/Password form
- "Sign in with Google" button  ← This is the new one!

# 3. Click "Sign in with Google"
# 4. Complete Google OAuth
# 5. You should be redirected back and logged in
```

---

## 🔍 Verification Checklist

**Google Console:**
- [ ] OAuth 2.0 Client created
- [ ] `https://app.parlae.ca/api/auth/callback/cognito` in redirect URIs
- [ ] `https://{cognito-domain}/oauth2/idpresponse` in redirect URIs
- [ ] Consent screen configured with parlae.ca domain

**Cognito (AWS Console):**
- [ ] User pool named `parlae-user-pool` exists
- [ ] "Google" appears in Identity Providers
- [ ] Callback URLs include `https://app.parlae.ca/api/auth/callback/cognito`
- [ ] App client has Google in supported providers

**Terraform:**
- [ ] All variables updated from "dentia" to "parlae"
- [ ] Google Client ID configured
- [ ] Google Client Secret configured
- [ ] Domain variables use parlae.ca

**Application:**
- [ ] `.env.production` has `NEXTAUTH_URL=https://app.parlae.ca`
- [ ] Login page shows "Sign in with Google" button
- [ ] Google OAuth flow completes successfully
- [ ] User created in Cognito after Google login

---

## ❓ FAQ

### Q: Do I need Google OAuth or can I skip it?

**A:** It's optional! Your app works fine with:
- Email/password sign-in (always available)
- Cognito credentials (built-in)

Google OAuth is an enhancement that lets users sign in with their Google account.

### Q: What's the difference between Cognito and NextAuth?

**A:** 
- **Cognito** = AWS service that stores users and handles OAuth
- **NextAuth** = Library that connects your Next.js app to Cognito
- They work together: NextAuth talks to Cognito, Cognito talks to Google

### Q: Why do I need two callback URLs?

**A:**
1. **Cognito callback**: `https://{cognito-domain}/oauth2/idpresponse`
   - Google sends OAuth response here first
   - Cognito processes it

2. **NextAuth callback**: `https://app.parlae.ca/api/auth/callback/cognito`
   - Cognito redirects here after processing
   - Your app receives the authenticated user

### Q: Can I test Google OAuth locally?

**A:** Yes, but it's tricky:
1. Use ngrok or similar to expose localhost
2. Add ngrok URL to Google's redirect URIs
3. Update NEXTAUTH_URL to ngrok URL

**Easier:** Just test in production after deployment.

### Q: What if I want Facebook/GitHub/etc login?

**A:** You can add more identity providers:
1. Add the provider in Cognito (AWS Console or Terraform)
2. Configure it like Google (client ID, secret)
3. Update the `supported_identity_providers` in Terraform
4. NextAuth will automatically show the button

---

## 🔗 Full Guides

**Detailed Setup:** See `PARLAE_GOOGLE_OAUTH_SETUP.md`  
**Troubleshooting:** See `PARLAE_GOOGLE_OAUTH_SETUP.md` - Troubleshooting section

---

## 📞 Quick Help

**Google redirect_uri_mismatch:**
```
→ Copy the EXACT URL from the error message
→ Add it to Google Console redirect URIs
→ No trailing slash, no typos
```

**Google button not showing:**
```
→ Check COGNITO_CLIENT_ID in environment
→ Check COGNITO_CLIENT_SECRET in environment
→ Restart development server
```

**Invalid client error:**
```
→ Verify Google Client ID in Terraform
→ Verify Client Secret is correct
→ Re-run terraform apply
```

---

**Total Setup Time:** ~30 minutes  
**Difficulty:** Medium  
**Required:** Google account, AWS access, Terraform knowledge


