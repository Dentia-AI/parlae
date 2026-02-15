#!/bin/bash
set -e

echo "🔧 Fixing Terraform state to match actual AWS infrastructure"
echo ""
echo "Current situation:"
echo "  - Running services are in VPC: vpc-072ff6c4af9465030 (OLD)"
echo "  - Terraform state has VPC: vpc-08d61687c19876eb1 (NEW)"
echo ""
echo "Solution: Replace VPC in Terraform state with the correct one"
echo ""

cd /Users/shaunk/Projects/Parlae-AI/parlae-infra/infra/ecs

# Step 1: Remove the incorrect VPC from state
echo "1️⃣ Removing incorrect VPC from Terraform state..."
terraform state rm aws_vpc.main || echo "  VPC not in state or already removed"

# Step 2: Import the correct VPC
echo ""
echo "2️⃣ Importing correct VPC (vpc-072ff6c4af9465030)..."
terraform import aws_vpc.main vpc-072ff6c4af9465030

# Step 3: Remove target groups from state (they'll auto-match to correct VPC)
echo ""
echo "3️⃣ Removing target groups from state..."
terraform state rm aws_lb_target_group.frontend || echo "  Frontend TG not in state"
terraform state rm aws_lb_target_group.backend || echo "  Backend TG not in state"

# Step 4: Import target groups with correct VPC
echo ""
echo "4️⃣ Importing target groups..."
terraform import aws_lb_target_group.frontend arn:aws:elasticloadbalancing:us-east-2:234270344223:targetgroup/parlae-frontend-tg/aec3a7511e316c41
terraform import aws_lb_target_group.backend arn:aws:elasticloadbalancing:us-east-2:234270344223:targetgroup/parlae-backend-tg/03fceeae83af93df

# Step 5: Import subnets in the correct VPC
echo ""
echo "5️⃣ Importing subnets..."
terraform import 'aws_subnet.public[0]' subnet-00ed396c8c6a36ef7 || echo "  Subnet 0 already imported"
terraform import 'aws_subnet.public[1]' subnet-053617ca07e049a04 || echo "  Subnet 1 already imported"

# Step 6: Import security groups
echo ""
echo "6️⃣ Importing security groups..."
SG_ECS=$(aws ec2 describe-security-groups --filters "Name=vpc-id,Values=vpc-072ff6c4af9465030" "Name=group-name,Values=parlae-ecs-sg" --region us-east-2 --profile parlae --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo "")
SG_ALB=$(aws ec2 describe-security-groups --filters "Name=vpc-id,Values=vpc-072ff6c4af9465030" "Name=group-name,Values=parlae-alb-sg" --region us-east-2 --profile parlae --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo "")
SG_DB=$(aws ec2 describe-security-groups --filters "Name=vpc-id,Values=vpc-072ff6c4af9465030" "Name=group-name,Values=parlae-db-sg" --region us-east-2 --profile parlae --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo "")

if [ ! -z "$SG_ECS" ]; then
  terraform state rm aws_security_group.ecs 2>/dev/null || true
  terraform import aws_security_group.ecs "$SG_ECS"
fi

if [ ! -z "$SG_ALB" ]; then
  terraform state rm aws_security_group.alb 2>/dev/null || true
  terraform import aws_security_group.alb "$SG_ALB"
fi

if [ ! -z "$SG_DB" ]; then
  terraform state rm aws_security_group.db 2>/dev/null || true
  terraform import aws_security_group.db "$SG_DB"
fi

echo ""
echo "✅ Terraform state updated to use correct VPC!"
echo ""
echo "Next steps:"
echo "1. Run 'terraform plan' to verify"
echo "2. Should see minimal changes now"
