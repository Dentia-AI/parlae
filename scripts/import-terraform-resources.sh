#!/bin/bash
set -e

echo "🔧 Importing existing AWS resources into Terraform state..."
echo ""

cd /Users/shaunk/Projects/Parlae-AI/parlae-infra/infra/ecs

# Import ECS Cluster
echo "📦 Importing ECS Cluster..."
terraform import aws_ecs_cluster.main parlae-cluster 2>/dev/null || echo "  Already imported or doesn't exist"

# Import ECR Repositories
echo "📦 Importing ECR Repositories..."
terraform import aws_ecr_repository.frontend parlae-frontend 2>/dev/null || echo "  Already imported"
terraform import aws_ecr_repository.backend parlae-backend 2>/dev/null || echo "  Already imported"

# Import ECS Services
echo "📦 Importing ECS Services..."
terraform import aws_ecs_service.frontend parlae-cluster/parlae-frontend 2>/dev/null || echo "  Already imported"
terraform import aws_ecs_service.backend parlae-cluster/parlae-backend 2>/dev/null || echo "  Already imported"

# Import ALB
echo "📦 Importing Application Load Balancer..."
ALB_ARN=$(aws elbv2 describe-load-balancers --names parlae-alb --region us-east-2 --profile parlae --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null)
if [ ! -z "$ALB_ARN" ]; then
  terraform import aws_lb.app "$ALB_ARN" 2>/dev/null || echo "  Already imported"
fi

# Import Target Groups
echo "📦 Importing Target Groups..."
FE_TG_ARN=$(aws elbv2 describe-target-groups --names parlae-frontend-tg --region us-east-2 --profile parlae --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null)
if [ ! -z "$FE_TG_ARN" ]; then
  terraform import aws_lb_target_group.frontend "$FE_TG_ARN" 2>/dev/null || echo "  Already imported"
fi

BE_TG_ARN=$(aws elbv2 describe-target-groups --names parlae-backend-tg --region us-east-2 --profile parlae --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null)
if [ ! -z "$BE_TG_ARN" ]; then
  terraform import aws_lb_target_group.backend "$BE_TG_ARN" 2>/dev/null || echo "  Already imported"
fi

# Import CloudWatch Log Groups
echo "📦 Importing CloudWatch Log Groups..."
terraform import aws_cloudwatch_log_group.frontend /ecs/parlae-frontend 2>/dev/null || echo "  Already imported"
terraform import aws_cloudwatch_log_group.backend /ecs/parlae-backend 2>/dev/null || echo "  Already imported"

# Import IAM Roles
echo "📦 Importing IAM Roles..."
terraform import aws_iam_role.ecs_task_execution parlae-ecsTaskExecutionRole 2>/dev/null || echo "  Already imported"
terraform import aws_iam_role.ecs_task parlae-ecsTaskRole 2>/dev/null || echo "  Already imported"

# Import S3 Bucket
echo "📦 Importing S3 Bucket..."
terraform import aws_s3_bucket.uploads parlae-uploads-us-east-2 2>/dev/null || echo "  Already imported"

# Import DB Subnet Group
echo "📦 Importing Aurora Subnet Group..."
terraform import aws_db_subnet_group.aurora parlae-aurora-subnet-group 2>/dev/null || echo "  Already imported"

echo ""
echo "✅ Import complete! Now you can run 'terraform plan' to see what needs updating."
echo ""
echo "Note: Task definitions are managed with 'lifecycle { ignore_changes = [task_definition] }'"
echo "so they won't be recreated by Terraform. Use the update scripts instead."
