# MakerKit → AWS (ECS + Aurora + Cognito) — Production Starter

This is a concise, production-ready blueprint to deploy **MakerKit (Next.js + Prisma)** on **AWS ECS Fargate**, backed by **Amazon Aurora PostgreSQL Serverless v2**, **Cognito (OIDC)** for auth via **NextAuth**, and **ALB** for HTTPS.

---

## 0) High-level architecture (no-NAT option + alternative)

* **Route53** → **ACM** (TLS) → **ALB (public)** → **ECS Fargate service** (Next.js app, single container) → **Aurora PostgreSQL Serverless v2** in private subnets.
* **Secrets Manager / SSM Parameter Store** for secrets & config; **CloudWatch Logs** for app logs; **ECR** for images.

**No-NAT, low-cost option (recommended for you):**

* Place the **ECS service in public subnets with an auto-assigned public IP**. Restrict inbound traffic to the task **only from ALB SG**. Outbound internet calls (Stripe, email, webhooks) use the task’s public IP directly. DB remains private. This avoids the NAT Gateway hourly + data egress fees.

**Private-only alternative (higher cost):**

* ECS tasks in private subnets, outbound via **NAT Gateway**. Use when public IPs on tasks are disallowed by policy.

> Both options are compatible with ALB health checks, sticky sessions (if needed), and rolling deployments.

---

## 1) Environment variables (Secrets Manager / SSM)

Store these (non-exhaustive) before first deploy:

* `NEXTAUTH_URL=https://app.yourdomain.com`
* `NEXTAUTH_SECRET=<32+ char random>`
* `DATABASE_URL=postgresql://<user>:<pass>@<host>:5432/<db>?schema=public`
* `COGNITO_ISSUER=https://cognito-idp.<region>.amazonaws.com/<user_pool_id>`
* `COGNITO_CLIENT_ID=...`
* `COGNITO_CLIENT_SECRET=...`
* `STRIPE_SECRET_KEY=...` (if used)
* `RESEND_API_KEY=...` (if used)

Grant the task execution role permission to read these secrets.

---

## 2) NextAuth + Cognito (OIDC) setup

**Cognito**

1. Create **User Pool** (allow email + social IdPs if desired).
2. Create **App Client** (Confidential app, client secret enabled). Callback/Sign-out URLs → `https://app.yourdomain.com/api/auth/callback/cognito` and `https://app.yourdomain.com`.
3. Hosted UI domain configured.

**NextAuth provider example (TypeScript)**

```ts
// src/pages/api/auth/[...nextauth].ts
import NextAuth from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";

export default NextAuth({
  providers: [
    CognitoProvider({
      issuer: process.env.COGNITO_ISSUER!,
      clientId: process.env.COGNITO_CLIENT_ID!,
      clientSecret: process.env.COGNITO_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async session({ session, token }) {
      // enrich session if needed
      return session;
    },
  },
});
```

---

## 3) Next.js container (standalone) + Dockerfile

**next.config.js**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: { instrumentationHook: true },
};
module.exports = nextConfig;
```

**Dockerfile** (multi-stage, optimized for ECS)

```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --production

# Runtime stage
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

> Ensure `server.js` exists in the standalone output (Next.js provides it). If you use `app` dir and custom server isn’t created, Next’s standalone runner places the correct entry point under `.next/standalone/server.js`.

---

## 4) Aurora PostgreSQL Serverless v2

* Create cluster in **private subnets** across at least two AZs.
* Engine: **aurora-postgresql** compatible with Prisma (e.g., 14+).
* Configure **min/max ACUs** (e.g., 0.5–4 ACUs dev, 2–8 prod). Enable **Data API** if you want (not required for Prisma).
* Security Groups: allow inbound `5432` from ECS task SG only.

**Prisma**

```bash
npx prisma generate
npx prisma migrate deploy
```

Run migrations in a one-off ECS task during deploy (see CI step).

---

## 5) ALB + ECS service (Fargate)

* **ALB** (public) in two public subnets, **HTTPS listener 443** → target group (HTTP 3000) → ECS service.
* **ECS Service**: desired count ≥ 2 (HA), min healthy percent 100, max 200 for rolling.
* **Health check**: `/api/health` (add a trivial handler), success codes `200-399`.
* **Scaling**: target CPU 55% / memory 70%; scale out/in policies.
* **Public-IP tasks** (no NAT option): Enable **assignPublicIp: ENABLED**.

Minimal **task definition** (env via Secrets):

```json
{
  "family": "makerkit-web",
  "networkMode": "awsvpc",
  "cpu": "512",
  "memory": "1024",
  "requiresCompatibilities": ["FARGATE"],
  "executionRoleArn": "arn:aws:iam::<acct>:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::<acct>:role/makerkitTaskRole",
  "containerDefinitions": [
    {
      "name": "web",
      "image": "<acct>.dkr.ecr.<region>.amazonaws.com/makerkit:latest",
      "portMappings": [{ "containerPort": 3000, "protocol": "tcp" }],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/makerkit-web",
          "awslogs-region": "<region>",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "secrets": [
        { "name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:<region>:<acct>:secret:db-url" },
        { "name": "NEXTAUTH_SECRET", "valueFrom": "arn:aws:ssm:<region>:<acct>:parameter/nextauth/secret" },
        { "name": "COGNITO_ISSUER", "valueFrom": "arn:aws:ssm:<region>:<acct>:parameter/cognito/issuer" },
        { "name": "COGNITO_CLIENT_ID", "valueFrom": "arn:aws:ssm:<region>:<acct>:parameter/cognito/client_id" },
        { "name": "COGNITO_CLIENT_SECRET", "valueFrom": "arn:aws:ssm:<region>:<acct>:parameter/cognito/client_secret" }
      ]
    }
  ]
}
```

