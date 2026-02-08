# Database Migration: Phone Integration

```sql
-- Migration: Add phone integration settings
-- File: packages/prisma/migrations/YYYYMMDD_add_phone_integration/migration.sql

-- Add phone integration method to accounts
ALTER TABLE public.accounts
ADD COLUMN IF NOT EXISTS phone_integration_method TEXT 
  CHECK (phone_integration_method IN ('none', 'ported', 'forwarded', 'sip', 'pending'))
  DEFAULT 'none',
ADD COLUMN IF NOT EXISTS phone_integration_settings JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS ai_availability_settings JSONB DEFAULT '{
  "mode": "always",
  "afterHours": {
    "enabled": false,
    "businessHours": {
      "timezone": "America/Toronto",
      "schedule": {
        "monday": {"open": "09:00", "close": "17:00"},
        "tuesday": {"open": "09:00", "close": "17:00"},
        "wednesday": {"open": "09:00", "close": "17:00"},
        "thursday": {"open": "09:00", "close": "17:00"},
        "friday": {"open": "09:00", "close": "17:00"},
        "saturday": null,
        "sunday": null
      },
      "holidays": []
    }
  },
  "highVolume": {
    "enabled": false,
    "threshold": 5,
    "estimatedWaitMinutes": 10
  },
  "customSchedule": {
    "enabled": false,
    "rules": []
  },
  "fallback": {
    "type": "voicemail",
    "forwardNumber": null,
    "voicemailGreeting": null
  }
}'::jsonb;

-- Update vapi_phone_numbers table
ALTER TABLE public.vapi_phone_numbers
ADD COLUMN IF NOT EXISTS integration_method TEXT 
  CHECK (integration_method IN ('ported', 'forwarded', 'sip'))
  DEFAULT 'ported',
ADD COLUMN IF NOT EXISTS original_phone_number TEXT, -- Clinic's original number
ADD COLUMN IF NOT EXISTS twilio_number TEXT, -- Forwarding target (if using forwarding)
ADD COLUMN IF NOT EXISTS sip_uri TEXT, -- SIP URI (if using SIP)
ADD COLUMN IF NOT EXISTS staff_forward_number TEXT, -- Number to transfer to human
ADD COLUMN IF NOT EXISTS transfer_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS integration_status TEXT 
  CHECK (integration_status IN ('pending', 'active', 'testing', 'failed'))
  DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS integration_completed_at TIMESTAMPTZ;

-- Add index for SIP URI lookups
CREATE INDEX IF NOT EXISTS idx_vapi_phone_numbers_sip_uri 
ON public.vapi_phone_numbers(sip_uri) 
WHERE sip_uri IS NOT NULL;

-- Add index for Twilio number lookups
CREATE INDEX IF NOT EXISTS idx_vapi_phone_numbers_twilio_number 
ON public.vapi_phone_numbers(twilio_number) 
WHERE twilio_number IS NOT NULL;

-- Comments
COMMENT ON COLUMN public.accounts.phone_integration_method IS 
  'Method used to integrate phone: none, ported (full port to Twilio), forwarded (call forwarding), sip (PBX integration), or pending (in setup)';

COMMENT ON COLUMN public.accounts.phone_integration_settings IS 
  'Integration-specific settings like port request ID, forwarding instructions, SIP credentials';

COMMENT ON COLUMN public.accounts.ai_availability_settings IS 
  'Settings controlling when AI should answer calls (always, after-hours, overflow, scheduled, disabled)';

COMMENT ON COLUMN public.vapi_phone_numbers.original_phone_number IS 
  'Clinic''s original phone number that patients call (format: +1XXXXXXXXXX)';

COMMENT ON COLUMN public.vapi_phone_numbers.twilio_number IS 
  'Twilio number used for forwarding or ported number';

COMMENT ON COLUMN public.vapi_phone_numbers.sip_uri IS 
  'SIP URI for PBX integration (e.g., clinic-slug@parlae.sip.twilio.com)';

COMMENT ON COLUMN public.vapi_phone_numbers.staff_forward_number IS 
  'Phone number to transfer calls to when human intervention needed';

-- Sample data for testing
-- INSERT INTO public.accounts (
--   id, name, slug, phone_integration_method, 
--   phone_integration_settings, ai_availability_settings
-- ) VALUES (
--   gen_random_uuid(),
--   'Test Dental Clinic',
--   'test-dental',
--   'sip',
--   '{"sipUri": "test-dental@parlae.sip.twilio.com"}'::jsonb,
--   '{"mode": "after-hours-only"}'::jsonb
-- );
```

