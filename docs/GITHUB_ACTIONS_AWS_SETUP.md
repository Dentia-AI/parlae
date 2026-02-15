# GitHub Actions AWS Setup

## Current Configuration

- **AWS Account ID**: `234270344223`
- **AWS Region**: `us-east-2`
- **AWS Profile (local)**: `parlae`
- **AWS User**: `shaun-parlae`
- **ECR Registry**: `234270344223.dkr.ecr.us-east-2.amazonaws.com`

## ECR Repositories

1. **Backend**: `234270344223.dkr.ecr.us-east-2.amazonaws.com/parlae-backend`
2. **Frontend**: `234270344223.dkr.ecr.us-east-2.amazonaws.com/parlae-frontend`

## Required GitHub Secrets

Configure these at: `https://github.com/Dentia-AI/parlae/settings/secrets/actions`

| Secret Name | Value (example) |
|-------------|-----------------|
| `AWS_REGION` | `us-east-2` |
| `ECR_REPOSITORY` | `234270344223.dkr.ecr.us-east-2.amazonaws.com` |
| `AWS_ACCESS_KEY_ID` | Get from `~/.aws/credentials` under `[parlae]` profile |
| `AWS_SECRET_ACCESS_KEY` | Get from `~/.aws/credentials` under `[parlae]` profile |

## How to Get Your Secret Access Key

```bash
# View your credentials file
cat ~/.aws/credentials | grep -A 2 "\[parlae\]"
```

The output will show:
```
[parlae]
aws_access_key_id = AKIA...yourkey
aws_secret_access_key = <your-secret-key>
```

Copy both values into GitHub Secrets.

## Verify GitHub Actions Setup

After setting the secrets, the workflow should:

1. ✅ Authenticate with AWS using the credentials
2. ✅ Login to ECR registry at `234270344223.dkr.ecr.us-east-2.amazonaws.com`
3. ✅ Build Docker image
4. ✅ Push to ECR repository `parlae-backend`
5. ✅ Trigger ECS service update

## Test Locally

To test the deployment process locally:

```bash
# Login to ECR
aws ecr get-login-password --region us-east-2 --profile parlae | \
  docker login --username AWS --password-stdin 234270344223.dkr.ecr.us-east-2.amazonaws.com

# Build the image
docker build -t parlae-backend:test -f infra/docker/backend.Dockerfile .

# Tag the image
docker tag parlae-backend:test 234270344223.dkr.ecr.us-east-2.amazonaws.com/parlae-backend:test

# Push to ECR
docker push 234270344223.dkr.ecr.us-east-2.amazonaws.com/parlae-backend:test
```

## Troubleshooting

### 401 Unauthorized Error

If you get a 401 error:

1. **Check GitHub Secrets**: Ensure all 4 secrets are set correctly
2. **Verify AWS Credentials**: Run `aws sts get-caller-identity --profile parlae`
3. **Check IAM Permissions**: Ensure the user has ECR and ECS permissions
4. **Verify Region**: Confirm `AWS_REGION` is set to `us-east-2`

### Required IAM Permissions

The `shaun-parlae` user needs these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:DescribeRepositories"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecs:UpdateService",
        "ecs:DescribeServices"
      ],
      "Resource": "*"
    }
  ]
}
```

## Check Current IAM Permissions

```bash
# List attached policies
aws iam list-attached-user-policies --user-name shaun-parlae --profile parlae

# List inline policies
aws iam list-user-policies --user-name shaun-parlae --profile parlae
```
