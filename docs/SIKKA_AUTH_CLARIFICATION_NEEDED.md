# Sikka API Authentication - Clarification Needed

## Current Status

✅ **Request-Key Direct Access Works**

The simple Request-Key header authentication is working:

```bash
curl 'https://api.sikkasoft.com/v4/appointments' \
  -H 'Request-Key: 70a2c702705ad41c395f8bd639fa7f85'

# Returns: 87 appointments, 200 OK
```

## Token Refresh Flow (Not Working)

You mentioned Sikka has a `request_key`/`refresh_key` grant flow from these docs:
- https://apidocs.sikkasoft.com/#ed966ba4-b9b5-4af3-bd6e-5e67106bb401
- https://apidocs.sikkasoft.com/#27286038-82c8-494d-a321-d6a65a233e88

Expected payload structure:
```json
{
  "grant_type": "request_key",
  "office_id": "",
  "secret_key": "",
  "app_id": "",
  "app_key": ""
}
```

## Tested Endpoints (All Failed)

| Endpoint | Method | Status | Result |
|----------|--------|--------|--------|
| `/v4/token` | POST | 405 | Method Not Allowed |
| `/v4/auth/token` | POST | 405 | Method Not Allowed |
| `/token` | POST | 404 | Not Found |
| `/auth/token` | POST | 404 | Not Found |
| `/v4/oauth/token` | POST | 405 | Method Not Allowed |

## Questions for Sikka API Docs

1. **What is the exact token endpoint URL?**
   - Is it a different path?
   - Is it a different method (GET instead of POST)?

2. **Is the token flow required?**
   - Or is Request-Key direct access sufficient for all operations?
   - What are the limitations of using Request-Key directly?

3. **Token expiry and rotation:**
   - Does the Request-Key expire?
   - When should we use the refresh_token flow?

4. **authorized_practices endpoint:**
   - Is there a step before getting tokens?
   - Do we need to call `/authorized_practices` first to get `office_id` and `secret_key`?

## Current Implementation

For now, I've implemented a **hybrid approach** in `SikkaPmsService`:

```typescript
// Option 1: Token-based (preferred, but endpoint unknown)
private async getRefreshToken(): Promise<void> {
  const response = await axios.post(this.tokenUrl, {
    grant_type: 'request_key',
    app_id: this.appId,
    app_key: this.appKey,
    office_id: this.officeId,
    secret_key: this.secretKey
  });
  
  this.refreshToken = response.data.refresh_key;
}

// Option 2: Request-Key direct (working fallback)
this.client = axios.create({
  headers: {
    'Request-Key': this.requestKey
  }
});
```

## Test Credentials

```json
{
  "appId": "b0cac8c638d52c92f9c0312159fc4518",
  "appKey": "7beec2a9e62bd692eab2e0840b8bb2db",
  "requestKey": "70a2c702705ad41c395f8bd639fa7f85",
  "officeId": "84A9439BD3627374VGUV",
  "secretKey": "STc3kSY7S4ORJHb5hE0r5yBwdeCFu7av0ahG9hPlDj0=",
  "masterCustomerId": "D36225"
}
```

## Next Steps

1. **Get token endpoint URL from Sikka docs** or support team
2. **Test token flow** once we have the correct endpoint
3. **Update implementation** to use tokens if required
4. **Otherwise, keep using Request-Key** if it's sufficient

## Production Considerations

If Request-Key is the only method:
- ✅ Simple and reliable
- ✅ No token refresh complexity
- ⚠️ Need to rotate keys periodically
- ⚠️ Store keys encrypted in database
- ⚠️ Monitor for unauthorized usage

If token refresh is required:
- ✅ Better security with short-lived tokens
- ✅ Automatic token rotation
- ⚠️ More complex implementation
- ⚠️ Need retry logic for token refresh
