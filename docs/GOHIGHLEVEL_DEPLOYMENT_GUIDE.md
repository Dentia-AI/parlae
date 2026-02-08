# GoHighLevel Deployment Guide

This guide walks you through deploying the GHL integration to production.

## 📋 Pre-Deployment Checklist

Before deploying, ensure:

- [ ] Local testing completed successfully
- [ ] Chat widget tested and working locally
- [ ] Calendar booking tested and working locally
- [ ] Contact sync verified (already working)
- [ ] All credentials validated in GHL dashboard
- [ ] AWS CLI configured with appropriate profile
- [ ] Access to production environment

---

## 🚀 Deployment Steps

### Step 1: Add Credentials to AWS Parameter Store

The GHL credentials are included in the main `put-ssm-secrets.sh` script along with all other production secrets.

#### Run the Script

```bash
cd /Users/shaunk/Projects/Dentia/dentia-infra

# Using default profile and region (dentia, us-east-2)
./infra/scripts/put-ssm-secrets.sh

# Or specify custom profile and region
./infra/scripts/put-ssm-secrets.sh your-profile us-west-2
```

This will add all secrets including the GHL credentials below.

This will add the following GHL parameters (among all other secrets):

**Note**: Actual credential values are in the private `dentia-infra` repository's `put-ssm-secrets.sh` script.

| Parameter | Type | Description |
|-----------|------|-------------|
| `/dentia/shared/GHL_API_KEY` | SecureString | GoHighLevel API key |
| `/dentia/shared/GHL_LOCATION_ID` | String | GoHighLevel location ID |
| `/dentia/frontend/GHL_API_KEY` | SecureString | GoHighLevel API key (frontend) |
| `/dentia/frontend/GHL_LOCATION_ID` | String | GoHighLevel location ID |
| `/dentia/frontend/NEXT_PUBLIC_GHL_WIDGET_ID` | String | Chat widget ID |
| `/dentia/frontend/NEXT_PUBLIC_GHL_LOCATION_ID` | String | Location ID (public) |
| `/dentia/frontend/NEXT_PUBLIC_GHL_CALENDAR_ID` | String | Calendar ID |

#### Verify Parameters

```bash
aws ssm get-parameters-by-path \
  --path /dentia/production \
  --region us-east-2 \
  --profile dentia \
  --recursive \
  --query 'Parameters[?contains(Name, `GHL`)].Name'
```

### Step 2: Update ECS Task Definition

Your ECS task definition needs to include the new environment variables.

#### For Frontend Service

Add these environment variables to your frontend ECS task definition:

```json
{
  "name": "frontend",
  "environment": [
    {
      "name": "NEXT_PUBLIC_GHL_WIDGET_ID",
      "value": "YOUR_WIDGET_ID"
    },
    {
      "name": "NEXT_PUBLIC_GHL_LOCATION_ID",
      "value": "YOUR_LOCATION_ID"
    },
    {
      "name": "NEXT_PUBLIC_GHL_CALENDAR_ID",
      "value": "YOUR_CALENDAR_ID"
    }
  ],
  "secrets": [
    {
      "name": "GHL_API_KEY",
      "valueFrom": "/dentia/production/GHL_API_KEY"
    },
    {
      "name": "GHL_LOCATION_ID",
      "valueFrom": "/dentia/production/GHL_LOCATION_ID"
    }
  ]
}
```

**Note**: `NEXT_PUBLIC_*` variables are safe as environment variables (not secrets) since they're public-facing.

#### Update via Terraform (if using)

If you're managing infrastructure with Terraform, update your ECS task definition:

**File**: `dentia-infra/infra/ecs/services.tf`

