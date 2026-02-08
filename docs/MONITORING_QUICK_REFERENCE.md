# Monitoring & Auto-Scaling Quick Reference

## TL;DR

Your infrastructure now automatically scales based on **request volume** and notifies `rafa.inspired9@gmail.com` when limits are approached.

## Key Features

✅ **Auto-scales on request count** (not just CPU/memory)  
✅ **Scales up in 30 seconds** when traffic spikes  
✅ **20+ CloudWatch alarms** monitoring everything  
✅ **Email notifications** to configured addresses  
✅ **Optional Slack notifications** via webhook  

## Current Configuration

```bash
# View your current settings
cd dentia-infra/infra/ecs
terraform output

# Key values:
frontend_max_tasks:    8 tasks
backend_max_tasks:     8 tasks
aurora_max_capacity:   8 ACUs
alert_emails:          ["rafa.inspired9@gmail.com"]
```

## Quick Actions

### Add More Email Recipients

Edit `terraform.tfvars`:
```hcl
alert_emails = [
  "rafa.inspired9@gmail.com",
  "team@example.com"
]
```

### Enable Slack Notifications

1. Get webhook URL from: https://api.slack.com/apps
2. Add to `terraform.tfvars`:
```hcl
slack_webhook_url = "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

3. Apply:
```bash
terraform apply
```

### Increase Max Tasks

When you get "max tasks approaching" alarms:

```hcl
# In terraform.tfvars
frontend_max_tasks = 20  # Increase from 8
backend_max_tasks = 20
```

```bash
terraform apply
```

### Increase Database Capacity

When you get "Aurora capacity high" alarms:

```hcl
# In terraform.tfvars
aurora_max_capacity = 16  # Increase from 8
```

```bash
terraform apply
```

## What Triggers Auto-Scaling?

Your services scale up when **ANY** of these conditions are met:

| Metric | Threshold | Scale Out Time |
|--------|-----------|----------------|
| **Requests per target** | 1,000 req/min | **30 seconds** ⚡ |
| CPU Utilization | 65% | 60 seconds |
| Memory Utilization | 70% | 60 seconds |

**Most important**: Request-based scaling responds fastest to traffic spikes!

## Alarm Severity Levels

### 🚨 CRITICAL (Act Immediately)
- Aurora max capacity reached
- ALB returning 5xx errors
- Unhealthy targets in ALB
- No running tasks

### ⚠️ WARNING (Act within 24h)
- Approaching max tasks (90%)
- Aurora capacity high (80%)
- High CPU/Memory (>80%)
- Database connections high

### 📈 INFO (Monitoring only)
- Request surge detected
- Auto-scaling handling traffic

## Common Scenarios

### Scenario 1: Traffic Spike
```
10:00 AM - Normal traffic (1,000 req/min, 2 tasks)
10:05 AM - Spike to 5,000 req/min
10:05:30 - Auto-scales to 5 tasks ⚡
10:06 AM - Traffic handled smoothly
```

### Scenario 2: Approaching Limits
```
2:00 PM - 7 frontend tasks running (max is 8)
2:01 PM - ⚠️ Alarm: "frontend-max-tasks-approaching"
2:02 PM - Email sent to rafa.inspired9@gmail.com
Action: Increase frontend_max_tasks before hitting limit
```

### Scenario 3: Database at Max
```
3:00 PM - Aurora at 8 ACUs (configured max)
3:01 PM - 🚨 Alarm: "aurora-max-capacity-reached"
3:02 PM - Email + Slack notification sent
Action: Immediately increase aurora_max_capacity
```

## Where to View Metrics

### CloudWatch Console
```
https://console.aws.amazon.com/cloudwatch/home?region=us-east-2
```

Key dashboards to monitor:
- ECS → Clusters → dentia-prod
- Application ELB → Select your ALB
- RDS → aurora-dentia-prod

### Useful Metrics

**ECS Services:**
- DesiredTaskCount (should scale with load)
- RunningTaskCount (should match desired)
- CPUUtilization
- MemoryUtilization

**ALB:**
- RequestCount (total requests)
- RequestCountPerTarget (per task)
- TargetResponseTime (should be <2s)
- HTTPCode_Target_5XX_Count (should be 0)

**Aurora:**
- ServerlessDatabaseCapacity (current ACUs)
- DatabaseConnections
- CPUUtilization

## Testing

### Simple Load Test

```bash
# Install hey (HTTP load generator)
brew install hey

# Test with 100 concurrent users for 60 seconds
hey -z 60s -c 100 https://app.dentiaapp.com/

# Watch scaling in real-time
watch -n 5 'aws ecs describe-services \
  --cluster dentia-prod \
  --services dentia-prod-frontend \
  --query "services[0].[runningCount,desiredCount]" \
  --output table'
```

Expected behavior:
- Tasks increase within 30-60 seconds
- All targets stay healthy
- Response times stay under 2 seconds

## Troubleshooting

### Not Receiving Emails?

```bash
# Check SNS subscriptions
aws sns list-subscriptions-by-topic \
  --topic-arn $(cd dentia-infra/infra/ecs && terraform output -raw sns_topic_arn) \
  --region us-east-2

# If status is "PendingConfirmation", check spam folder
```

### Not Scaling Fast Enough?

Decrease the request target (scales more aggressively):

```hcl
alb_request_count_target = 500  # Lower from 1000
```

### Scaling Too Much?

Increase the request target (scales less aggressively):

```hcl
alb_request_count_target = 2000  # Higher from 1000
```

## Cost Estimates

| Component | Cost |
|-----------|------|
| CloudWatch Alarms (20) | ~$2/month |
| SNS Email Notifications | Free (under 1,000/month) |
| Lambda (Slack) | Free (under 1M requests) |
| Additional ECS Tasks | $0.04/hour per task |

**Example**: If you scale from 2 to 8 tasks for 1 hour during a spike:
- Additional cost: 6 tasks × 1 hour × $0.04 = $0.24

## Next Steps

1. ✅ Confirm SNS email subscription (check inbox)
2. ⚠️ Review and adjust max task limits for your expected traffic
3. 📊 Set up custom CloudWatch dashboard
4. 🔔 (Optional) Configure Slack webhook
5. 🧪 Run load test to verify auto-scaling

## Support

For issues or questions:
- Email: rafa.inspired9@gmail.com
- Check logs: `/docs/MONITORING_AUTOSCALING_SETUP.md`
- AWS Console: CloudWatch Alarms dashboard

## Summary

Your infrastructure is now production-ready with:
- ⚡ **Fast auto-scaling** (30-second response to traffic)
- 📊 **Comprehensive monitoring** (20+ alarms)
- 🔔 **Proactive alerts** (before hitting limits)
- 💰 **Cost-effective** (~$2/month for monitoring)

**You'll be notified before anything breaks!** 🚀

