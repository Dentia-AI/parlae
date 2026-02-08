# Quick Reference Card

## 🚀 Essential Commands

### Initial Setup
```bash
# 1. Generate secrets
./scripts/generate-secrets.sh

# 2. Create config
cp config.example.sh config.sh
nano config.sh

# 3. Run setup wizard
./setup.sh
```

### Deployment Commands
```bash
# Full deployment
./setup.sh  # Choose [4] Deploy Everything

# Infrastructure only
./scripts/deploy-infrastructure.sh

# Applications only
./scripts/deploy-applications.sh

# Main app only
./scripts/deploy-dentia.sh

# Forum only
./scripts/deploy-dentiahub.sh
```

### Monitoring Commands
```bash
# Check ECS services
aws ecs describe-services \
  --cluster ${PROJECT_NAME}-cluster \
  --profile ${AWS_PROFILE}

# Tail logs (frontend)
aws logs tail /ecs/${PROJECT_NAME}-frontend --follow

# Tail logs (backend)
aws logs tail /ecs/${PROJECT_NAME}-backend --follow

# Tail logs (forum)
aws logs tail /ecs/${PROJECT_NAME}-discourse --follow

# Check RDS status
aws rds describe-db-clusters \
  --db-cluster-identifier ${PROJECT_NAME}-cluster \
  --profile ${AWS_PROFILE}

# Check Redis
aws elasticache describe-cache-clusters \
  --profile ${AWS_PROFILE}
```

### Debugging Commands
```bash
# Get ALB DNS
aws elbv2 describe-load-balancers \
  --names ${PROJECT_NAME}-alb \
  --profile ${AWS_PROFILE} \
  --query 'LoadBalancers[0].DNSName' \
  --output text

# List ECS tasks
aws ecs list-tasks \
  --cluster ${PROJECT_NAME}-cluster \
  --profile ${AWS_PROFILE}

# Get task details
aws ecs describe-tasks \
  --cluster ${PROJECT_NAME}-cluster \
  --tasks TASK_ID \
  --profile ${AWS_PROFILE}

# Check SSM parameters
aws ssm describe-parameters \
  --profile ${AWS_PROFILE}

# Get parameter value
aws ssm get-parameter \
  --name "/PARAM_NAME" \
  --with-decryption \
  --profile ${AWS_PROFILE}
```

### Database Commands
```bash
# Connect to database (from bastion/local)
psql -h RDS_ENDPOINT -U admin -d app_production

# Run migrations
cd dentia
pnpm prisma migrate deploy

# View database info
aws rds describe-db-clusters \
  --db-cluster-identifier ${PROJECT_NAME}-cluster \
  --profile ${AWS_PROFILE}
```

### Terraform Commands
```bash
# Main app infrastructure
cd dentia-infra
terraform init
terraform plan
terraform apply

# Forum infrastructure
cd dentiahub-infra/environments/production
terraform init
terraform plan
terraform apply

# View outputs
terraform output

# Destroy (careful!)
terraform destroy
```

### Docker Commands
```bash
# Build main app
cd dentia
docker-compose build

# Build forum
cd dentiahub
docker-compose build

# Run locally
docker-compose up

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## 📋 Configuration Checklist

### Before Deployment
- [ ] Copy `config.example.sh` to `config.sh`
- [ ] Generate secrets with `./scripts/generate-secrets.sh`
- [ ] Fill in all required values in `config.sh`
- [ ] Configure AWS CLI: `aws configure --profile ${PROJECT_NAME}`
- [ ] Verify AWS credentials: `aws sts get-caller-identity`
- [ ] Domain registered and accessible
- [ ] SES SMTP credentials (if using email)

### After Deployment
- [ ] Configure DNS (point to ALB)
- [ ] Wait for SSL certificate validation
- [ ] Configure OAuth2 in Discourse admin
- [ ] Test main app signup/login
- [ ] Test forum access
- [ ] Test SSO between apps
- [ ] Configure CloudWatch alarms
- [ ] Set up billing alerts
- [ ] Enable database backups
- [ ] Document custom configurations

## 🔧 Environment Variables

### Main App (.env)
```bash
# Auto-populated from config.sh
DATABASE_URL=
REDIS_URL=
NEXTAUTH_URL=
NEXTAUTH_SECRET=
COGNITO_CLIENT_ID=
COGNITO_CLIENT_SECRET=
COGNITO_ISSUER=
AWS_REGION=
S3_BUCKET=
```

### Forum (.env)
```bash
# Auto-populated from config.sh
DISCOURSE_HOSTNAME=
DISCOURSE_DB_HOST=
DISCOURSE_DB_PASSWORD=
DISCOURSE_REDIS_HOST=
DISCOURSE_S3_BUCKET=
COGNITO_CLIENT_ID=
COGNITO_CLIENT_SECRET=
```

## 🌐 URLs

### After Deployment
```bash
# Main application
https://app.example.com

# API endpoint
https://api.example.com

# Community forum
https://hub.example.com

# Forum admin
https://hub.example.com/admin

# Health checks
https://app.example.com/api/health
https://hub.example.com/health-check
```

### AWS Console URLs
```bash
# ECS Clusters
https://console.aws.amazon.com/ecs/home?region=${AWS_REGION}#/clusters

