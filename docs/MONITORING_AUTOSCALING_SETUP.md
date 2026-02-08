# Advanced Monitoring & Auto-Scaling Setup

## Overview

This document describes the comprehensive monitoring and auto-scaling configuration added to handle high-traffic scenarios and ensure you're notified of infrastructure limits.

**Date:** January 23, 2026

## What's New

### 1. Request-Based Auto-Scaling

Previously, ECS services only scaled based on CPU and memory utilization. Now they also scale based on **actual request volume** from the Application Load Balancer.

#### Frontend & Backend Auto-Scaling Policies

Each service now has **three** independent scaling policies:

1. **CPU-based** (65% target)
   - Scales out: 60 seconds
   - Scales in: 120 seconds

2. **Memory-based** (70% target)
   - Scales out: 60 seconds
   - Scales in: 120 seconds

3. **Request Count-based** (1000 requests per target default)
   - Scales out: **30 seconds** (fast response to traffic spikes)
   - Scales in: 300 seconds (cautious scale-down)
   - **This is the most responsive policy for handling traffic surges**

### 2. Comprehensive CloudWatch Alarms

#### Critical Alarms (🚨)

These indicate immediate action required:

- **Aurora Max Capacity Reached** - Database cannot scale further
- **ALB Unhealthy Targets** - Service instances are failing health checks
- **ALB 5xx Errors High** - Application errors being returned to users
- **Frontend/Backend Service Unhealthy** - No running tasks

#### Warning Alarms (⚠️)

These indicate you should monitor or plan capacity increases:

- **Max Tasks Approaching** - Service approaching configured maximum (90% threshold)
- **Aurora Capacity High** - Database approaching max capacity (80% threshold)
- **High CPU/Memory** - Resources running hot (>80% CPU, >85% Memory)
- **Database Connections High** - Many concurrent database connections
- **Target Response Time High** - Slow application response (>2s)
- **Free Storage Low** - Database storage running low

#### Info Alarms (📈)

These are informational and indicate auto-scaling is working:

- **Request Surge** - High request volume detected (>10,000 req/min)

## Configuration Variables

### New Variables in `variables.tf`

```hcl
# Default notification email
variable "alert_emails" {
  default = ["rafa.inspired9@gmail.com"]
}

# Optional Slack webhook for notifications
variable "slack_webhook_url" {
  default = ""  # Set this to enable Slack notifications
  sensitive = true
}

# ECS task limits
variable "frontend_max_tasks" {
  default = 8  # Increase for higher traffic
}

variable "backend_max_tasks" {
  default = 8  # Increase for higher traffic
}

# Threshold for max tasks alarm (default 90%)
variable "ecs_max_tasks_threshold" {
  default = 0.9
}

# Target requests per ECS task
variable "alb_request_count_target" {
  default = 1000  # Adjust based on your application
}

# Aurora settings
variable "aurora_max_capacity" {
  default = 8  # ACUs
}

variable "aurora_capacity_utilization_threshold" {
  default = 0.8  # 80%
}
```

## How It Works

### Auto-Scaling Logic

1. **Traffic Spike Detected**: ALB sees increased requests
2. **Request-based policy triggers**: Within 30 seconds, new tasks are launched
3. **CPU/Memory policies kick in**: If resources are strained, additional tasks launched
4. **Multiple policies work together**: AWS uses the policy that recommends the most tasks

Example scenario:
- Normal: 2 frontend tasks handling 500 requests each (1000 total)
- Spike: Suddenly receiving 5000 requests
- Result: Request policy scales to 5 tasks (5000/1000 target)
- If CPU also high: Could scale up to 6-8 tasks based on multiple policies

### Alarm Notification Flow

```
CloudWatch Alarm Triggered
        ↓
    SNS Topic
        ↓
    ┌───┴───┐
    ↓       ↓
  Email   Slack (optional)
```

1. **Email**: Sent to all addresses in `alert_emails` list
2. **Slack**: If `slack_webhook_url` is configured, formatted message sent via Lambda

## Setup Instructions

### 1. Configure Email Notifications

The default email (`rafa.inspired9@gmail.com`) is already configured. To add more:

```hcl
# In terraform.tfvars or variables
alert_emails = [
  "rafa.inspired9@gmail.com",
  "team@example.com",
  "oncall@example.com"
]
```