## TypeScript Types

```typescript
// types/phone-integration.ts

export type PhoneIntegrationMethod = 
  | 'none'      // Not set up yet
  | 'ported'    // Number ported to Twilio
  | 'forwarded' // Call forwarding to Twilio
  | 'sip'       // PBX SIP trunk integration
  | 'pending';  // Setup in progress

export type IntegrationStatus = 
  | 'pending'   // Waiting for setup
  | 'testing'   // In test mode
  | 'active'    // Live and active
  | 'failed';   // Setup failed

export type AvailabilityMode =
  | 'always'            // AI always answers
  | 'after-hours-only'  // AI only when clinic closed
  | 'overflow-only'     // AI only when staff busy
  | 'scheduled'         // Custom schedule
  | 'disabled';         // AI disabled

export type FallbackType =
  | 'voicemail'  // Send to voicemail
  | 'forward'    // Forward to staff number
  | 'busy-signal'; // Play busy signal

export interface PhoneIntegrationSettings {
  // Ported settings
  portRequestId?: string;
  portCompletedAt?: string;
  
  // Forwarding settings
  forwardingSetupInstructions?: string;
  forwardingVerified?: boolean;
  
  // SIP settings
  sipUri?: string;
  sipUsername?: string;
  sipPassword?: string;
  sipAllowedIps?: string[];
}

export interface AvailabilitySettings {
  mode: AvailabilityMode;
  
  afterHours: {
    enabled: boolean;
    businessHours: {
      timezone: string;
      schedule: {
        monday: { open: string; close: string } | null;
        tuesday: { open: string; close: string } | null;
        wednesday: { open: string; close: string } | null;
        thursday: { open: string; close: string } | null;
        friday: { open: string; close: string } | null;
        saturday: { open: string; close: string } | null;
        sunday: { open: string; close: string } | null;
      };
      holidays: string[]; // ISO date strings
    };
  };
  
  highVolume: {
    enabled: boolean;
    threshold: number; // Max concurrent calls
    estimatedWaitMinutes: number;
  };
  
  customSchedule: {
    enabled: boolean;
    rules: Array<{
      dayOfWeek: number; // 0-6
      startTime: string; // "09:00"
      endTime: string; // "17:00"
      action: 'enable' | 'disable';
    }>;
  };
  
  fallback: {
    type: FallbackType;
    forwardNumber?: string; // E.164 format
    voicemailGreeting?: string;
  };
}

export interface PhoneIntegration {
  id: string;
  accountId: string;
  integrationMethod: PhoneIntegrationMethod;
  integrationStatus: IntegrationStatus;
  
  // Phone numbers
  originalPhoneNumber: string; // What patients call
  twilioNumber?: string; // Twilio number (if forwarding or ported)
  sipUri?: string; // SIP URI (if using SIP)
  
  // Staff contact
  staffForwardNumber?: string; // For transfer to human
  transferEnabled: boolean;
  
  // Vapi integration
  vapiPhoneId?: string;
  vapiSquadId?: string;
  
  // Settings
  integrationSettings: PhoneIntegrationSettings;
  availabilitySettings: AvailabilitySettings;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  integrationCompletedAt?: Date;
}
```