# RDS Databases
https://console.aws.amazon.com/rds/home?region=${AWS_REGION}#databases:

# CloudWatch Logs
https://console.aws.amazon.com/cloudwatch/home?region=${AWS_REGION}#logsV2:log-groups

# Cognito User Pools
https://console.aws.amazon.com/cognito/home?region=${AWS_REGION}

# Load Balancers
https://console.aws.amazon.com/ec2/v2/home?region=${AWS_REGION}#LoadBalancers:

# S3 Buckets
https://s3.console.aws.amazon.com/s3/buckets?region=${AWS_REGION}
```

## 🐛 Common Issues

### Deployment Fails
```bash
# Check credentials
aws sts get-caller-identity --profile ${AWS_PROFILE}

# Check Terraform state
cd dentia-infra && terraform state list

# Clean and retry
rm -rf .terraform && terraform init
```

### App Won't Start
```bash
# Check logs
aws logs tail /ecs/${PROJECT_NAME}-frontend --follow

# Check task status
aws ecs describe-tasks --cluster ${PROJECT_NAME}-cluster --tasks TASK_ID

# Force new deployment
aws ecs update-service \
  --cluster ${PROJECT_NAME}-cluster \
  --service ${PROJECT_NAME}-frontend \
  --force-new-deployment
```

### Database Connection Error
```bash
# Check RDS status
aws rds describe-db-clusters --profile ${AWS_PROFILE}

# Verify security groups
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=${PROJECT_NAME}-*" \
  --profile ${AWS_PROFILE}

# Test connection (from ECS)
nc -zv RDS_ENDPOINT 5432
```

### OAuth2 Not Working
```bash
# Verify Cognito config
aws cognito-idp describe-user-pool \
  --user-pool-id POOL_ID \
  --profile ${AWS_PROFILE}

# Check Discourse settings
# Visit: https://hub.example.com/admin/site_settings/category/login
# Verify all OAuth2 URLs are correct
```

## 📊 Cost Monitoring

### Set Up Billing Alerts
```bash
# AWS Console → Billing → Budgets
# Create budget alert for $200/month (adjust as needed)
```

### View Current Costs
```bash
# AWS Console → Cost Explorer
# Or use CLI:
aws ce get-cost-and-usage \
  --time-period Start=$(date -d '1 month ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost
```

## 🔐 Security Commands

### Rotate Secrets
```bash
# Generate new secrets
./scripts/generate-secrets.sh

# Update config.sh
nano config.sh

# Update in SSM
aws ssm put-parameter \
  --name "/PROJECT/PARAM" \
  --value "NEW_VALUE" \
  --overwrite \
  --profile ${AWS_PROFILE}

# Redeploy apps
./scripts/deploy-applications.sh
```

### Enable MFA
```bash
# Enable for IAM user
aws iam enable-mfa-device \
  --user-name USERNAME \
  --serial-number arn:aws:iam::ACCOUNT:mfa/USERNAME \
  --authentication-code1 CODE1 \
  --authentication-code2 CODE2
```

### Review Security Groups
```bash
# List all security groups
aws ec2 describe-security-groups \
  --profile ${AWS_PROFILE} \
  --query 'SecurityGroups[*].[GroupName,GroupId,Description]'

# Check specific group
aws ec2 describe-security-groups \
  --group-names ${PROJECT_NAME}-alb-sg \
  --profile ${AWS_PROFILE}
```

## 📦 Backup & Restore

### Create Backup
```bash
# Database snapshot
aws rds create-db-cluster-snapshot \
  --db-cluster-identifier ${PROJECT_NAME}-cluster \
  --db-cluster-snapshot-identifier backup-$(date +%Y%m%d-%H%M) \
  --profile ${AWS_PROFILE}

# Copy S3 bucket
aws s3 sync s3://SOURCE-BUCKET s3://BACKUP-BUCKET --profile ${AWS_PROFILE}
```

### Restore from Backup
```bash
# Restore database
aws rds restore-db-cluster-from-snapshot \
  --db-cluster-identifier ${PROJECT_NAME}-cluster-restored \
  --snapshot-identifier SNAPSHOT_ID \
  --engine aurora-postgresql \
  --profile ${AWS_PROFILE}

# Restore S3
aws s3 sync s3://BACKUP-BUCKET s3://SOURCE-BUCKET --profile ${AWS_PROFILE}
```

## 🔄 Update Commands

### Update Dependencies
```bash
# Main app
cd dentia
pnpm update
pnpm audit fix

# Rebuild and deploy
./scripts/deploy-dentia.sh
```

### Update Discourse
```bash
cd dentiahub
# Discourse version is in Dockerfile
# Update and rebuild
./scripts/build-and-deploy-discourse.sh production
```

### Update Infrastructure
```bash
cd dentia-infra
terraform plan
terraform apply
```

## 📞 Support Resources

- **Documentation:** `README.md`, `docs/`
- **Troubleshooting:** `docs/TROUBLESHOOTING.md`
- **Architecture:** `docs/ARCHITECTURE.md`
- **Getting Started:** `GETTING_STARTED.md`

---

**Quick Reference Version:** 1.0  
**Last Updated:** $(date +%Y-%m-%d)

