# Server Actions Fix

## Problem
Server Actions failing with error:
```
`x-forwarded-host` header with value `localhost` does not match 
`origin` header with value `localhost:3000`
```

## Root Cause
The Next.js config was setting `x-forwarded-host` to `localhost`, but the browser sends `origin: localhost:3000` (with port). They must match exactly.

## Solution

### Updated `next.config.mjs`:
```javascript
async headers() {
  if (process.env.NODE_ENV !== 'production') {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'x-forwarded-host',
            value: 'localhost:3000', // Changed from 'localhost'
          },
        ],
      },
    ];
  }
  return [];
},
```

## How to Apply

### 1. Restart Dev Server
```bash
# In your terminal, press Ctrl+C to stop the server
# Then restart:
./dev.sh
```

### 2. Test Server Actions
Once restarted:
1. Go to: http://localhost:3000/admin/setup-vapi
2. Click "Setup Test Agent"
3. Should work without 500 error!

## Why This Happens

Next.js Server Actions validate that the `x-forwarded-host` header matches the `origin` header for security. In local development:
- Browser sends: `origin: localhost:3000`
- Middleware sets: `x-forwarded-host: localhost` (without port)
- ❌ Mismatch → Server Actions fail

With the fix:
- Browser sends: `origin: localhost:3000`
- Middleware sets: `x-forwarded-host: localhost:3000`
- ✅ Match → Server Actions work!

## Production Note

This fix only applies in development (`NODE_ENV !== 'production'`). In production, reverse proxies handle this correctly.
