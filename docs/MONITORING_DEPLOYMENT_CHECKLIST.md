# Monitoring & Auto-Scaling Deployment Checklist

## Pre-Deployment

- [ ] Review configuration changes
- [ ] Backup current Terraform state
- [ ] Ensure AWS credentials are configured
- [ ] Review current capacity limits

## Deployment Steps

### 1. Initialize Terraform (if needed)
```bash
cd /Users/shaunk/Projects/dentia-starter-kit/dentia-infra/infra/ecs
terraform init
```

### 2. Review Changes
```bash
terraform plan

# Expected changes:
# + ~20 new CloudWatch alarms
# + 4 new auto-scaling policies (memory + request-based)
# + Lambda function (if Slack configured)
# + SNS topic enhancements
# ~ Updated scaling target capacities
```

### 3. Apply Changes
```bash
terraform apply

# Type: yes
```

Expected output:
```
Apply complete! Resources: X added, Y changed, 0 destroyed.

Outputs:
alert_emails = <sensitive>
aurora_max_capacity = 8
backend_max_tasks = 8
frontend_max_tasks = 8
slack_notifications_enabled = "No"
sns_topic_arn = "arn:aws:sns:us-east-2:XXXX:dentia-prod-alerts"
```

### 4. Confirm Email Subscription

**Check email**: rafa.inspired9@gmail.com

Expected email from: `no-reply@sns.amazonaws.com`
Subject: `AWS Notification - Subscription Confirmation`

**Action**: Click "Confirm subscription" link

### 5. (Optional) Configure Slack

If you want Slack notifications:

1. Create Slack webhook:
   - Go to: https://api.slack.com/apps
   - Create app → Incoming Webhooks
   - Copy webhook URL

2. Add to configuration:
```bash
cd /Users/shaunk/Projects/dentia-starter-kit/dentia-infra/infra/ecs

# Option 1: Add to terraform.tfvars
echo 'slack_webhook_url = "https://hooks.slack.com/services/YOUR/WEBHOOK"' >> terraform.tfvars

# Option 2: Set environment variable
export TF_VAR_slack_webhook_url="https://hooks.slack.com/services/YOUR/WEBHOOK"
```

3. Apply again:
```bash
terraform apply
```

### 6. Verify Alarms Created

```bash
aws cloudwatch describe-alarms \
  --alarm-name-prefix dentia-prod \
  --region us-east-2 \
  --query 'MetricAlarms[*].[AlarmName,StateValue]' \
  --output table
```

Expected: ~20 alarms, all in "OK" or "INSUFFICIENT_DATA" state

### 7. Test Notifications

```bash
# Trigger test alarm (won't actually cause issues)
aws cloudwatch set-alarm-state \
  --alarm-name dentia-prod-alb-request-surge \
  --state-value ALARM \
  --state-reason "Testing notification system" \
  --region us-east-2

# Check email for notification
# Check Slack for message (if configured)

# Reset alarm
aws cloudwatch set-alarm-state \
  --alarm-name dentia-prod-alb-request-surge \
  --state-value OK \
  --state-reason "Test complete" \
  --region us-east-2
```

### 8. Verify Auto-Scaling Policies

```bash
aws application-autoscaling describe-scaling-policies \
  --service-namespace ecs \
  --resource-id service/dentia-prod/dentia-prod-frontend \
  --region us-east-2

# Should show:
# - CPU-based policy
# - Memory-based policy
# - ALB Request Count-based policy
```

### 9. Run Load Test (Optional but Recommended)

```bash
# Install hey
brew install hey

# Generate load for 2 minutes
hey -z 120s -c 50 https://app.dentiaapp.com/

# In another terminal, watch scaling
watch -n 5 'aws ecs describe-services \
  --cluster dentia-prod \
  --services dentia-prod-frontend \
  --region us-east-2 \
  --query "services[0].[runningCount,desiredCount,serviceName]" \
  --output table'
```

**Expected behavior**:
- Tasks increase from 1-2 to 3-5+ within 60 seconds
- All targets remain healthy
- Tasks scale back down after ~5 minutes

