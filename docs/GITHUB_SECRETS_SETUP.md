# GitHub Secrets Setup for Production Deployment

## Required Secrets

The production deployment needs the following GitHub secrets to be configured:

### Cognito Secrets (from Terraform)

1. **`COGNITO_CLIENT_ID`**
2. **`COGNITO_CLIENT_SECRET`**  
3. **`COGNITO_ISSUER`**
4. **`NEXTAUTH_SECRET`**

## How to Get Values from Terraform

### Step 1: Get Terraform Outputs

```bash
# Navigate to infrastructure directory
cd /Users/shaunk/Projects/Parlae-AI/parlae-infra/infra/ecs

# Get Cognito values from Terraform state
terraform output cognito_client_id
terraform output cognito_client_secret
terraform output cognito_user_pool_id
```

### Step 2: Construct COGNITO_ISSUER

The `COGNITO_ISSUER` format is:
```
https://cognito-idp.{region}.amazonaws.com/{user_pool_id}
```

For example, if:
- Region: `us-east-1`
- User Pool ID: `us-east-1_AbCdEfGhI`

Then:
```
COGNITO_ISSUER=https://cognito-idp.us-east-1.amazonaws.com/us-east-1_AbCdEfGhI
```

### Step 3: Generate NEXTAUTH_SECRET

```bash
# Generate a secure random secret (minimum 32 characters)
openssl rand -base64 32
```

## Adding Secrets to GitHub

### Option 1: Using GitHub CLI (Recommended)

```bash
cd /Users/shaunk/Projects/Parlae-AI/parlae

# Set each secret
gh secret set COGNITO_CLIENT_ID --body "your-client-id-from-terraform"
gh secret set COGNITO_CLIENT_SECRET --body "your-client-secret-from-terraform"  
gh secret set COGNITO_ISSUER --body "https://cognito-idp.us-east-1.amazonaws.com/your-pool-id"
gh secret set NEXTAUTH_SECRET --body "your-generated-secret-32-chars-minimum"
```

### Option 2: Using GitHub Web Interface

1. Go to: https://github.com/YOUR-ORG/parlae/settings/secrets/actions
2. Click "New repository secret"
3. Add each secret:
   - Name: `COGNITO_CLIENT_ID`
   - Value: (paste from terraform output)
4. Repeat for all secrets

## Automated Setup Script

Create this script to automate the process:

```bash
#!/bin/bash
# setup-github-secrets.sh

set -e

echo "🔐 Setting up GitHub Secrets for Parlae..."

# Navigate to terraform directory
cd /Users/shaunk/Projects/Parlae-AI/parlae-infra/infra/ecs

# Get values from Terraform
echo "📦 Fetching Cognito values from Terraform..."
CLIENT_ID=$(terraform output -raw cognito_client_id)
CLIENT_SECRET=$(terraform output -raw cognito_client_secret)
USER_POOL_ID=$(terraform output -raw cognito_user_pool_id)
REGION="us-east-1"

# Construct COGNITO_ISSUER
COGNITO_ISSUER="https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}"

# Generate NEXTAUTH_SECRET if not exists
if ! gh secret list | grep -q "NEXTAUTH_SECRET"; then
  echo "🔑 Generating new NEXTAUTH_SECRET..."
  NEXTAUTH_SECRET=$(openssl rand -base64 32)
else
  echo "✅ NEXTAUTH_SECRET already exists, skipping..."
  NEXTAUTH_SECRET="" # Don't overwrite
fi

# Navigate to parlae repo
cd /Users/shaunk/Projects/Parlae-AI/parlae

# Set secrets
echo "📝 Setting GitHub secrets..."
echo "$CLIENT_ID" | gh secret set COGNITO_CLIENT_ID
echo "$CLIENT_SECRET" | gh secret set COGNITO_CLIENT_SECRET
echo "$COGNITO_ISSUER" | gh secret set COGNITO_ISSUER

if [ -n "$NEXTAUTH_SECRET" ]; then
  echo "$NEXTAUTH_SECRET" | gh secret set NEXTAUTH_SECRET
fi

echo "✅ All secrets configured!"
echo ""
echo "📋 Summary:"
echo "  COGNITO_CLIENT_ID: ${CLIENT_ID:0:10}..."
echo "  COGNITO_CLIENT_SECRET: ********"
echo "  COGNITO_ISSUER: $COGNITO_ISSUER"
echo "  NEXTAUTH_SECRET: ********"
```

