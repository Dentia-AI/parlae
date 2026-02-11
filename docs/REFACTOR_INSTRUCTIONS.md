# Backend Refactor: Complete Migration Instructions

## Executive Summary

This refactor moves all business logic from Frontend (Next.js) to Backend (NestJS).

**Estimated Time**: 2-3 days
**Complexity**: Medium-High  
**Risk**: Medium (requires Vapi/Twilio webhook URL updates)

## Quick Start

```bash
# 1. Install dependencies in backend
cd apps/backend
npm install axios class-validator class-transformer

# 2. Follow the step-by-step instructions below
```

## Part 1: PMS Module Migration

### Step 1.1: Copy Type Files

Copy these files from frontend to backend:

```bash
# Source: apps/frontend/packages/shared/src/pms/
# Destination: apps/backend/src/pms/interfaces/

cp apps/frontend/packages/shared/src/pms/types.ts \
   apps/backend/src/pms/interfaces/pms.types.ts

cp apps/frontend/packages/shared/src/pms/pms-service.interface.ts \
   apps/backend/src/pms/interfaces/pms-service.interface.ts
```

### Step 1.2: Copy Sikka Services

```bash
# Create providers directory
mkdir -p apps/backend/src/pms/providers

# Copy Sikka implementation files
cp apps/frontend/packages/shared/src/pms/sikka.service.ts \
   apps/backend/src/pms/providers/sikka.service.ts

cp apps/frontend/packages/shared/src/pms/sikka-token-refresh.service.ts \
   apps/backend/src/pms/providers/sikka-token.service.ts

cp apps/frontend/packages/shared/src/pms/sikka-writeback.service.ts \
   apps/backend/src/pms/providers/sikka-writeback.service.ts
```

### Step 1.3: Convert to NestJS Services

**After copying**, make these changes to each service file:

```typescript
// Add NestJS decorator at the top of each service class:
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SikkaService extends BasePmsService {
  constructor(private prisma: PrismaService) {
    // Keep existing constructor logic
  }
  // ... rest of class
}
```

### Step 1.4: Create PMS Controller

File: `apps/backend/src/pms/pms.controller.ts`

```typescript
import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { PmsService } from './pms.service';
import { SetupPmsDto } from './dto/setup-pms.dto';

@Controller('pms')
@UseGuards(CognitoAuthGuard)
export class PmsController {
  constructor(private readonly pmsService: PmsService) {}

  @Post('setup')
  async setupPms(@Body() dto: SetupPmsDto, @Req() req: any) {
    const userId = req.user.sub; // From Cognito JWT
    return this.pmsService.setupPmsIntegration(userId, dto);
  }

  @Get('status')
  async getStatus(@Req() req: any) {
    const userId = req.user.sub;
    return this.pmsService.getPmsStatus(userId);
  }
}
```

### Step 1.5: Create PMS Service (Orchestrator)