**Service networking (no-NAT route):**

* Subnets: **public**
* Assign public IP: **ENABLED**
* SG inbound: allow **3000 from ALB SG only**; SG outbound: egress all (0.0.0.0/0)
* Target group health check path `/api/health`

---

## 6) GitHub Actions (CI/CD)

* Build & push Docker → **ECR**
* Run **one-off ECS task** for `prisma migrate deploy`
* Update ECS service to new task def (immutable tag, e.g., `:git-sha`)

**.github/workflows/deploy.yml**

```yaml
name: Deploy MakerKit to ECS
on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::<acct>:role/GitHubOIDCDeployRole
          aws-region: <region>

      - name: Login to ECR
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build & Push
        env:
          ECR_REPO: <acct>.dkr.ecr.<region>.amazonaws.com/makerkit
        run: |
          IMAGE_TAG=${GITHUB_SHA}
          docker build -t $ECR_REPO:$IMAGE_TAG .
          docker push $ECR_REPO:$IMAGE_TAG
          echo "IMAGE_URI=$ECR_REPO:$IMAGE_TAG" >> $GITHUB_ENV

      - name: Render Task Definition
        run: |
          sed "s|<IMAGE_URI>|${IMAGE_URI}|g" infra/ecs-taskdef.json > /tmp/taskdef.json

      - name: Register Task Definition
        id: taskdef
        run: |
          FAMILY=$(jq -r '.family' /tmp/taskdef.json)
          ARN=$(aws ecs register-task-definition --cli-input-json file:///tmp/taskdef.json | jq -r '.taskDefinition.taskDefinitionArn')
          echo "TASKDEF_ARN=$ARN" >> $GITHUB_ENV

      - name: Run Prisma Migrate (one-off task)
        run: |
          aws ecs run-task \
            --cluster makerkit-cluster \
            --launch-type FARGATE \
            --network-configuration "awsvpcConfiguration={subnets=[subnet-abc,subnet-def],securityGroups=[sg-prisma],assignPublicIp=ENABLED}" \
            --task-definition $TASKDEF_ARN \
            --overrides '{"containerOverrides":[{"name":"web","command":["npx","prisma","migrate","deploy"]}]}'

      - name: Update Service
        run: |
          aws ecs update-service --cluster makerkit-cluster --service makerkit-web --task-definition $TASKDEF_ARN
```

> Keep a minimal `infra/ecs-taskdef.json` template with `<IMAGE_URI>` placeholder.

---

## 7) Terraform skeleton (us-east-2)

This is a **minimal scaffold**—split into modules in your repo. Fill IDs where marked.