## Post-Deployment Monitoring

### Week 1

- [ ] Monitor alarm states daily
- [ ] Check email notifications are arriving
- [ ] Review auto-scaling events
- [ ] Note baseline metrics (avg tasks, requests, DB capacity)

### Week 2-4

- [ ] Analyze scaling patterns
- [ ] Tune thresholds if needed
- [ ] Adjust max task limits based on peak usage
- [ ] Review false positive rate (<5% is good)

## Configuration Tuning

### If Scaling Too Aggressively

Increase request target:
```hcl
alb_request_count_target = 2000  # Up from 1000
```

### If Scaling Too Slowly

Decrease request target:
```hcl
alb_request_count_target = 500   # Down from 1000
```

### If Hitting Max Tasks Frequently

Increase limits:
```hcl
frontend_max_tasks = 20  # Up from 8
backend_max_tasks = 20   # Up from 8
```

### If Database At Capacity

Increase Aurora:
```hcl
aurora_max_capacity = 16  # Up from 8
```

After any change:
```bash
terraform apply
```

## Troubleshooting

### Email Not Received

```bash
# Check subscription status
aws sns list-subscriptions-by-topic \
  --topic-arn $(terraform output -raw sns_topic_arn) \
  --region us-east-2

# If "PendingConfirmation", check spam folder
# Resend confirmation:
aws sns subscribe \
  --topic-arn $(terraform output -raw sns_topic_arn) \
  --protocol email \
  --notification-endpoint rafa.inspired9@gmail.com \
  --region us-east-2
```

### Slack Not Working

```bash
# Check Lambda logs
aws logs tail /aws/lambda/dentia-prod-slack-notification \
  --follow \
  --region us-east-2

# Test Lambda directly
aws lambda invoke \
  --function-name dentia-prod-slack-notification \
  --payload '{"Records":[{"Sns":{"Message":"{\"AlarmName\":\"Test\",\"NewStateValue\":\"ALARM\",\"NewStateReason\":\"Test\"}"}}]}' \
  --region us-east-2 \
  response.json

cat response.json
```

### Auto-Scaling Not Working

```bash
# Check scaling activities
aws application-autoscaling describe-scaling-activities \
  --service-namespace ecs \
  --resource-id service/dentia-prod/dentia-prod-frontend \
  --region us-east-2 \
  --max-results 20

# Check CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name RequestCountPerTarget \
  --dimensions Name=TargetGroup,Value=targetgroup/dentia-prod-frontend/XXXXX \
  --start-time $(date -u -v-1H +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average \
  --region us-east-2
```

## Rollback Procedure

If you need to revert:

```bash
cd /Users/shaunk/Projects/dentia-starter-kit/dentia-infra/infra/ecs

# Show recent commits
git log --oneline -10

# Revert specific files
git checkout <previous-commit-hash> -- variables.tf services.tf monitoring.tf outputs.tf

# Or revert all changes
git checkout <previous-commit-hash> .

# Apply old configuration
terraform apply
```

## Success Criteria

✅ All checkpoints completed  
✅ Email notifications received  
✅ Alarms showing in CloudWatch  
✅ Auto-scaling policies active  
✅ Load test shows scaling behavior  
✅ No errors in Terraform apply  

## Support Resources

- **Comprehensive Guide**: `/docs/MONITORING_AUTOSCALING_SETUP.md`
- **Quick Reference**: `/docs/MONITORING_QUICK_REFERENCE.md`
- **Changes Summary**: `/docs/MONITORING_CHANGES_SUMMARY.md`
- **This Checklist**: `/docs/MONITORING_DEPLOYMENT_CHECKLIST.md`

## Contact

**Primary Contact**: rafa.inspired9@gmail.com

## Sign-Off

- [ ] Deployment completed successfully
- [ ] Notifications tested and working
- [ ] Team notified of new monitoring
- [ ] Documentation reviewed
- [ ] Post-deployment monitoring plan in place

**Deployed By**: _________________  
**Date**: _________________  
**Notes**: _________________