File: `apps/backend/src/pms/pms.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SikkaService } from './providers/sikka.service';
import { SetupPmsDto } from './dto/setup-pms.dto';
import * as crypto from 'crypto';

@Injectable()
export class PmsService {
  private readonly logger = new Logger(PmsService.name);

  constructor(
    private prisma: PrismaService,
    private sikkaService: SikkaService,
  ) {}

  async setupPmsIntegration(userId: string, dto: SetupPmsDto) {
    this.logger.log(`Setting up ${dto.provider} PMS for user ${userId}`);
    
    // 1. Get user's account
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { include: { account: true } } },
    });
    
    if (!user || !user.memberships[0]) {
      throw new Error('No account found for user');
    }
    
    const account = user.memberships[0].account;
    
    // 2. Test connection
    const pmsService = this.createPmsService(
      dto.provider,
      account.id,
      dto.credentials,
      dto.config
    );
    
    const connectionTest = await pmsService.testConnection();
    
    if (!connectionTest.success) {
      throw new Error(connectionTest.error?.message || 'Connection failed');
    }
    
    // 3. Get features
    const features = await pmsService.getFeatures();
    
    // 4. Encrypt and save credentials
    const encryptedCredentials = this.encrypt(dto.credentials);
    
    await this.prisma.pmsIntegration.upsert({
      where: { accountId: account.id },
      create: {
        accountId: account.id,
        provider: dto.provider,
        providerName: this.getProviderName(dto.provider),
        credentials: encryptedCredentials,
        config: dto.config || {},
        features: features.data || {},
        status: 'active',
      },
      update: {
        credentials: encryptedCredentials,
        config: dto.config || {},
        features: features.data || {},
        status: 'active',
        updatedAt: new Date(),
      },
    });
    
    return { success: true, provider: dto.provider };
  }

  async getPmsStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: true },
    });
    
    if (!user || !user.memberships[0]) {
      throw new Error('No account found');
    }
    
    const integrations = await this.prisma.pmsIntegration.findMany({
      where: { accountId: user.memberships[0].accountId },
      select: {
        id: true,
        provider: true,
        providerName: true,
        status: true,
        lastSyncAt: true,
        lastError: true,
        features: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    
    return { success: true, integrations };
  }

  private createPmsService(provider: string, accountId: string, credentials: any, config: any) {
    switch (provider) {
      case 'SIKKA':
        return new SikkaService(accountId, credentials, config);
      default:
        throw new Error(`Unsupported PMS provider: ${provider}`);
    }
  }

  private getProviderName(provider: string): string {
    const names = {
      SIKKA: 'Sikka',
      KOLLA: 'Kolla',
      DENTRIX: 'Dentrix',
      EAGLESOFT: 'Eaglesoft',
      OPEN_DENTAL: 'Open Dental',
      CUSTOM: 'Custom',
    };
    return names[provider] || provider;
  }

  private encrypt(data: any): string {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return JSON.stringify({
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    });
  }

  private decrypt(encryptedData: string): any {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
    
    const { encrypted, iv, authTag } = JSON.parse(encryptedData);
    
    const decipher = crypto.createDecipheriv(
      algorithm,
      key,
      Buffer.from(iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }
}
```

### Step 1.6: Register PMS Module

Add to `apps/backend/src/app.module.ts`:

```typescript
import { PmsModule } from './pms/pms.module';

@Module({
  imports: [
    // ... existing imports
    PmsModule,
  ],
  // ...
})
export class AppModule {}
```

## Part 2: Vapi Module Migration

### Step 2.1: Create Vapi Module Structure

```bash
mkdir -p apps/backend/src/vapi/tools
mkdir -p apps/backend/src/vapi/dto
```

### Step 2.2: Copy Vapi Service

```bash
cp apps/frontend/packages/shared/src/vapi/vapi.service.ts \
   apps/backend/src/vapi/vapi.service.ts
```

Convert to NestJS injectable service (add `@Injectable()` decorator).

### Step 2.3: Create Vapi Tools Controller

File: `apps/backend/src/vapi/vapi-tools.controller.ts`

```typescript
import { Controller, Post, Body, Headers, HttpException, HttpStatus } from '@nestjs/common';
import { VapiToolsService } from './vapi-tools.service';

@Controller('vapi/tools')
export class VapiToolsController {
  constructor(private readonly vapiToolsService: VapiToolsService) {}

  @Post('book-appointment')
  async bookAppointment(@Body() body: any, @Headers('x-vapi-signature') signature: string) {
    this.verifyWebhookSignature(signature);
    return this.vapiToolsService.bookAppointment(body);
  }

  @Post('check-availability')
  async checkAvailability(@Body() body: any, @Headers('x-vapi-signature') signature: string) {
    this.verifyWebhookSignature(signature);
    return this.vapiToolsService.checkAvailability(body);
  }

  @Post('transfer-to-human')
  async transferToHuman(@Body() body: any, @Headers('x-vapi-signature') signature: string) {
    this.verifyWebhookSignature(signature);
    return this.vapiToolsService.transferToHuman(body);
  }

  private verifyWebhookSignature(signature: string) {
    if (signature !== process.env.VAPI_WEBHOOK_SECRET) {
      throw new HttpException('Invalid signature', HttpStatus.UNAUTHORIZED);
    }
  }
}
```

## Part 3: Twilio Module Migration

### Step 3.1: Create Twilio Module

```bash
mkdir -p apps/backend/src/twilio/dto
```

### Step 3.2: Copy Twilio Service