```hcl
resource "aws_ecs_task_definition" "frontend" {
  # ... existing configuration ...
  
  container_definitions = jsonencode([
    {
      name  = "frontend"
      # ... existing configuration ...
      
      environment = [
        # ... existing environment variables ...
        
        # GoHighLevel Client-side
        # Note: Replace with actual values from private dentia-infra repo
        {
          name  = "NEXT_PUBLIC_GHL_WIDGET_ID"
          value = "YOUR_WIDGET_ID"
        },
        {
          name  = "NEXT_PUBLIC_GHL_LOCATION_ID"
          value = "YOUR_LOCATION_ID"
        },
        {
          name  = "NEXT_PUBLIC_GHL_CALENDAR_ID"
          value = "YOUR_CALENDAR_ID"
        }
      ]
      
      secrets = [
        # ... existing secrets ...
        
        # GoHighLevel Server-side
        {
          name      = "GHL_API_KEY"
          valueFrom = "/dentia/production/GHL_API_KEY"
        },
        {
          name      = "GHL_LOCATION_ID"
          valueFrom = "/dentia/production/GHL_LOCATION_ID"
        }
      ]
    }
  ])
}
```

Then apply:

```bash
cd dentia-infra/infra/ecs
terraform plan
terraform apply
```

### Step 3: Rebuild and Deploy Frontend

#### Build New Docker Image

```bash
cd /Users/shaunk/Projects/Dentia/dentia

# Build frontend with GHL integration
docker build -f infra/docker/frontend.Dockerfile -t dentia-frontend:latest .

# Tag for ECR
docker tag dentia-frontend:latest YOUR_ECR_REPO:latest

# Push to ECR
docker push YOUR_ECR_REPO:latest
```

#### Deploy to ECS

```bash
# Update ECS service to use new task definition
aws ecs update-service \
  --cluster dentia-cluster \
  --service frontend-service \
  --task-definition frontend:LATEST \
  --force-new-deployment \
  --region us-east-2 \
  --profile dentia
```

Or use your deployment script:

```bash
# If you have a deployment script
./scripts/deploy-frontend.sh
```

### Step 4: Verify Deployment

#### Check Service Status

```bash
aws ecs describe-services \
  --cluster dentia-cluster \
  --services frontend-service \
  --region us-east-2 \
  --profile dentia \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount}'
```

#### Check Container Logs

```bash
# Get the task ARN
TASK_ARN=$(aws ecs list-tasks \
  --cluster dentia-cluster \
  --service-name frontend-service \
  --region us-east-2 \
  --profile dentia \
  --query 'taskArns[0]' \
  --output text)

# View logs
aws logs tail /ecs/frontend \
  --follow \
  --region us-east-2 \
  --profile dentia
```

Look for `[GHL Chat]` log messages indicating the widget is loading.

---

## ✅ Post-Deployment Testing

### Test Chat Widget

1. Visit your production site: `https://app.dentiaapp.com`
2. Look for the chat button (usually bottom-right corner)
3. Click and open the chat
4. Send a test message
5. Check GHL dashboard for the message

### Test Calendar

1. Navigate to: `https://app.dentiaapp.com/home/booking`
2. Verify calendar loads with available dates
3. Try booking an appointment
4. Complete the booking form
5. Check GHL dashboard for the appointment

### Test Contact Sync

1. Create a new test account
2. Check GHL Contacts for the new entry
3. Verify tags are applied correctly
4. Confirm data is accurate

### Check Browser Console

Open browser DevTools (F12) and check for:

```
✅ [GHL Chat] Widget loaded successfully
```

If you see errors, check:
- Environment variables are set correctly
- Widget ID is valid
- GHL subscription is active

---

## 🔍 Monitoring & Debugging

### CloudWatch Logs

Monitor GHL-related logs:

```bash
aws logs filter-log-events \
  --log-group-name /ecs/frontend \
  --filter-pattern "[GHL]" \
  --region us-east-2 \
  --profile dentia \
  --start-time $(date -u -d '1 hour ago' +%s)000
```

### GHL Dashboard Monitoring

In your GoHighLevel dashboard:

1. **Conversations**: Monitor incoming chat messages
2. **Calendars**: Check booking activity
3. **Contacts**: Verify new registrations are syncing
4. **Activity Log**: Review all GHL API activity

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Chat not appearing | Widget ID not set | Check ECS env vars |
| Calendar not loading | Calendar ID incorrect | Verify parameter value |
| 401 API errors | API key invalid | Check SSM parameter |
| 403 Forbidden | Location ID mismatch | Verify location ID |
| Widget loads but doesn't work | GHL subscription issue | Check GHL account status |

