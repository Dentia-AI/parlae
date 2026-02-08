# AI Agent Setup Wizard Fix Summary

## Issue
The AI Agent setup wizard (step 2 - customize page) was not loading voice options, and Server Actions were failing with 500 errors.

## Root Causes

### 1. Missing API Endpoints
The frontend was trying to fetch from two endpoints that didn't exist:
- `/api/ghl/voices` - For fetching available AI voice options
- `/api/ghl/phone/available` - For fetching available phone numbers

### 2. Header Mismatch in Server Actions
In local development, there was a mismatch between the `x-forwarded-host` and `origin` headers:
- `next.config.mjs` was setting `x-forwarded-host: localhost:3000`
- `proxy.ts` middleware was setting `x-forwarded-host: localhost` (without port)
- This caused Next.js to reject Server Actions with: "Invalid Server Actions request"

## Fixes Applied

### 1. Enhanced GoHighLevel Service (`gohighlevel.service.ts`)

Added two new methods to the GHL service:

#### `getVoices()` Method
- **Purpose**: Returns available AI voice options
- **Implementation**: 
  - GHL's Voices API is marked as "coming soon" in their documentation
  - Returns a curated list of 6 common voice options that work with GHL
  - Includes: Sarah, James, Emily, Michael, Sophia, David
  - Each voice has id, name, gender, language, accent, and description
- **Future**: Replace with actual GHL Voices API endpoint when available

#### `getActivePhoneNumbers()` Method
- **Purpose**: Fetches phone numbers already purchased for the location
- **Implementation**:
  - Uses GHL Phone System API: `GET /phone-system/numbers/location/{locationId}`
  - Maps GHL response format to our application format
  - Includes phoneNumber, friendlyName, city, state, capabilities, monthlyPrice
- **Note**: GHL doesn't have a public API to search for available numbers to purchase
  - This shows active/purchased numbers only
  - New numbers must be purchased through GHL UI or direct Twilio integration

Added new TypeScript interfaces:
```typescript
interface GHLVoice {
  id: string;
  name: string;
  gender: 'male' | 'female';
  language: string;
  accent?: string;
  description?: string;
}

interface GHLPhoneNumber {
  phoneNumber: string;
  friendlyName: string;
  city: string;
  state: string;
  capabilities: string[];
  monthlyPrice?: number;
}
```

### 2. Created `/api/ghl/voices/route.ts`
- Uses `createGoHighLevelService().getVoices()`
- Checks if GHL integration is enabled (requires `GHL_API_KEY` and `GHL_LOCATION_ID`)
- Returns voices list or empty array if service is disabled
- Includes proper error handling and logging

### 3. Created `/api/ghl/phone/available/route.ts`
- Uses `createGoHighLevelService().getActivePhoneNumbers()`
- Fetches active phone numbers from GHL location
- Returns empty array if no numbers are available or service is disabled
- Includes proper error handling and logging

### 4. Fixed `next.config.mjs` Header Configuration
Changed the `x-forwarded-host` header in development from `localhost:3000` to `localhost` to match what the proxy middleware sets. This resolves the Server Actions validation error.

## Environment Variables Required

For the GHL integration to work, ensure these environment variables are set:

```bash
GHL_API_KEY=your_ghl_api_key
GHL_LOCATION_ID=your_ghl_location_id
```

Without these, the endpoints will return empty arrays but won't fail.

## Files Modified

1. `/packages/shared/src/gohighlevel/gohighlevel.service.ts` (enhanced with new methods)
2. `/packages/shared/src/gohighlevel/server.ts` (exported new types)
3. `/apps/web/app/api/ghl/voices/route.ts` (new, uses GHL service)
4. `/apps/web/app/api/ghl/phone/available/route.ts` (new, uses GHL service)
5. `/apps/web/next.config.mjs` (fixed header)

## Testing

After these changes:
1. The voice selection options should now load on the customize page
2. Phone number options will show if you have active numbers in your GHL location
3. Server Actions should work without 500 errors
4. The form should be functional and able to proceed to the next step

## API Limitations

### GoHighLevel Voices API
- **Status**: "Coming Soon" per GHL documentation
- **Current Solution**: Curated list of common voice options
- **Action Required**: Update to use actual API when GHL releases it

### GoHighLevel Phone Numbers API
- **Available**: `GET /phone-system/numbers/location/{locationId}` (active numbers only)
- **Not Available**: Search for available numbers to purchase
- **Workaround**: Numbers must be purchased through GHL UI first
- **Future Enhancement**: Could integrate directly with Twilio API for number search/purchase

## Next Steps

1. ✅ Use GHL service instead of mock data
2. ✅ Add proper error handling
3. ⏳ Replace voice list with actual GHL Voices API when released
4. ⏳ Consider direct Twilio integration for phone number provisioning
5. ⏳ Add frontend error handling for network failures
