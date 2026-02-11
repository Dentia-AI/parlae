# 🚀 Getting Started in 5 Minutes

## Prerequisites

Before you begin, ensure you have:

- [ ] AWS account with admin access
- [ ] Domain name (e.g., example.com)
- [ ] AWS CLI installed and configured
- [ ] Terraform >= 1.6.0
- [ ] Docker and Docker Compose
- [ ] Node.js >= 18 and pnpm

## Step 1: Generate Secrets

```bash
cd starter-kit
./scripts/generate-secrets.sh
```

Copy the output - you'll need these values!

## Step 2: Create Configuration

```bash
cp config.example.sh config.sh
nano config.sh
```

Fill in these essential values:

```bash
# Project Basics
PROJECT_NAME="myapp"              # Your project name
AWS_PROFILE="myapp"               # AWS CLI profile
AWS_REGION="us-east-2"            # AWS region

# Domains
APP_DOMAIN="app.example.com"
HUB_DOMAIN="hub.example.com"
APEX_DOMAIN="example.com"

# Paste secrets from Step 1
DB_MASTER_PASSWORD="..."
DISCOURSE_DB_PASSWORD="..."
NEXTAUTH_SECRET="..."
DISCOURSE_SSO_SECRET="..."

# Email (AWS SES - set up first in AWS Console)
SMTP_USERNAME="..."
SMTP_PASSWORD="..."
DEVELOPER_EMAIL="admin@example.com"
```

## Step 3: Configure AWS

```bash
aws configure --profile myapp
```

Enter your:
- AWS Access Key ID
- AWS Secret Access Key
- Default region (same as config.sh)
- Output format: json

## Step 4: Run Setup

```bash
./setup.sh
```

Choose **[1] Full Setup** and grab a coffee ☕

This takes **20-30 minutes** and sets up:
- ✅ VPC with public/private subnets
- ✅ Aurora PostgreSQL database
- ✅ Redis cache
- ✅ ECS clusters
- ✅ Application Load Balancer
- ✅ S3 buckets
- ✅ Cognito user pool
- ✅ Main application (Next.js + NestJS)
- ✅ Community forum (Discourse)

## Step 5: Configure DNS

After deployment completes, you'll see an ALB DNS name like:
```
myapp-alb-1234567890.us-east-2.elb.amazonaws.com
```

In your DNS provider (Route 53, Cloudflare, etc.), create CNAME records:

```
app.example.com  →  myapp-alb-1234567890.us-east-2.elb.amazonaws.com
hub.example.com  →  myapp-alb-1234567890.us-east-2.elb.amazonaws.com
api.example.com  →  myapp-alb-1234567890.us-east-2.elb.amazonaws.com
```

**Pro Tip:** Use Route 53 for automatic SSL certificate validation!

## Step 6: Configure Discourse OAuth2

1. Visit `https://hub.example.com/admin/site_settings/category/login`
2. Search for "oauth2"
3. Enable these settings:
   - `enable_local_logins` = **false**
   - `enable_google_oauth2_logins` = **false**
   - `oauth2_enabled` = **true**
4. Configure OAuth2 (values from deployment output):
   - `oauth2_client_id` = Your Cognito Client ID
   - `oauth2_client_secret` = Your Cognito Client Secret
   - `oauth2_authorize_url` = `https://cognito-idp.REGION.amazonaws.com/POOL_ID/oauth2/authorize`
   - `oauth2_token_url` = `https://cognito-idp.REGION.amazonaws.com/POOL_ID/oauth2/token`
   - `oauth2_user_json_url` = `https://cognito-idp.REGION.amazonaws.com/POOL_ID/oauth2/userInfo`
   - `oauth2_json_user_id_path` = `sub`
   - `oauth2_json_user_name_path` = `email`
   - `oauth2_json_user_email_path` = `email`
   - `oauth2_email_verified` = **true**

## Step 7: Test It Out!

1. Visit `https://app.example.com`
2. Sign up for an account
3. Click "Community" to visit forum
4. You should be auto-logged in! 🎉

## Common Issues

### "Cannot connect to database"
- Wait 2-3 minutes for RDS to fully initialize
- Check security groups allow ECS → RDS traffic

### "502 Bad Gateway"
- ECS tasks are still starting (check ECS console)
- Usually takes 3-5 minutes after deployment

### "Certificate validation failed"
- DNS not propagated yet (can take up to 48 hours)
- Use Route 53 for faster validation (5-10 minutes)

### "OAuth2 login fails"
- Double-check Cognito URLs in Discourse settings
- Ensure redirect URIs are configured in Cognito

## What's Next?

✅ **Customize Branding**
```bash
cd dentia/apps/frontend
# Update logos, colors in theme config
```

✅ **Add Features**
- Billing integration (Stripe)
- Team management
- Advanced permissions

✅ **Set Up Monitoring**
- Configure CloudWatch alarms
- Set up error tracking (Sentry)

✅ **Enable Backups**
```bash
# Automated backups are enabled by default
# Retention: 7 days
# Can be extended in terraform config
```

✅ **Launch!** 🚀

## Need Help?

- 📚 **Full Documentation:** `README.md`
- 🔧 **Troubleshooting:** `docs/TROUBLESHOOTING.md`
- 🏗️ **Architecture:** `docs/ARCHITECTURE.md`
- 📖 **Component Docs:** See individual README files

---

**Estimated Time:** 30-45 minutes (mostly automated)
**Estimated Cost:** ~$150-200/month for production workload

Happy building! 🎉