```hcl
# providers.tf
terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}
provider "aws" { region = "us-east-2" }

# networking.tf
resource "aws_vpc" "main" { cidr_block = "10.0.0.0/16" }
resource "aws_internet_gateway" "igw" { vpc_id = aws_vpc.main.id }

# public subnets (2 AZs)
resource "aws_subnet" "public_a" { vpc_id = aws_vpc.main.id cidr_block = "10.0.1.0/24" availability_zone = "us-east-2a" map_public_ip_on_launch = true }
resource "aws_subnet" "public_b" { vpc_id = aws_vpc.main.id cidr_block = "10.0.2.0/24" availability_zone = "us-east-2b" map_public_ip_on_launch = true }

# private subnets (for DB)
resource "aws_subnet" "private_a" { vpc_id = aws_vpc.main.id cidr_block = "10.0.11.0/24" availability_zone = "us-east-2a" }
resource "aws_subnet" "private_b" { vpc_id = aws_vpc.main.id cidr_block = "10.0.12.0/24" availability_zone = "us-east-2b" }

resource "aws_route_table" "public" { vpc_id = aws_vpc.main.id }
resource "aws_route" "public_inet" { route_table_id = aws_route_table.public.id destination_cidr_block = "0.0.0.0/0" gateway_id = aws_internet_gateway.igw.id }
resource "aws_route_table_association" "pub_a" { subnet_id = aws_subnet.public_a.id route_table_id = aws_route_table.public.id }
resource "aws_route_table_association" "pub_b" { subnet_id = aws_subnet.public_b.id route_table_id = aws_route_table.public.id }

# SGs
resource "aws_security_group" "alb" { vpc_id = aws_vpc.main.id ingress { from_port=443 to_port=443 protocol="tcp" cidr_blocks=["0.0.0.0/0"] } egress { from_port=0 to_port=0 protocol="-1" cidr_blocks=["0.0.0.0/0"] } }
resource "aws_security_group" "ecs" { vpc_id = aws_vpc.main.id ingress { from_port=3000 to_port=3000 protocol="tcp" security_groups=[aws_security_group.alb.id] } egress { from_port=0 to_port=0 protocol="-1" cidr_blocks=["0.0.0.0/0"] } }
resource "aws_security_group" "db"  { vpc_id = aws_vpc.main.id ingress { from_port=5432 to_port=5432 protocol="tcp" security_groups=[aws_security_group.ecs.id] } egress { from_port=0 to_port=0 protocol="-1" cidr_blocks=["0.0.0.0/0"] } }

# ACM & ALB
resource "aws_acm_certificate" "cert" { domain_name = "app.yourdomain.com" validation_method = "DNS" }
resource "aws_lb" "app" { name = "makerkit-alb" internal=false load_balancer_type="application" security_groups=[aws_security_group.alb.id] subnets=[aws_subnet.public_a.id, aws_subnet.public_b.id] }
resource "aws_lb_target_group" "tg" { name="makerkit-tg" port=3000 protocol="HTTP" vpc_id=aws_vpc.main.id health_check { path = "/api/health" matcher = "200-399" } }
resource "aws_lb_listener" "https" { load_balancer_arn=aws_lb.app.arn port=443 protocol="HTTPS" ssl_policy="ELBSecurityPolicy-TLS13-1-2-2021-06" certificate_arn=aws_acm_certificate.cert.arn default_action { type="forward" target_group_arn=aws_lb_target_group.tg.arn } }

# ECR
resource "aws_ecr_repository" "repo" { name="makerkit" image_scanning_configuration { scan_on_push=true } }

# ECS cluster & service
resource "aws_ecs_cluster" "main" { name = "makerkit-cluster" }
resource "aws_ecs_task_definition" "web" {
  family                   = "makerkit-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_exec.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions    = jsonencode([
    {
      name  = "web"
      image = "${aws_ecr_repository.repo.repository_url}:latest"
      portMappings = [{ containerPort = 3000 }]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/makerkit-web"
          awslogs-region        = "us-east-2"
          awslogs-stream-prefix = "ecs"
        }
      }
      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.db_url.arn },
      ]
    }
  ])
}

resource "aws_cloudwatch_log_group" "ecs" { name = "/ecs/makerkit-web" retention_in_days = 30 }

resource "aws_ecs_service" "web" {
  name            = "makerkit-web"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = 2
  launch_type     = "FARGATE"
  network_configuration {
    subnets         = [aws_subnet.public_a.id, aws_subnet.public_b.id]
    security_groups = [aws_security_group.ecs.id]
    assign_public_ip = true
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.tg.arn
    container_name   = "web"
    container_port   = 3000
  }
  lifecycle { ignore_changes = [task_definition] }
}

# Aurora PostgreSQL Serverless v2
resource "aws_rds_subnet_group" "db" { subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id] }
resource "aws_rds_cluster" "aurora" {
  cluster_identifier      = "makerkit-aurora"
  engine                  = "aurora-postgresql"
  engine_version          = "14.7"
  database_name           = "makerkit"
  master_username         = "mkadmin"
  master_password         = "changeMeLongRandom" # consider secrets
  db_subnet_group_name    = aws_rds_subnet_group.db.name
  vpc_security_group_ids  = [aws_security_group.db.id]
  storage_encrypted       = true
  backup_retention_period = 7
  serverlessv2_scaling_configuration { min_capacity = 2 max_capacity = 8 }
}
resource "aws_rds_cluster_instance" "aurora_i" {
  identifier         = "makerkit-aurora-i1"
  cluster_identifier = aws_rds_cluster.aurora.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.aurora.engine
  engine_version     = aws_rds_cluster.aurora.engine_version
}
```

> Add IAM roles (`ecs_exec`, `task`) with permissions for ECR pulls, logs, and reading secrets. Create `aws_secretsmanager_secret.db_url` (or use SSM).

---

## 8) Health check & readiness endpoints

Add a minimal handler:

```ts
// src/pages/api/health.ts
import type { NextApiRequest, NextApiResponse } from 'next';
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({ ok: true });
}
```

---

## 9) Migrations and zero-downtime rollout

* Run `prisma migrate deploy` as a one-off task **before** updating service.
* Use ALB health checks + minimum healthy percent 100 to avoid dropping traffic.
* If using ISR/SSG, ensure `next build` happens in CI; no build on-container start.

---

## 10) Cost notes

* **No-NAT** design saves ~$35–$40/mo per AZ + data processing.
* Aurora Serverless v2 scales ACUs; set low **min ACUs** off-hours.
* Use **one log group** with retention set to 14–30 days.
* Scale ECS on **CPU/Memory** or custom metrics (RPS) via target tracking.

---

## 11) Checklist to go live

* [ ] Domain in Route53, ACM issued & validated in **us-east-2**
* [ ] ALB HTTPS → target group → ECS healthy
* [ ] Cognito Hosted UI app client callback URLs set
* [ ] Secrets present and readable by task role
* [ ] DB migrations run, app connects
* [ ] WAF (optional) attached to ALB
* [ ] Backups & retention confirmed (Aurora + logs)

---

**That’s it.** This blueprint gets MakerKit into an “enterprise-ready” AWS posture without adding a NestJS backend. If you want, I can tailor the Terraform to your exact domain names (e.g., `app.dentia.co`) and wire in your existing Cognito pool.




===============================================


Awesome — here’s a **complete, production-ready AWS setup** for deploying **Makerkit** entirely on AWS with:

* **us-east-2 (Ohio)**
* **VPC (no NAT)**
* **ECS Fargate** (Next.js “frontend” + NestJS “backend”)
* **ALB** with host-based routing (`app.dentia.co`, `api.dentia.co`)
* **Aurora PostgreSQL Serverless v2** (auto-scaling)
* **Cognito** (with social logins)
* **S3** (media), **CloudFront** (optional)
* **Secrets Manager**, **CloudWatch Logs**
* **ECR** + **GitHub Actions** CI/CD for both services

