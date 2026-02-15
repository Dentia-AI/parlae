#!/bin/bash
set -e

cd /Users/shaunk/Projects/Parlae-AI/parlae-infra/infra/ecs

echo "🔧 Importing all existing AWS resources that are missing from Terraform state..."
echo ""

# Import Auto-scaling Targets
echo "1️⃣ Importing auto-scaling targets..."
terraform import 'aws_appautoscaling_target.frontend' service/parlae-cluster/parlae-frontend/ecs:service:DesiredCount/ecs || echo "  Already imported"
terraform import 'aws_appautoscaling_target.backend' service/parlae-cluster/parlae-backend/ecs:service:DesiredCount/ecs || echo "  Already imported"

# Import Auto-scaling Policies
echo ""
echo "2️⃣ Importing auto-scaling policies..."
POLICIES=$(aws application-autoscaling describe-scaling-policies --service-namespace ecs --region us-east-2 --profile parlae --query 'ScalingPolicies[*].{Name:PolicyName,Arn:PolicyARN}' --output json)

# Frontend policies
terraform import 'aws_appautoscaling_policy.frontend_cpu' service/parlae-cluster/parlae-frontend/ecs:service:DesiredCount/ecs/parlae-frontend-cpu-scaling || echo "  Already imported"
terraform import 'aws_appautoscaling_policy.frontend_memory' service/parlae-cluster/parlae-frontend/ecs:service:DesiredCount/ecs/parlae-frontend-memory-scaling || echo "  Already imported"
terraform import 'aws_appautoscaling_policy.frontend_alb_requests' service/parlae-cluster/parlae-frontend/ecs:service:DesiredCount/ecs/parlae-frontend-alb-requests-scaling || echo "  Already imported"

# Backend policies
terraform import 'aws_appautoscaling_policy.backend_cpu' service/parlae-cluster/parlae-backend/ecs:service:DesiredCount/ecs/parlae-backend-cpu-scaling || echo "  Already imported"
terraform import 'aws_appautoscaling_policy.backend_memory' service/parlae-cluster/parlae-backend/ecs:service:DesiredCount/ecs/parlae-backend-memory-scaling || echo "  Already imported"
terraform import 'aws_appautoscaling_policy.backend_alb_requests' service/parlae-cluster/parlae-backend/ecs:service:DesiredCount/ecs/parlae-backend-alb-requests-scaling || echo "  Already imported"

# Import CloudWatch Alarms
echo ""
echo "3️⃣ Importing CloudWatch alarms..."
ALARMS=(
  "parlae-alb-5xx-errors-high:aws_cloudwatch_metric_alarm.alb_5xx_errors_high"
  "parlae-alb-request-surge:aws_cloudwatch_metric_alarm.alb_request_surge"
  "parlae-alb-target-response-time-high:aws_cloudwatch_metric_alarm.alb_target_response_time_high"
  "parlae-alb-unhealthy-targets-backend:aws_cloudwatch_metric_alarm.alb_unhealthy_targets_backend"
  "parlae-alb-unhealthy-targets-frontend:aws_cloudwatch_metric_alarm.alb_unhealthy_targets_frontend"
  "parlae-aurora-capacity-high:aws_cloudwatch_metric_alarm.aurora_capacity_high"
  "parlae-aurora-connections-high:aws_cloudwatch_metric_alarm.aurora_database_connections_high"
  "parlae-aurora-cpu-high:aws_cloudwatch_metric_alarm.aurora_cpu_high"
  "parlae-aurora-free-storage-low:aws_cloudwatch_metric_alarm.aurora_free_storage_low"
  "parlae-aurora-max-capacity-reached:aws_cloudwatch_metric_alarm.aurora_max_capacity_reached"
  "parlae-backend-cpu-high:aws_cloudwatch_metric_alarm.backend_cpu_high"
  "parlae-backend-max-tasks-approaching:aws_cloudwatch_metric_alarm.backend_max_tasks_approaching"
  "parlae-backend-memory-high:aws_cloudwatch_metric_alarm.backend_memory_high"
  "parlae-backend-running:aws_cloudwatch_metric_alarm.backend_service_unhealthy"
  "parlae-bastion-auto-recover:aws_cloudwatch_metric_alarm.bastion_auto_recover"
  "parlae-frontend-cpu-high:aws_cloudwatch_metric_alarm.frontend_cpu_high"
  "parlae-frontend-max-tasks-approaching:aws_cloudwatch_metric_alarm.frontend_max_tasks_approaching"
  "parlae-frontend-memory-high:aws_cloudwatch_metric_alarm.frontend_memory_high"
  "parlae-frontend-running:aws_cloudwatch_metric_alarm.frontend_service_unhealthy"
)

for alarm in "${ALARMS[@]}"; do
  IFS=':' read -r alarm_name tf_resource <<< "$alarm"
  echo "  Importing $alarm_name..."
  terraform import "$tf_resource" "$alarm_name" 2>&1 | grep -E "(Import successful|already managed)" || echo "    Skipped"
done

# Import Route53 Records for ALB
echo ""
echo "4️⃣ Importing Route53 A records..."
DOMAINS=("parlae.ca" "www.parlae.ca" "app.parlae.ca" "api.parlae.ca" "hub.parlae.ca")

for domain in "${DOMAINS[@]}"; do
  echo "  Importing $domain..."
  terraform import "aws_route53_record.alb_alias[\"$domain\"]" Z03196283E80MK89TZ9Y4_${domain}_A 2>&1 | grep -E "(Import successful|already managed)" || echo "    Skipped"
done

# Import ALB Listener Rules
echo ""
echo "5️⃣ Importing ALB listener rules..."
LISTENER_ARN="arn:aws:elasticloadbalancing:us-east-2:234270344223:listener/app/parlae-alb/f77d642353b38e25/3d6d5cfc69dd668f"

# Get all rules for the listener
RULES=$(aws elbv2 describe-rules --listener-arn "$LISTENER_ARN" --region us-east-2 --profile parlae --query 'Rules[?!IsDefault].{Arn:RuleArn,Priority:Priority}' --output json)

# Try to import known rules
echo "  Getting listener rules..."
echo "$RULES" | jq -r '.[] | .Arn' | while read -r rule_arn; do
  priority=$(echo "$RULES" | jq -r --arg arn "$rule_arn" '.[] | select(.Arn == $arn) | .Priority')
  echo "  Rule priority $priority: $rule_arn"
done

# Import SNS topic subscription
echo ""
echo "6️⃣ Importing SNS topic subscription..."
SUB_ARN=$(aws sns list-subscriptions-by-topic --topic-arn arn:aws:sns:us-east-2:234270344223:parlae-alerts --region us-east-2 --profile parlae --query 'Subscriptions[0].SubscriptionArn' --output text 2>/dev/null || echo "")
if [ ! -z "$SUB_ARN" ] && [ "$SUB_ARN" != "None" ]; then
  terraform import 'aws_sns_topic_subscription.alert_email_subscribers["admin@parlae.ca"]' "$SUB_ARN" || echo "  Already imported"
fi

# Import S3 bucket public access block
echo ""
echo "7️⃣ Importing S3 bucket public access block..."
terraform import 'aws_s3_bucket_public_access_block.uploads' parlae-uploads-us-east-2 || echo "  Already imported"

echo ""
echo "✅ Import complete! Run 'terraform plan' to verify."
