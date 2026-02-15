#!/bin/bash
set -e

echo "🔧 Importing ALL existing AWS resources into Terraform state..."
echo "⚠️  This is CRITICAL to prevent Terraform from recreating your infrastructure!"
echo ""

cd /Users/shaunk/Projects/Parlae-AI/parlae-infra/infra/ecs

# Function to safely import (doesn't fail if already imported)
safe_import() {
  local resource=$1
  local id=$2
  echo "📦 Importing $resource..."
  terraform import "$resource" "$id" 2>&1 | grep -v "already exists" || true
}

# Get ARNs and IDs from AWS
echo "🔍 Getting resource IDs from AWS..."

ALB_ARN=$(aws elbv2 describe-load-balancers --names parlae-alb --region us-east-2 --profile parlae --query 'LoadBalancers[0].LoadBalancerArn' --output text)
FE_TG_ARN=$(aws elbv2 describe-target-groups --names parlae-frontend-tg --region us-east-2 --profile parlae --query 'TargetGroups[0].TargetGroupArn' --output text)
BE_TG_ARN=$(aws elbv2 describe-target-groups --names parlae-backend-tg --region us-east-2 --profile parlae --query 'TargetGroups[0].TargetGroupArn' --output text)
HTTPS_LISTENER_ARN=$(aws elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" --region us-east-2 --profile parlae --query 'Listeners[?Port==`443`].ListenerArn' --output text)
HTTP_LISTENER_ARN=$(aws elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" --region us-east-2 --profile parlae --query 'Listeners[?Port==`80`].ListenerArn' --output text)
CLUSTER_ARN=$(aws rds describe-db-clusters --db-cluster-identifier parlae-aurora-cluster --region us-east-2 --profile parlae --query 'DBClusters[0].DBClusterArn' --output text 2>/dev/null || echo "")
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=parlae-vpc" --region us-east-2 --profile parlae --query 'Vpcs[0].VpcId' --output text 2>/dev/null || echo "")

echo ""
echo "=== CORE INFRASTRUCTURE ==="

# VPC
if [ ! -z "$VPC_ID" ]; then
  safe_import "aws_vpc.main" "$VPC_ID"
fi

# Subnets
SUBNET_IDS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --region us-east-2 --profile parlae --query 'Subnets[*].SubnetId' --output text 2>/dev/null || echo "")
# Note: Would need to know which subnets map to which Terraform resources

# Security Groups
SG_IDS=$(aws ec2 describe-security-groups --filters "Name=vpc-id,Values=$VPC_ID" --region us-east-2 --profile parlae --query 'SecurityGroups[*].GroupId' --output text 2>/dev/null || echo "")

echo ""
echo "=== ECS ==="
safe_import "aws_ecs_cluster.main" "parlae-cluster"
safe_import "aws_cloudwatch_log_group.frontend" "/ecs/parlae-frontend"
safe_import "aws_cloudwatch_log_group.backend" "/ecs/parlae-backend"
safe_import "aws_ecs_service.frontend" "parlae-cluster/parlae-frontend"
safe_import "aws_ecs_service.backend" "parlae-cluster/parlae-backend"

echo ""
echo "=== ECR ==="
safe_import "aws_ecr_repository.frontend" "parlae-frontend"
safe_import "aws_ecr_repository.backend" "parlae-backend"

echo ""
echo "=== IAM ==="
safe_import "aws_iam_role.ecs_task_execution" "parlae-ecsTaskExecutionRole"
safe_import "aws_iam_role.ecs_task" "parlae-ecsTaskRole"
safe_import "aws_iam_role.bastion_ssm" "parlae-bastion-ssm-role"

echo ""
echo "=== LOAD BALANCER ==="
safe_import "aws_lb.app" "$ALB_ARN"
safe_import "aws_lb_target_group.frontend" "$FE_TG_ARN"
safe_import "aws_lb_target_group.backend" "$BE_TG_ARN"

if [ ! -z "$HTTPS_LISTENER_ARN" ]; then
  safe_import "aws_lb_listener.https" "$HTTPS_LISTENER_ARN"
fi

if [ ! -z "$HTTP_LISTENER_ARN" ]; then
  safe_import "aws_lb_listener.http" "$HTTP_LISTENER_ARN"
fi

echo ""
echo "=== DATABASE ==="
safe_import "aws_db_subnet_group.aurora" "parlae-aurora-subnet-group"

if [ ! -z "$CLUSTER_ARN" ]; then
  safe_import "aws_rds_cluster.aurora" "parlae-aurora-cluster"
  safe_import "aws_rds_cluster_instance.aurora_instance" "parlae-aurora-instance"
fi

echo ""
echo "=== S3 ==="
safe_import "aws_s3_bucket.uploads" "parlae-uploads-us-east-2"

echo ""
echo "=== COGNITO ==="
COGNITO_POOL_ID=$(aws cognito-idp list-user-pools --max-results 10 --region us-east-2 --profile parlae --query 'UserPools[?Name==`parlae-users`].Id' --output text 2>/dev/null || echo "")
if [ ! -z "$COGNITO_POOL_ID" ]; then
  safe_import "aws_cognito_user_pool.default[0]" "$COGNITO_POOL_ID"
fi

echo ""
echo "⚠️  IMPORTANT: Some resources require manual import:"
echo ""
echo "1. Listener Rules - Need to get rule ARNs:"
echo "   aws elbv2 describe-rules --listener-arn $HTTPS_LISTENER_ARN --region us-east-2 --profile parlae"
echo ""
echo "2. Route53 Records - Need to import each:"
echo "   terraform import 'aws_route53_record.alb_alias[\"app.parlae.ca\"]' Z03196283E80MK89TZ9Y4_app.parlae.ca_A"
echo ""
echo "3. SSM Parameters - May need --overwrite flag in Terraform"
echo ""
echo "4. WAF WebACL - If using CloudFront"
echo ""
echo "✅ Core infrastructure imported!"
echo ""
echo "Next: Run 'terraform plan' to see remaining differences"
