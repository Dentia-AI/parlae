# AWS SES DNS Configuration for parlae.ca

## DNS Records Required

Add these DNS records to your `parlae.ca` domain (in Route 53, Cloudflare, or your DNS provider):

### 1. Domain Verification TXT Record

```
Type: TXT
Name: _amazonses.parlae.ca
Value: hh+0cbQnvEVov+zFL3t2aAZ+fd03rLf4P8GdJSMfdiQ=
TTL: 1800 (30 minutes)
```

### 2. DKIM CNAME Records (for email authentication)

Add all three CNAME records:

```
Type: CNAME
Name: szzdrtr7hvzgeaf5b537pln3xkbhobxb._domainkey.parlae.ca
Value: szzdrtr7hvzgeaf5b537pln3xkbhobxb.dkim.amazonses.com
TTL: 1800

Type: CNAME
Name: eidefdtpzg7y4je7mnbsnhc3v66hltdc._domainkey.parlae.ca
Value: eidefdtpzg7y4je7mnbsnhc3v66hltdc.dkim.amazonses.com
TTL: 1800

Type: CNAME
Name: 6bsuacjencumvo6bdiev3qalk4x7jhhp._domainkey.parlae.ca
Value: 6bsuacjencumvo6bdiev3qalk4x7jhhp.dkim.amazonses.com
TTL: 1800
```

### 3. SPF TXT Record (optional but recommended)

```
Type: TXT
Name: parlae.ca
Value: v=spf1 include:amazonses.com ~all
TTL: 1800
```

### 4. DMARC TXT Record (optional but recommended)

```
Type: TXT
Name: _dmarc.parlae.ca
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@parlae.ca
TTL: 1800
```

## Verification Timeline

- **TXT Records:** Usually propagate within 15-30 minutes
- **CNAME Records:** Usually propagate within 15-30 minutes
- **AWS Verification:** Checks every few minutes, usually complete within 1 hour
- **Full Verification:** Can take up to 72 hours (rare)

## Check Verification Status

```bash
# Check domain verification
aws ses get-identity-verification-attributes \
  --identities parlae.ca \
  --region us-east-2 \
  --profile parlae

# Check DKIM status
aws ses get-identity-dkim-attributes \
  --identities parlae.ca \
  --region us-east-2 \
  --profile parlae
```

## After Verification

Once verified (status changes to "Success"), you can:

1. **Send emails from any @parlae.ca address**
   - support@parlae.ca ✅ (already verified)
   - noreply@parlae.ca
   - appointments@parlae.ca
   - Any other @parlae.ca address

2. **Request production access** (if not already approved)
   ```bash
   # Check current sending limits
   aws ses get-send-quota --region us-east-2 --profile parlae
   ```

## Current Status

- ✅ AWS SES enabled in us-east-2
- ✅ Domain `parlae.ca` registered (Pending verification)
- ✅ Email `support@parlae.ca` verified (check your inbox)
- ✅ DKIM tokens generated
- ⏳ Waiting for DNS propagation

## Next Steps

1. Add the DNS records above to your DNS provider
2. Wait 15-30 minutes for propagation
3. Verify records:
   ```bash
   dig TXT _amazonses.parlae.ca
   dig CNAME szzdrtr7hvzgeaf5b537pln3xkbhobxb._domainkey.parlae.ca
   ```
4. Check AWS SES dashboard for verification status
5. Once verified, test sending an email!
