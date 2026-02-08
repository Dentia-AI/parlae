# GoHighLevel Agency-Level Phone Number Management

## Overview

This document explains how to work with phone numbers at the agency level in GoHighLevel, including limitations and workarounds.

## API Capabilities

### ✅ What You CAN Do with the API

#### 1. List Active Numbers per Location
```typescript
GET /api/ghl/phone/available
```
Returns phone numbers for the configured `GHL_LOCATION_ID`.

#### 2. List Numbers for Multiple Locations (Agency-Level)
```typescript
GET /api/ghl/phone/available?locationIds=loc1,loc2,loc3
```
Returns phone numbers across multiple sub-accounts. Requires agency-level API key.

Response includes:
- `phoneNumbers`: Flattened array of all numbers
- `byLocation`: Object mapping location IDs to their numbers

#### 3. List Number Pools
```typescript
GET /api/ghl/phone/pools
```
Returns number pools (shared phone numbers) for the location.

Number pools allow multiple campaigns to share the same set of phone numbers.

### ❌ What You CANNOT Do with the API

1. **Purchase/Provision Phone Numbers**
   - No public API endpoint exists
   - Must use GHL UI: Settings → Phone Numbers → Add Number
   - Or purchase directly through Twilio console

2. **Move/Assign Numbers Between Sub-Accounts**
   - GHL has a "Move Numbers" tool in the UI
   - No public API endpoint for this operation
   - Must use: Settings → Phone Integration → Move Numbers

3. **Search for Available Numbers to Purchase**
   - No GHL API endpoint
   - Workaround: Use Twilio API directly if using Twilio integration

## Implementation Details

### GoHighLevel Service Methods

#### `getActivePhoneNumbers()`
Fetches phone numbers for the configured location.

```typescript
const ghlService = createGoHighLevelService();
const numbers = await ghlService.getActivePhoneNumbers();
```

#### `getPhoneNumbersForLocations(locationIds: string[])`
Fetches phone numbers from multiple locations (agency-level view).

```typescript
const ghlService = createGoHighLevelService();
const numbersByLocation = await ghlService.getPhoneNumbersForLocations([
  'location1',
  'location2',
  'location3'
]);
```

Returns: `Record<string, GHLPhoneNumber[]>` - Map of location ID to phone numbers

#### `getNumberPools()`
Fetches number pools for the location.

```typescript
const ghlService = createGoHighLevelService();
const pools = await ghlService.getNumberPools();
```

### TypeScript Interfaces

```typescript
interface GHLPhoneNumber {
  phoneNumber: string;
  friendlyName: string;
  city: string;
  state: string;
  capabilities: string[];
  monthlyPrice?: number;
}

interface GHLNumberPool {
  id: string;
  name: string;
  numbers: string[];
  locationIds: string[];
}
```

## API Endpoints

### Get Phone Numbers (Single Location)
```bash
GET /api/ghl/phone/available

Response:
{
  "success": true,
  "phoneNumbers": [...]
}
```

### Get Phone Numbers (Multiple Locations)
```bash
GET /api/ghl/phone/available?locationIds=loc1,loc2,loc3

Response:
{
  "success": true,
  "phoneNumbers": [...],  # All numbers flattened
  "byLocation": {
    "loc1": [...],
    "loc2": [...],
    "loc3": [...]
  }
}
```

### Get Number Pools
```bash
GET /api/ghl/phone/pools

Response:
{
  "success": true,
  "numberPools": [...]
}
```

## Environment Variables

### Single Location Setup
```bash
GHL_API_KEY=your_api_key
GHL_LOCATION_ID=your_location_id
```

### Agency-Level Setup
```bash
# Use agency-level API key with access to multiple locations
GHL_API_KEY=your_agency_api_key
GHL_LOCATION_ID=default_location_id  # Used for single-location queries
```

## Workarounds & Alternatives

### 1. Purchasing Phone Numbers

**Option A: GHL UI (Recommended)**
1. Switch to desired sub-account
2. Settings → Phone Numbers → Add Number
3. Select country, number type, capabilities
4. Complete purchase

**Option B: Twilio Console (if using Twilio)**
1. Log into Twilio
2. Find sub-account using Account SID from GHL
3. Navigate to Phone Numbers → Buy a Number
4. Purchase number
5. Number automatically appears in GHL

### 2. Moving Numbers Between Sub-Accounts

**GHL UI Tool:**
1. Settings → Phone Integration → Move Numbers
2. Enter source and destination location IDs
3. Select numbers to move
4. Confirm transfer

**Supported Transfers:**
- LC Phone ↔ LC Phone (same agency)
- Twilio ↔ Twilio (same master account)
- Twilio ↔ LC Phone

**Important Notes:**
- A2P status doesn't move with number
- Reattach A2P compliance after transfer
- US & Canada numbers supported
- Other countries may require support ticket

### 3. Getting All Agency Numbers

Since there's no single agency-level endpoint, you need to:

1. Get list of all location IDs in your agency
2. Call `/api/ghl/phone/available?locationIds=loc1,loc2,loc3`
3. The response includes both flattened and per-location breakdowns

## Usage Example in Frontend

```typescript
// Get numbers for current location
const { data } = useQuery({
  queryKey: ['phone-numbers'],
  queryFn: async () => {
    const response = await fetch('/api/ghl/phone/available');
    return response.json();
  },
});

// Get numbers for multiple locations (agency-level)
const locationIds = ['loc1', 'loc2', 'loc3'];
const { data } = useQuery({
  queryKey: ['phone-numbers', 'agency', locationIds],
  queryFn: async () => {
    const params = new URLSearchParams({
      locationIds: locationIds.join(',')
    });
    const response = await fetch(`/api/ghl/phone/available?${params}`);
    return response.json();
  },
});

// Get number pools
const { data } = useQuery({
  queryKey: ['number-pools'],
  queryFn: async () => {
    const response = await fetch('/api/ghl/phone/pools');
    return response.json();
  },
});
```

## Limitations Summary

| Feature | API Available | Workaround |
|---------|---------------|------------|
| List numbers per location | ✅ Yes | N/A |
| List numbers for multiple locations | ✅ Yes | Pass locationIds param |
| List number pools | ✅ Yes | N/A |
| Purchase/provision numbers | ❌ No | Use GHL UI or Twilio console |
| Move numbers between sub-accounts | ❌ No | Use GHL UI Move Numbers tool |
| Search available numbers | ❌ No | Use Twilio API directly |

## Future Enhancements

When GHL releases new APIs:
1. Add phone number provisioning endpoint
2. Add number assignment/move endpoint
3. Add available number search endpoint
4. Update service methods accordingly

## References

- [GHL Phone System API Docs](https://marketplace.gohighlevel.com/docs/ghl/phone-system/phone-system-api/)
- [GHL Moving Numbers Guide](https://help.gohighlevel.com/support/solutions/articles/48001203968)
- [GHL Number Pools API](https://marketplace.gohighlevel.com/docs/ghl/phone-system/get-number-pool-list/)