**Important**: Each email address must confirm the SNS subscription by clicking the link in the confirmation email sent by AWS.

### 2. Configure Slack Notifications (Optional)

#### Step 1: Create Slack Webhook

1. Go to your Slack workspace: https://api.slack.com/apps
2. Create a new app or use existing
3. Enable "Incoming Webhooks"
4. Create a webhook for your desired channel
5. Copy the webhook URL (looks like: `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX`)

#### Step 2: Configure Terraform

Add to your `terraform.tfvars`:

```hcl
slack_webhook_url = "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

Or use environment variable:

```bash
export TF_VAR_slack_webhook_url="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

#### Step 3: Deploy

```bash
cd dentia-infra/infra/ecs
terraform plan
terraform apply
```

The Lambda function will be created automatically to handle Slack notifications.

### 3. Adjust Scaling Thresholds

#### For Higher Traffic Applications

If your application can handle more requests per task:

```hcl
alb_request_count_target = 2000  # Each task can handle 2000 req/min
```

#### For Lower Capacity Requirements

If you want to scale more aggressively:

```hcl
alb_request_count_target = 500  # Scale at 500 req/min per task
```

### 4. Increase Maximum Tasks

If you're hitting the max task limits frequently:

```hcl
frontend_max_tasks = 20  # Increase from 8 to 20
backend_max_tasks = 20
```

**Note**: Ensure your AWS account has sufficient ECS capacity limits. Request limit increases if needed.

### 5. Increase Database Capacity

If Aurora max capacity alarms are firing:

```hcl
aurora_max_capacity = 16  # Increase from 8 to 16 ACUs
```

## Monitoring Best Practices

### 1. Regular Review

Review CloudWatch dashboards weekly to understand:
- Normal traffic patterns
- Peak hours
- Scaling behavior
- Resource utilization trends

### 2. Alarm Tuning

After monitoring for a few weeks:
- Adjust thresholds if too many false alarms
- Add custom alarms for application-specific metrics
- Fine-tune scaling cooldown periods

### 3. Capacity Planning

When you receive "approaching max" alarms:
1. Review current capacity: `terraform state show aws_appautoscaling_target.frontend`
2. Check historical metrics in CloudWatch
3. Plan capacity increase during low-traffic period
4. Update variables and apply: `terraform apply`

### 4. Cost Optimization

Monitor costs in AWS Cost Explorer:
- Are you scaling too aggressively?
- Can you increase `scale_in_cooldown` to keep tasks running longer?
- Is the database scaling appropriately?

## Alarm Response Playbook

### 🚨 Aurora Max Capacity Reached

**Action**: Immediate
```bash
# Quick fix: Increase max capacity
cd dentia-infra/infra/ecs
# Edit terraform.tfvars
aurora_max_capacity = 16  # or higher
terraform apply

# Long-term: Optimize queries, add caching, review indexes
```

### 🚨 ALB 5xx Errors High

**Action**: Immediate
```bash
# Check application logs
aws logs tail /aws/ecs/dentia-backend --follow

# Check ECS task health
aws ecs describe-services --cluster dentia-prod --services dentia-prod-backend

# Review recent deployments - may need to rollback
```

### ⚠️ Max Tasks Approaching

**Action**: Within 24 hours
```bash
# Increase max tasks
cd dentia-infra/infra/ecs
# Edit terraform.tfvars
frontend_max_tasks = 16  # Double current limit
backend_max_tasks = 16
terraform apply
```

### ⚠️ High CPU/Memory

**Action**: Monitor and investigate

If sustained (>30 minutes):
1. Check for memory leaks in application
2. Profile CPU usage
3. Consider increasing task resources (CPU/Memory in task definition)
4. Or increase number of tasks (horizontal scaling)

### 📈 Request Surge

**Action**: None required (informational)

Auto-scaling will handle this. Monitor to ensure:
- Tasks are scaling up appropriately
- Response times remain acceptable
- No 5xx errors

## Testing Auto-Scaling

### Load Testing

Use a tool like Apache Bench or k6 to test scaling:

```bash
# Install k6
brew install k6

# Create test script
cat > load-test.js << 'EOF'
import http from 'k6/http';
import { sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 200 },  // Ramp to 200 users
    { duration: '5m', target: 200 },  // Stay at 200 users
    { duration: '2m', target: 0 },    // Ramp down
  ],
};

export default function() {
  http.get('https://app.dentiaapp.com/');
  sleep(1);
}
EOF

# Run test
k6 run load-test.js
```