I’ll give you:

1. A **Terraform blueprint** (drop-in files)
2. **Two GitHub Actions workflows** (frontend + backend)
3. **Concrete step-by-step** AWS Console instructions

I’ll assume the following (you can change in `variables.tf`):

* Root domain: `dentia.co` (in Route53)
* Subdomains: `app.dentia.co` (Next.js) and `api.dentia.co` (NestJS)
* Region: `us-east-2`
* No NAT; tasks that must access the public Internet will run in **public subnets** with **public IPs** but **only accept traffic from the ALB SG**.

---

# 0) Repo layout (infra + app)

```
/infra/terraform
  main.tf
  variables.tf
  outputs.tf
  vpc.tf
  security.tf
  logs.tf
  aurora.tf
  ecr.tf
  iam.tf
  alb.tf
  ecs-frontend.tf
  ecs-backend.tf
  cognito.tf
  s3-cf.tf
  secrets.tf
  route53.tf

/apps/frontend   # Makerkit Next.js (containerized)
/apps/backend    # NestJS API (containerized)

/.github/workflows
  deploy-frontend.yml
  deploy-backend.yml

ecs-task-def-frontend.json
ecs-task-def-backend.json
```

> If your Makerkit repo already exists, just add `/infra/terraform` and the workflows.

---

## 1) Terraform (drop-in)

### `main.tf`

```hcl
terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}
provider "aws" { region = var.region }
```

### `variables.tf`

```hcl
variable "region" { type = string, default = "us-east-2" }
variable "domain" { type = string, description = "Root domain (e.g., dentia.co)" }
variable "hosted_zone_id" { type = string, description = "Route53 Hosted Zone ID" }

# App FQDNs
variable "app_fqdn" { type = string, default = "app.dentia.co" }
variable "api_fqdn" { type = string, default = "api.dentia.co" }

# DB
variable "db_name" { type = string, default = "dentia" }
variable "db_username" { type = string, default = "dentia" }
variable "db_password" { type = string, sensitive = true }

# ECR image URIs (set by CI after first push)
variable "frontend_image" { type = string }
variable "backend_image"  { type = string }
```

### `vpc.tf` (no NAT; 2× public, 2× private)

```hcl
resource "aws_vpc" "main" {
  cidr_block           = "10.60.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags = { Name = "dentia-vpc" }
}
resource "aws_internet_gateway" "igw" { vpc_id = aws_vpc.main.id }

# Subnets
resource "aws_subnet" "public_a"  { vpc_id = aws_vpc.main.id cidr_block = "10.60.0.0/20"  availability_zone = "${var.region}a" map_public_ip_on_launch = true  tags = { Name = "public-a" } }
resource "aws_subnet" "public_b"  { vpc_id = aws_vpc.main.id cidr_block = "10.60.16.0/20" availability_zone = "${var.region}b" map_public_ip_on_launch = true  tags = { Name = "public-b" } }
resource "aws_subnet" "private_a" { vpc_id = aws_vpc.main.id cidr_block = "10.60.32.0/20" availability_zone = "${var.region}a" tags = { Name = "private-a" } }
resource "aws_subnet" "private_b" { vpc_id = aws_vpc.main.id cidr_block = "10.60.48.0/20" availability_zone = "${var.region}b" tags = { Name = "private-b" } }

# Routes
resource "aws_route_table" "public" { vpc_id = aws_vpc.main.id route { cidr_block = "0.0.0.0/0" gateway_id = aws_internet_gateway.igw.id } }
resource "aws_route_table_association" "pub_a" { route_table_id = aws_route_table.public.id subnet_id = aws_subnet.public_a.id }
resource "aws_route_table_association" "pub_b" { route_table_id = aws_route_table.public.id subnet_id = aws_subnet.public_b.id }

# No NAT, no private route to Internet. Private subnets only reach internal targets (DB, etc).
```

### `security.tf`

```hcl
# ALB SG (public)
resource "aws_security_group" "alb" {
  name   = "alb-sg"
  vpc_id = aws_vpc.main.id
  ingress { from_port=80  to_port=80  protocol="tcp" cidr_blocks=["0.0.0.0/0"] }
  ingress { from_port=443 to_port=443 protocol="tcp" cidr_blocks=["0.0.0.0/0"] }
  egress  { from_port=0   to_port=0   protocol="-1" cidr_blocks=["0.0.0.0/0"] }
}

# Frontend ECS tasks SG (public)
resource "aws_security_group" "ecs_frontend" {
  name   = "ecs-frontend-sg"
  vpc_id = aws_vpc.main.id
  ingress { from_port=3000 to_port=3000 protocol="tcp" security_groups=[aws_security_group.alb.id] }
  egress  { from_port=0 to_port=0 protocol="-1" cidr_blocks=["0.0.0.0/0"] } # public egress (no NAT)
}

# Backend ECS tasks SG (public but only ALB ingress)
resource "aws_security_group" "ecs_backend" {
  name   = "ecs-backend-sg"
  vpc_id = aws_vpc.main.id
  ingress { from_port=4000 to_port=4000 protocol="tcp" security_groups=[aws_security_group.alb.id] }
  egress  { from_port=0 to_port=0 protocol="-1" cidr_blocks=["0.0.0.0/0"] } # public egress (no NAT)
}

# Aurora SG (private)
resource "aws_security_group" "db" {
  name   = "db-sg"
  vpc_id = aws_vpc.main.id
  ingress {
    from_port = 5432
    to_port   = 5432
    protocol  = "tcp"
    # allow only backend tasks SG
    security_groups = [aws_security_group.ecs_backend.id]
  }
  egress { from_port=0 to_port=0 protocol="-1" cidr_blocks=["0.0.0.0/0"] }
}
```

