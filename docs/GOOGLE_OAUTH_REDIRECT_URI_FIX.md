# Google OAuth Configuration Fix

## Error Message
```
Error 400: redirect_uri_mismatch
Request details: redirect_uri=https://parlae-auth.auth.us-east-2.amazoncognito.com/oauth2/idpresponse
```

## Root Cause

Google's OAuth 2.0 application is not configured with the Cognito domain's redirect URI. When users click "Sign in with Google", Cognito redirects to Google, and Google needs to know where to send users back after authentication.

## Solution

Add the Cognito callback URL to Google Cloud Console:

### Step-by-Step Instructions

1. **Go to Google Cloud Console**
   - Navigate to: https://console.cloud.google.com/

2. **Select Your Project**
   - Choose the project that contains your OAuth credentials for Parlae

3. **Navigate to Credentials**
   - Click **APIs & Services** in the left sidebar
   - Click **Credentials**

4. **Find OAuth 2.0 Client ID**
   - Look for your OAuth 2.0 Client ID (the one used for Parlae/Cognito)
   - Click the pencil icon (Edit) to edit it

5. **Add Authorized Redirect URI**
   - Scroll to **Authorized redirect URIs** section
   - Click **+ ADD URI**
   - Enter: `https://parlae-auth.auth.us-east-2.amazoncognito.com/oauth2/idpresponse`
   - Click **Save**

### Important Notes

- The redirect URI must be **exact** - don't forget the `/oauth2/idpresponse` path
- There's no trailing slash
- Use `https://` (not `http://`)
- The domain is: `parlae-auth.auth.us-east-2.amazoncognito.com`

### You May Already Have

You might already have these redirect URIs configured:
- `https://app.parlae.ca/api/auth/callback/cognito` (NextAuth callback)
- Other development/staging URIs

**Keep all existing URIs** and just add the new Cognito one.

## Verification

After adding the redirect URI:

1. Wait ~30 seconds for Google to propagate the change (usually instant)
2. Go to https://app.parlae.ca/auth/sign-up
3. Click **Sign up with Google**
4. Should now redirect to Google's consent screen ✅
5. After granting permission, should redirect back to your app ✅

## Troubleshooting

### If you see "This app hasn't been verified"
- This is normal for apps in development/testing
- Click "Advanced" → "Go to Parlae (unsafe)" to proceed
- For production, you'll need to verify your app with Google

### If you still get redirect_uri_mismatch
- Double-check the URI exactly matches: `https://parlae-auth.auth.us-east-2.amazoncognito.com/oauth2/idpresponse`
- Make sure you saved the changes in Google Cloud Console
- Try clearing your browser cache/cookies
- Try in an incognito window

## Related Cognito Configuration

In AWS Cognito, the Google identity provider should be configured with:
- **Client ID**: Your Google OAuth Client ID
- **Client Secret**: Your Google OAuth Client Secret
- **Authorize scope**: `openid email profile`

This was already verified as correct in your setup. ✅

## Summary

This is a **Google OAuth configuration issue**, not an AWS/Cognito issue. Once you add the redirect URI in Google Cloud Console, Google sign-in will work immediately.

The Cognito domain (`parlae-auth.auth.us-east-2.amazoncognito.com`) is working correctly - it's just Google doesn't know about it yet!