Watch CloudWatch metrics during the test:
1. ALB RequestCount
2. ECS DesiredTaskCount
3. ECS RunningTaskCount
4. CPU/Memory utilization
5. Target response time

### Expected Behavior

- Tasks should scale up within 30-60 seconds of load increase
- All targets should remain healthy
- Response times should stay under 2 seconds
- After load decrease, tasks scale down after 5 minutes

## Slack Notification Format

Slack messages include:
- 🚨 **Color-coded** (Red=ALARM, Green=OK, Yellow=WARNING)
- **Alarm name** with link to CloudWatch console
- **Status** (ALARM/RESOLVED)
- **Severity** (CRITICAL/WARNING/INFO)
- **Reason** for the alarm
- **Timestamp**
- **Region**
- **Metric details** (threshold, current value)

Example:
```
🚨 dentia-prod-frontend-max-tasks-approaching
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status: ALARM               Severity: WARNING
Region: us-east-2           Time: 2026-01-23T00:30:00Z

Threshold Crossed: 1 out of the last 2 datapoints [7.0 (23/01/26 00:29:00)] 
was greater than or equal to the threshold (7.2) (minimum 2 datapoints for OK to ALARM transition).

Metric: DesiredTaskCount: 7.2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AWS CloudWatch
```

## Troubleshooting

### Email Notifications Not Received

1. Check SNS subscription status:
```bash
aws sns list-subscriptions-by-topic \
  --topic-arn $(terraform output -raw sns_topic_arn) \
  --region us-east-2
```

2. Look for "PendingConfirmation" - check spam folder for confirmation email

3. Resend confirmation:
```bash
aws sns subscribe \
  --topic-arn $(terraform output -raw sns_topic_arn) \
  --protocol email \
  --notification-endpoint your-email@example.com \
  --region us-east-2
```

### Slack Notifications Not Working

1. Check Lambda logs:
```bash
aws logs tail /aws/lambda/dentia-prod-slack-notification --follow
```

2. Test Lambda manually:
```bash
aws lambda invoke \
  --function-name dentia-prod-slack-notification \
  --payload '{"Records":[{"Sns":{"Message":"{\"AlarmName\":\"Test\",\"NewStateValue\":\"ALARM\",\"NewStateReason\":\"Test alarm\"}"}}]}' \
  response.json
```

3. Verify webhook URL is correct and not expired

### Scaling Not Working

1. Check auto-scaling policies:
```bash
aws application-autoscaling describe-scaling-policies \
  --service-namespace ecs \
  --resource-id service/dentia-prod/dentia-prod-frontend
```

2. Check CloudWatch metrics are being published:
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name RequestCountPerTarget \
  --dimensions Name=TargetGroup,Value=targetgroup/dentia-prod-frontend/xxx \
  --start-time 2026-01-23T00:00:00Z \
  --end-time 2026-01-23T01:00:00Z \
  --period 300 \
  --statistics Average
```

## Cost Implications

### Additional Costs

1. **CloudWatch Alarms**: $0.10 per alarm per month
   - ~20 alarms = ~$2/month

2. **SNS**: 
   - First 1,000 email notifications: Free
   - After: $2 per 100,000 notifications

3. **Lambda (if using Slack)**:
   - First 1 million requests: Free
   - After: $0.20 per 1 million requests
   - Essentially free for alarm notifications

4. **Auto-scaling**:
   - No additional cost for the policies themselves
   - Cost is for the actual running ECS tasks during scale-out

### Cost Optimization

- Most alarms should be in OK state most of the time
- Notifications only sent on state changes (not continuous)
- Lambda cold starts don't matter for alarm notifications
- Consider using Slack instead of SMS (which costs $0.75 per notification)

## Summary

This monitoring and auto-scaling setup provides:

✅ **Proactive scaling** based on actual request volume  
✅ **Early warning** before hitting capacity limits  
✅ **Multiple notification channels** (email + optional Slack)  
✅ **Comprehensive coverage** (ECS, ALB, RDS, network)  
✅ **Fast response** to traffic spikes (30-second scale-out)  
✅ **Peace of mind** knowing you'll be notified of issues  

The system is now production-ready for high-traffic scenarios! 🚀

