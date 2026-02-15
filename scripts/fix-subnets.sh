#!/bin/bash
set -e

cd /Users/shaunk/Projects/Parlae-AI/parlae-infra/infra/ecs

echo "🔧 Fixing subnet state..."

# Remove incorrect subnets
terraform state rm 'aws_subnet.public["a"]' || true
terraform state rm 'aws_subnet.public["b"]' || true
terraform state rm 'aws_subnet.private["a"]' || true
terraform state rm 'aws_subnet.private["b"]' || true

# Import correct public subnets (ones ECS is actually using)
echo "Importing public subnets..."
terraform import 'aws_subnet.public["a"]' subnet-00ed396c8c6a36ef7
terraform import 'aws_subnet.public["b"]' subnet-053617ca07e049a04

# Get private subnets
PRIVATE_A=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=vpc-072ff6c4af9465030" "Name=tag:Name,Values=parlae-private-a" --region us-east-2 --profile parlae --query 'Subnets[0].SubnetId' --output text 2>/dev/null || echo "")
PRIVATE_B=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=vpc-072ff6c4af9465030" "Name=tag:Name,Values=parlae-private-b" --region us-east-2 --profile parlae --query 'Subnets[0].SubnetId' --output text 2>/dev/null || echo "")

echo "Importing private subnets..."
if [ ! -z "$PRIVATE_A" ] && [ "$PRIVATE_A" != "None" ]; then
  terraform import 'aws_subnet.private["a"]' "$PRIVATE_A"
fi

if [ ! -z "$PRIVATE_B" ] && [ "$PRIVATE_B" != "None" ]; then
  terraform import 'aws_subnet.private["b"]' "$PRIVATE_B"
fi

# Fix route table associations
terraform state rm 'aws_route_table_association.public_assoc["a"]' || true
terraform state rm 'aws_route_table_association.public_assoc["b"]' || true

# Get route table associations
ASSOC_A=$(aws ec2 describe-route-tables --filters "Name=association.subnet-id,Values=subnet-00ed396c8c6a36ef7" --region us-east-2 --profile parlae --query 'RouteTables[0].Associations[?SubnetId==`subnet-00ed396c8c6a36ef7`].RouteTableAssociationId' --output text 2>/dev/null || echo "")
ASSOC_B=$(aws ec2 describe-route-tables --filters "Name=association.subnet-id,Values=subnet-053617ca07e049a04" --region us-east-2 --profile parlae --query 'RouteTables[0].Associations[?SubnetId==`subnet-053617ca07e049a04`].RouteTableAssociationId' --output text 2>/dev/null || echo "")

echo "Importing route table associations..."
if [ ! -z "$ASSOC_A" ]; then
  terraform import 'aws_route_table_association.public_assoc["a"]' "$ASSOC_A"
fi

if [ ! -z "$ASSOC_B" ]; then
  terraform import 'aws_route_table_association.public_assoc["b"]' "$ASSOC_B"
fi

echo "✅ Subnets fixed!"