### `logs.tf`

```hcl
resource "aws_cloudwatch_log_group" "frontend" { name="/ecs/frontend" retention_in_days=30 }
resource "aws_cloudwatch_log_group" "backend"  { name="/ecs/backend"  retention_in_days=30 }
```

### `aurora.tf` (Serverless v2)

```hcl
resource "aws_db_subnet_group" "db" {
  name       = "dentia-aurora-subnets"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]
}

resource "aws_rds_cluster" "aurora" {
  cluster_identifier      = "dentia-aurora"
  engine                  = "aurora-postgresql"
  engine_version          = "15.3"
  database_name           = var.db_name
  master_username         = var.db_username
  master_password         = var.db_password
  vpc_security_group_ids  = [aws_security_group.db.id]
  db_subnet_group_name    = aws_db_subnet_group.db.name
  storage_encrypted       = true
  deletion_protection     = false
  skip_final_snapshot     = true

  serverlessv2_scaling_configuration {
    min_capacity = 0.5
    max_capacity = 4.0
  }
}

resource "aws_rds_cluster_instance" "aurora_inst" {
  identifier         = "dentia-aurora-inst"
  cluster_identifier = aws_rds_cluster.aurora.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.aurora.engine
  publicly_accessible = false
  db_subnet_group_name = aws_db_subnet_group.db.name
}
```

### `ecr.tf`

```hcl
resource "aws_ecr_repository" "frontend" { name = "frontend" image_scanning_configuration { scan_on_push = true } }
resource "aws_ecr_repository" "backend"  { name = "backend"  image_scanning_configuration { scan_on_push = true } }
```

### `iam.tf` (task exec role + GitHub OIDC role—minimal)

```hcl
# ECS task execution role
data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals { type="Service" identifiers=["ecs-tasks.amazonaws.com"] }
  }
}
resource "aws_iam_role" "ecs_task_exec" {
  name = "ecs-task-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}
resource "aws_iam_role_policy_attachment" "ecs_exec_attach" {
  role = aws_iam_role.ecs_task_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
# (Optional) add SecretsManagerReadWrite if tasks read secrets at runtime
```

### `alb.tf`

```hcl
# ACM cert for *.domain (must be in us-east-2)
resource "aws_acm_certificate" "wildcard" {
  domain_name       = "*.${var.domain}"
  validation_method = "DNS"
}

resource "aws_route53_record" "cert_val" {
  for_each = { for dvo in aws_acm_certificate.wildcard.domain_validation_options : dvo.domain_name => dvo }
  name = each.value.resource_record_name
  type = each.value.resource_record_type
  zone_id = var.hosted_zone_id
  records = [each.value.resource_record_value]
  ttl = 60
}

resource "aws_acm_certificate_validation" "wildcard" {
  certificate_arn = aws_acm_certificate.wildcard.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_val : r.fqdn]
}

resource "aws_lb" "app" {
  name               = "dentia-alb"
  load_balancer_type = "application"
  subnets            = [aws_subnet.public_a.id, aws_subnet.public_b.id]
  security_groups    = [aws_security_group.alb.id]
}

resource "aws_lb_target_group" "frontend" {
  name        = "tg-frontend"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"
  health_check { path="/", interval=15, healthy_threshold=2, unhealthy_threshold=2, timeout=5 }
}
resource "aws_lb_target_group" "backend" {
  name        = "tg-backend"
  port        = 4000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"
  health_check { path="/health", interval=15, healthy_threshold=2, unhealthy_threshold=2, timeout=5 }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.app.arn
  port = 443
  protocol = "HTTPS"
  certificate_arn = aws_acm_certificate_validation.wildcard.certificate_arn
  default_action { type="fixed-response" fixed_response { content_type="text/plain" message_body="Not Found" status_code="404" } }
}

# Host rules
resource "aws_lb_listener_rule" "app_host" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10
  action { type="forward" target_group_arn=aws_lb_target_group.frontend.arn }
  condition { host_header { values=[var.app_fqdn] } }
}
resource "aws_lb_listener_rule" "api_host" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 20
  action { type="forward" target_group_arn=aws_lb_target_group.backend.arn }
  condition { host_header { values=[var.api_fqdn] } }
}
```

### `ecs-frontend.tf`

```hcl
resource "aws_ecs_cluster" "main" { name = "dentia-cluster" }

resource "aws_ecs_task_definition" "frontend" {
  family                   = "frontend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu    = 256
  memory = 512
  execution_role_arn = aws_iam_role.ecs_task_exec.arn
  container_definitions = jsonencode([{
    name  = "frontend"
    image = var.frontend_image
    essential = true
    portMappings = [{ containerPort = 3000, protocol="tcp" }]
    environment = [
      { name="NEXTAUTH_URL", value="https://${var.app_fqdn}" },
      { name="NEXT_PUBLIC_API_URL", value="https://${var.api_fqdn}" }
    ]
    logConfiguration = {
      logDriver="awslogs",
      options = {
        awslogs-group = aws_cloudwatch_log_group.frontend.name,
        awslogs-region = var.region,
        awslogs-stream-prefix = "ecs"
      }
    }
  }])
  runtime_platform { cpu_architecture="X86_64" operating_system_family="LINUX" }
}

resource "aws_ecs_service" "frontend" {
  name            = "frontend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = 2
  launch_type     = "FARGATE"
  network_configuration {
    subnets         = [aws_subnet.public_a.id, aws_subnet.public_b.id] # public for egress, no NAT
    assign_public_ip = true
    security_groups = [aws_security_group.ecs_frontend.id]
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = "frontend"
    container_port   = 3000
  }
}
```