---

## 🔒 Security Best Practices

### 1. Environment Variables

✅ **DO**:
- Use SSM Parameter Store for sensitive data
- Use `SecureString` type for API keys
- Set `NEXT_PUBLIC_*` only for truly public values

❌ **DON'T**:
- Hardcode credentials in code
- Put API keys in public env vars
- Commit credentials to Git

### 2. IAM Permissions

Ensure your ECS task role has permissions to read SSM parameters:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath"
      ],
      "Resource": [
        "arn:aws:ssm:us-east-2:*:parameter/dentia/production/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": [
        "arn:aws:kms:us-east-2:*:key/*"
      ]
    }
  ]
}
```

### 3. API Key Rotation

Schedule regular API key rotation:

1. Generate new API key in GHL
2. Update SSM parameter
3. Deploy new task definition
4. Revoke old API key after verification

---

## 📊 Performance Monitoring

### Key Metrics to Watch

1. **Chat Widget Load Time**
   - Should load within 1-2 seconds
   - Monitor in browser DevTools

2. **Calendar Embed Performance**
   - Should render within 2-3 seconds
   - Monitor page load times

3. **API Call Success Rate**
   - Monitor contact sync success
   - Check GHL API logs
   - Set up CloudWatch alarms

### CloudWatch Alarms

Create alarms for:

```bash
# GHL API errors
aws cloudwatch put-metric-alarm \
  --alarm-name ghl-api-errors \
  --alarm-description "Alert on GHL API failures" \
  --metric-name ErrorCount \
  --namespace AWS/ECS \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold
```

---

## 🔄 Rollback Procedure

If issues occur after deployment:

### Quick Rollback

```bash
# Revert to previous task definition
aws ecs update-service \
  --cluster dentia-cluster \
  --service frontend-service \
  --task-definition frontend:PREVIOUS_VERSION \
  --force-new-deployment \
  --region us-east-2 \
  --profile dentia
```

### Remove GHL Integration

If you need to temporarily disable GHL features:

1. **Remove Chat Widget**: Comment out `<GHLChatWidget />` in layout
2. **Disable Contact Sync**: Remove `GHL_API_KEY` from env vars
3. **Hide Booking Page**: Add route guard or hide from navigation

Redeploy without GHL environment variables.

---

## 📈 Scaling Considerations

### High Traffic Scenarios

If expecting high traffic:

1. **GHL Rate Limits**: Monitor API rate limits in GHL dashboard
2. **Widget Load**: Chat widget loads from GHL CDN (highly available)
3. **Calendar Capacity**: Ensure adequate time slots in GHL
4. **Contact Sync**: Queue sync operations if needed

### Multi-Region Deployment

If deploying to multiple regions:

- Use same GHL credentials across regions
- Monitor each region's integration separately
- Consider region-specific calendars if needed

---

## ✅ Deployment Checklist

- [ ] SSM parameters added
- [ ] ECS task definition updated
- [ ] New Docker image built
- [ ] Image pushed to ECR
- [ ] ECS service updated
- [ ] Deployment completed successfully
- [ ] Chat widget tested in production
- [ ] Calendar booking tested in production
- [ ] Contact sync verified
- [ ] CloudWatch logs checked
- [ ] GHL dashboard verified
- [ ] Error monitoring set up
- [ ] Team notified of new features

---

## 📞 Support

### AWS Issues
- Check CloudWatch logs
- Verify IAM permissions
- Review ECS task status

### GHL Issues
- Check GHL subscription status
- Verify API key is active
- Contact GHL support if needed

### Integration Issues
- Review browser console errors
- Check environment variables
- Verify widget/calendar IDs

---

## 📚 Additional Resources

- [AWS SSM Parameter Store Docs](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)
- [ECS Task Definition Docs](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definitions.html)
- [GHL API Docs](https://highlevel.stoplight.io/)
- [Local Setup Guide](./GOHIGHLEVEL_QUICK_START_CHAT_CALENDAR.md)

---

**Last Updated**: November 2024  
**Status**: Ready for Production Deployment