Save and run:
```bash
chmod +x setup-github-secrets.sh
./setup-github-secrets.sh
```

## Verification

After setting secrets, verify they exist:

```bash
cd /Users/shaunk/Projects/Parlae-AI/parlae
gh secret list
```

Expected output:
```
AWS_ACCESS_KEY_ID          Updated 2026-02-11
AWS_REGION                 Updated 2026-02-11
AWS_SECRET_ACCESS_KEY      Updated 2026-02-11
COGNITO_CLIENT_ID          Updated 2026-02-11  ← Should appear
COGNITO_CLIENT_SECRET      Updated 2026-02-11  ← Should appear
COGNITO_ISSUER             Updated 2026-02-11  ← Should appear
ECR_REPOSITORY             Updated 2026-01-31
NEXTAUTH_SECRET            Updated 2026-02-11  ← Should appear
STRIPE_PUBLISHABLE_KEY_PROD Updated 2026-01-31
```

## How It Works in CI/CD

### Build Phase (Docker)

The deployment workflow passes these as build args:

```yaml
docker buildx build \
  --build-arg COGNITO_CLIENT_ID="${{ secrets.COGNITO_CLIENT_ID }}" \
  --build-arg COGNITO_CLIENT_SECRET="${{ secrets.COGNITO_CLIENT_SECRET }}" \
  --build-arg COGNITO_ISSUER="${{ secrets.COGNITO_ISSUER }}" \
  --build-arg NEXTAUTH_SECRET="${{ secrets.NEXTAUTH_SECRET }}" \
  ...
```

### Runtime Phase (Container)

The actual Cognito values are:
1. **Build-time**: Embedded in the Docker image (safe - no sensitive logic in build)
2. **Runtime**: Also available from ECS Task Definition environment variables
3. **Validation**: Code checks if values contain "dummy" to skip validation during local CI

## Security Notes

✅ **Safe**:
- Storing in GitHub Secrets (encrypted at rest)
- Passing as Docker build args (only in CI environment)
- Using real values for production builds

⚠️ **Important**:
- Never commit secrets to git
- Rotate secrets if exposed
- Use terraform outputs as single source of truth
- Keep GitHub Secrets in sync with Terraform

## Troubleshooting

### Error: "COGNITO_CLIENT_ID is not set"

**Cause**: Secret not configured in GitHub

**Fix**: Run the setup script above

### Error: "Secret not found"

**Cause**: Running locally without secrets

**Fix**: Use `.env.local` for local development:
```bash
COGNITO_CLIENT_ID=your-dev-client-id
COGNITO_CLIENT_SECRET=your-dev-client-secret
COGNITO_ISSUER=https://cognito-idp.us-east-1.amazonaws.com/your-pool
NEXTAUTH_SECRET=your-local-secret-32-chars-minimum
```

### Build succeeds but auth fails at runtime

**Cause**: Mismatch between build-time and runtime values

**Fix**: Ensure ECS Task Definition has the same Cognito values from Terraform

## Related Files

- `.github/workflows/deploy-frontend.yml` - Uses secrets for deployment
- `infra/docker/frontend.Dockerfile` - Accepts build args
- `apps/frontend/packages/shared/src/auth/nextauth.ts` - Validates secrets
- `parlae-infra/infra/ecs/cognito.tf` - Source of truth for Cognito config