### `ecs-backend.tf`

```hcl
resource "aws_ecs_task_definition" "backend" {
  family                   = "backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu    = 512
  memory = 1024
  execution_role_arn = aws_iam_role.ecs_task_exec.arn
  container_definitions = jsonencode([{
    name  = "backend"
    image = var.backend_image
    essential = true
    portMappings = [{ containerPort = 4000, protocol="tcp" }]
    environment = [
      { name="AWS_REGION", value=var.region }
      # COGNITO details injected below; DATABASE_URL via Secrets Manager
    ]
    secrets = [
      { name="DATABASE_URL", valueFrom=aws_secretsmanager_secret.db_url.arn }
    ]
    logConfiguration = {
      logDriver="awslogs",
      options = {
        awslogs-group = aws_cloudwatch_log_group.backend.name,
        awslogs-region = var.region,
        awslogs-stream-prefix = "ecs"
      }
    }
  }])
  runtime_platform { cpu_architecture="X86_64" operating_system_family="LINUX" }
}

resource "aws_ecs_service" "backend" {
  name            = "backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 2
  launch_type     = "FARGATE"
  network_configuration {
    subnets         = [aws_subnet.public_a.id, aws_subnet.public_b.id] # public for outbound APIs, no NAT
    assign_public_ip = true
    security_groups = [aws_security_group.ecs_backend.id]
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 4000
  }
}
```

### `cognito.tf` (basic pool + two app clients; add Google later in console)

```hcl
resource "aws_cognito_user_pool" "pool" {
  name = "dentia-users"
  auto_verified_attributes = ["email"]
}

resource "random_id" "suffix" { byte_length = 4 }
resource "aws_cognito_user_pool_domain" "domain" {
  domain       = "dentia-auth-${random_id.suffix.hex}"
  user_pool_id = aws_cognito_user_pool.pool.id
}

resource "aws_cognito_user_pool_client" "frontend" {
  name                         = "frontend"
  user_pool_id                 = aws_cognito_user_pool.pool.id
  allowed_oauth_flows          = ["code"]
  allowed_oauth_scopes         = ["openid","email","profile"]
  allowed_oauth_flows_user_pool_client = true
  generate_secret              = false
  callback_urls                = ["https://${var.app_fqdn}/api/auth/callback/cognito"]
  logout_urls                  = ["https://${var.app_fqdn}"]
  supported_identity_providers = ["COGNITO"] # add "Google" once configured
}

resource "aws_cognito_user_pool_client" "backend" {
  name                         = "backend"
  user_pool_id                 = aws_cognito_user_pool.pool.id
  allowed_oauth_flows          = ["client_credentials","code"]
  allowed_oauth_scopes         = ["openid","email","profile"]
  allowed_oauth_flows_user_pool_client = true
  generate_secret              = true
}
```

### `s3-cf.tf` (media bucket; CloudFront optional)

```hcl
resource "aws_s3_bucket" "media" { bucket = "dentia-media-${random_id.suffix.hex}" force_destroy = false }
resource "aws_s3_bucket_public_access_block" "media" {
  bucket = aws_s3_bucket.media.id
  block_public_acls   = true
  block_public_policy = true
  restrict_public_buckets = true
  ignore_public_acls  = true
}
```

### `secrets.tf`

```hcl
locals {
  db_url = "postgresql://${var.db_username}:${var.db_password}@${aws_rds_cluster.aurora.endpoint}:5432/${var.db_name}?schema=public"
}
resource "aws_secretsmanager_secret" "db_url" { name = "/dentia/backend/DATABASE_URL" }
resource "aws_secretsmanager_secret_version" "db_url_v" {
  secret_id     = aws_secretsmanager_secret.db_url.id
  secret_string = local.db_url
}
```

### `route53.tf`

```hcl
# A/AAAA ALB aliases
resource "aws_route53_record" "app_a" {
  zone_id = var.hosted_zone_id
  name    = var.app_fqdn
  type    = "A"
  alias { name = aws_lb.app.dns_name zone_id = aws_lb.app.zone_id evaluate_target_health = false }
}
resource "aws_route53_record" "app_aaaa" {
  zone_id = var.hosted_zone_id
  name    = var.app_fqdn
  type    = "AAAA"
  alias { name = aws_lb.app.dns_name zone_id = aws_lb.app.zone_id evaluate_target_health = false }
}
resource "aws_route53_record" "api_a" {
  zone_id = var.hosted_zone_id
  name    = var.api_fqdn
  type    = "A"
  alias { name = aws_lb.app.dns_name zone_id = aws_lb.app.zone_id evaluate_target_health = false }
}
resource "aws_route53_record" "api_aaaa" {
  zone_id = var.hosted_zone_id
  name    = var.api_fqdn
  type    = "AAAA"
  alias { name = aws_lb.app.dns_name zone_id = aws_lb.app.zone_id evaluate_target_health = false }
}
```