```bash
cp apps/frontend/packages/shared/src/twilio/twilio.service.ts \
   apps/backend/src/twilio/twilio.service.ts
```

### Step 3.3: Create Twilio Voice Controller

File: `apps/backend/src/twilio/twilio-voice.controller.ts`

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { TwilioVoiceService } from './twilio-voice.service';

@Controller('twilio')
export class TwilioVoiceController {
  constructor(private readonly twilioVoiceService: TwilioVoiceService) {}

  @Post('voice')
  async handleVoiceWebhook(@Body() body: any) {
    // Copy logic from apps/frontend/apps/web/app/api/twilio/voice/route.ts
    return this.twilioVoiceService.handleInboundCall(body);
  }
}
```

## Part 4: Frontend Cleanup

### Step 4.1: Delete Frontend API Routes

```bash
# Delete PMS API routes
rm -rf apps/frontend/apps/web/app/api/pms/setup
rm -rf apps/frontend/apps/web/app/api/pms/appointments
rm -rf apps/frontend/apps/web/app/api/pms/patients

# Delete Vapi tool routes
rm -rf apps/frontend/apps/web/app/api/vapi/tools

# Delete Twilio routes
rm -rf apps/frontend/apps/web/app/api/twilio/voice

# Delete shared services (they're now in backend)
rm -rf apps/frontend/packages/shared/src/pms
rm -rf apps/frontend/packages/shared/src/vapi/vapi.service.ts
rm -rf apps/frontend/packages/shared/src/twilio/twilio.service.ts
```

### Step 4.2: Update Frontend to Call Backend

Update PMS setup page to call backend API:

```typescript
// apps/frontend/apps/web/app/home/agent/setup/pms/page.tsx
async function setupPms(data: any) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/pms/setup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${await getAccessToken()}`,
    },
    body: JSON.stringify(data),
  });
  return response.json();
}
```

## Part 5: Configuration Updates

### Step 5.1: Update Environment Variables

**Backend** (`apps/backend/.env`):
```bash
# PMS
SIKKA_API_KEY=your_key
SIKKA_API_SECRET=your_secret
ENCRYPTION_KEY=your_32_byte_hex_key

# Vapi
VAPI_API_KEY=your_vapi_key
VAPI_WEBHOOK_SECRET=your_webhook_secret

# Twilio
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token

# Database (if not already set)
DATABASE_URL=postgresql://...
```

**Frontend** (`apps/frontend/apps/web/.env`):
```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000  # Development
# NEXT_PUBLIC_BACKEND_URL=https://api.parlae.ai  # Production
```

### Step 5.2: Update Vapi Dashboard

1. Go to Vapi dashboard
2. Update tool webhook URLs:
   - FROM: `https://app.parlae.ai/api/vapi/tools/book-appointment`
   - TO: `https://api.parlae.ai/vapi/tools/book-appointment`

3. Update all tool URLs similarly

### Step 5.3: Update Twilio Dashboard

1. Go to Twilio dashboard
2. Update voice webhook URL:
   - FROM: `https://app.parlae.ai/api/twilio/voice`
   - TO: `https://api.parlae.ai/twilio/voice`

## Testing Checklist

- [ ] Backend starts without errors (`npm run start:dev`)
- [ ] PMS setup endpoint works (`POST /pms/setup`)
- [ ] PMS status endpoint works (`GET /pms/status`)
- [ ] Vapi tools respond to webhooks
- [ ] Twilio voice webhook handles calls
- [ ] Frontend can call backend APIs
- [ ] Authentication works end-to-end
- [ ] Make a test phone call

## Rollback Plan

If something goes wrong:

1. Keep old frontend API routes for 1 week
2. Add routing logic to try backend first, fallback to frontend
3. Monitor logs for errors
4. Gradually shift traffic to backend
5. Remove frontend routes after verification

## Estimated Timeline

- **Day 1**: Parts 1-2 (PMS & Vapi modules)
- **Day 2**: Part 3 (Twilio module) + Testing
- **Day 3**: Parts 4-5 (Frontend cleanup + Config updates)

## Support

If you need help:
1. Check `/docs/REFACTOR_PROGRESS.md` for current status
2. Review error logs in both frontend and backend
3. Test each endpoint individually with curl/Postman
4. Verify authentication tokens are being passed correctly