### `outputs.tf`

```hcl
output "alb_dns"          { value = aws_lb.app.dns_name }
output "rds_writer"       { value = aws_rds_cluster.aurora.endpoint }
output "cognito_pool_id"  { value = aws_cognito_user_pool.pool.id }
output "cognito_hosted_ui" { value = "https://${aws_cognito_user_pool_domain.domain.domain}.auth.${var.region}.amazoncognito.com" }
output "media_bucket"     { value = aws_s3_bucket.media.bucket }
```

---

## 2) ECS task definitions (JSON templates)

**`ecs-task-def-frontend.json`**

```json
{
  "family": "frontend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "runtimePlatform": { "cpuArchitecture": "X86_64", "operatingSystemFamily": "LINUX" },
  "executionRoleArn": "arn:aws:iam::<AWS_ACCOUNT_ID>:role/ecs-task-exec",
  "containerDefinitions": [
    {
      "name": "frontend",
      "image": "<AWS_ACCOUNT_ID>.dkr.ecr.us-east-2.amazonaws.com/frontend:latest",
      "essential": true,
      "portMappings": [{ "containerPort": 3000, "protocol": "tcp" }],
      "environment": [
        { "name": "NEXTAUTH_URL", "value": "https://app.dentia.co" },
        { "name": "NEXT_PUBLIC_API_URL", "value": "https://api.dentia.co" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": { "awslogs-group": "/ecs/frontend", "awslogs-region": "us-east-2", "awslogs-stream-prefix": "ecs" }
      }
    }
  ]
}
```

**`ecs-task-def-backend.json`**

```json
{
  "family": "backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "runtimePlatform": { "cpuArchitecture": "X86_64", "operatingSystemFamily": "LINUX" },
  "executionRoleArn": "arn:aws:iam::<AWS_ACCOUNT_ID>:role/ecs-task-exec",
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "<AWS_ACCOUNT_ID>.dkr.ecr.us-east-2.amazonaws.com/backend:latest",
      "essential": true",
      "portMappings": [{ "containerPort": 4000, "protocol": "tcp" }],
      "environment": [
        { "name": "AWS_REGION", "value": "us-east-2" },
        { "name": "COGNITO_POOL_ID", "value": "<COGNITO_POOL_ID>" }
      ],
      "secrets": [
        { "name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:us-east-2:<AWS_ACCOUNT_ID>:secret:/dentia/backend/DATABASE_URL" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": { "awslogs-group": "/ecs/backend", "awslogs-region": "us-east-2", "awslogs-stream-prefix": "ecs" }
      }
    }
  ]
}
```

> Your GitHub Actions will replace placeholders before deploy.

---

## 3) GitHub Actions (build, push, deploy)

**`.github/workflows/deploy-frontend.yml`**

```yaml
name: Deploy Frontend (ECS)

on:
  push:
    branches: [ "main" ]
    paths: [ "apps/frontend/**", ".github/workflows/deploy-frontend.yml", "ecs-task-def-frontend.json" ]
  workflow_dispatch:

env:
  AWS_REGION: us-east-2
  ECR_REPOSITORY: frontend
  ECS_CLUSTER: dentia-cluster
  ECS_SERVICE: frontend

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-region: ${{ env.AWS_REGION }}
          role-to-assume: ${{ secrets.AWS_ROLE_TO_ASSUME }} # or set keys

      - uses: aws-actions/amazon-ecr-login@v2
        id: ecr

      - name: Build & push image
        run: |
          docker build -f infra/docker/frontend.Dockerfile -t $ECR_REPOSITORY:latest .
          docker tag $ECR_REPOSITORY:latest ${{ steps.ecr.outputs.registry }}/${{ env.ECR_REPOSITORY }}:latest
          docker push ${{ steps.ecr.outputs.registry }}/${{ env.ECR_REPOSITORY }}:latest

      - name: Render task def
        run: |
          sed -e "s|<AWS_ACCOUNT_ID>|${{ secrets.AWS_ACCOUNT_ID }}|g" ecs-task-def-frontend.json > td.json

      - name: Deploy ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: td.json
          service: ${{ env.ECS_SERVICE }}
          cluster: ${{ env.ECS_CLUSTER }}
          wait-for-service-stability: true
```

**`.github/workflows/deploy-backend.yml`**

```yaml
name: Deploy Backend (ECS)

on:
  push:
    branches: [ "main" ]
    paths: [ "apps/backend/**", ".github/workflows/deploy-backend.yml", "ecs-task-def-backend.json" ]
  workflow_dispatch:

env:
  AWS_REGION: us-east-2
  ECR_REPOSITORY: backend
  ECS_CLUSTER: dentia-cluster
  ECS_SERVICE: backend

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-region: ${{ env.AWS_REGION }}
          role-to-assume: ${{ secrets.AWS_ROLE_TO_ASSUME }}

      - uses: aws-actions/amazon-ecr-login@v2
        id: ecr

      - name: Build & push image
        run: |
          docker build -f infra/docker/backend.Dockerfile -t $ECR_REPOSITORY:latest .
          docker tag $ECR_REPOSITORY:latest ${{ steps.ecr.outputs.registry }}/${{ env.ECR_REPOSITORY }}:latest
          docker push ${{ steps.ecr.outputs.registry }}/${{ env.ECR_REPOSITORY }}:latest

      - name: Render task def
        run: |
          sed -e "s|<AWS_ACCOUNT_ID>|${{ secrets.AWS_ACCOUNT_ID }}|g" \
              -e "s|<COGNITO_POOL_ID>|${{ secrets.COGNITO_POOL_ID }}|g" \
              ecs-task-def-backend.json > td.json

      - name: Deploy ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: td.json
          service: ${{ env.ECS_SERVICE }}
          cluster: ${{ env.ECS_CLUSTER }}
          wait-for-service-stability: true
```

**GitHub Secrets to add (Repo → Settings → Secrets and variables → Actions):**

* `AWS_ACCOUNT_ID`
* `AWS_ROLE_TO_ASSUME` (or use access keys `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`)
* `COGNITO_POOL_ID`

---

## 4) What to click in the AWS Console (step-by-step)

1. **Route53**

   * Make sure `dentia.co` hosted zone exists; note its **Hosted Zone ID**.

2. **ACM (us-east-2)**

   * Request a public cert for `*.dentia.co`.
   * In Route53, approve the DNS validation records ACM gives you.
   * Wait until **Issued**.

3. **ECR**

   * Create **repositories**: `frontend`, `backend`.

4. **Secrets Manager**

   * Nothing manual if you use Terraform to create `/dentia/backend/DATABASE_URL`.
   * (Optional) Add Stripe keys, etc., as `/dentia/backend/STRIPE_KEY` later.

5. **Cognito**

   * User Pool created by Terraform.
   * In **Identity providers**, add **Google** (and Meta) → supply client id/secret.
   * In **App client settings (frontend)**, add Google to **Supported identity providers**.
   * Copy **User Pool ID** to GitHub secret `COGNITO_POOL_ID`.

6. **Terraform**

   * Set variables (using environment or `tfvars`):

     * `TF_VAR_domain="dentia.co"`
     * `TF_VAR_hosted_zone_id="Zxxxxxxx"`
     * `TF_VAR_db_password="<STRONG_PASSWORD>"`
   * First run can leave `frontend_image`/`backend_image` blank, or set dummy (we’ll update after first push).
   * `terraform init && terraform apply`

7. **Build & Push (first time)**

   * Push to `main` to trigger both workflows.
   * Workflows build images, push to ECR, render task defs, and update ECS services.
   * After first deploy, if Terraform needs the actual image URIs as variables, you can re-apply feeding the final URIs (optional).

8. **ALB & DNS**

   * After ECS services are **Stable**, copy **ALB DNS** from Terraform outputs.
   * Confirm `app.dentia.co` and `api.dentia.co` A/AAAA records point to ALB (Terraform created them).

9. **Makerkit config**

   * In **apps/frontend**, set NextAuth Cognito provider pointing to:

     * Issuer: `https://cognito-idp.us-east-2.amazonaws.com/<COGNITO_POOL_ID>`
     * Callback: `https://app.dentia.co/api/auth/callback/cognito`
   * In **apps/backend**, verify JWT via Cognito JWKS:

     * `https://cognito-idp.us-east-2.amazonaws.com/<COGNITO_POOL_ID>/.well-known/jwks.json`

10. **Media uploads**

    * Use **presigned S3 URLs** from the backend:

      * Backend signs `PUT` to S3 (media bucket from Terraform).
      * Frontend uploads directly to S3 (no function bloat).
      * Backend (or worker) processes via external APIs as needed.

---

## 5) Notes / Defaults you might tailor later

* **No NAT**: both ECS services are in **public subnets** with **public IPs** for outbound Internet; **ingress is only via ALB SG**.
* If you want backend **in private subnets** later, add a tiny **egress service** or a **NAT** or use **VPC endpoints** + vendor private connectivity.
* **CloudFront for `app.dentia.co`** is optional; ALB is fine for SSR.
* **Auto-scaling**: add ECS Service Auto Scaling with CPU/RT metrics once traffic grows.

---

If you want, I can also drop **Dockerfiles** for Makerkit (Next.js) and NestJS (multistage, production-ready) and a **Prisma migration script** that runs at container start (safe approach).


========================================

Proposed project structure:

dentia/
├── apps/
│   ├── frontend/                # Next.js (MakerKit, BoxyHQ, NextAuth)
│   └── backend/                 # NestJS core API + Prisma client
│
├── packages/
│   ├── prisma/                  # Shared Prisma schema + migration scripts
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   ├── seed.ts
│   │   └── package.json
│   └── shared/                  # Shared TypeScript types/interfaces
│       ├── src/
│       │   ├── types/
│       │   ├── dto/
│       │   └── utils/
│       └── package.json
│
├── infra/
│   ├── docker/
│   │   ├── frontend.Dockerfile
│   │   └── backend.Dockerfile
│   ├── ecs/
│   │   ├── task-definitions/
│   │   │   ├── frontend-task.json
│   │   │   └── backend-task.json
│   │   ├── services/
│   │   │   ├── frontend-service.tf
│   │   │   └── backend-service.tf
│   │   └── cluster.tf
│   ├── github-actions/
│   │   ├── deploy-frontend.yml
│   │   └── deploy-backend.yml
│   └── docker-compose.yml       # For local dev (frontend + backend + DB)
│
├── .github/
│   └── workflows/               # or put CI/CD YAMLs here
│
├── package.json                 # workspace root
├── tsconfig.json
└── README.md
