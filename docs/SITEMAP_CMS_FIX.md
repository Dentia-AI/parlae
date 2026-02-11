# Sitemap CMS Error Fix

## Issue

Build was failing during sitemap generation with:

```
Error: Implementation "undefined" not found
    at s (.next/server/chunks/[root-of-the-server]__9466f87b._.js:1:1320)
Export encountered an error on /sitemap.xml/route: /sitemap.xml
```

## Root Cause

The `app/sitemap.xml/route.ts` file attempts to fetch blog posts and documentation from a CMS (Content Management System) using `createCmsClient()`. However:

1. **No `CMS_CLIENT` environment variable was set**
2. **The CMS registry couldn't find an implementation for `undefined`**
3. **The sitemap generation failed during Next.js build prerendering**

### How It Worked Before

```typescript
async function getContentItems() {
  const client = await createCmsClient(); // ❌ Fails if CMS_CLIENT not set
  
  const posts = client.getContentItems({ collection: 'posts', ... });
  const docs = client.getContentItems({ collection: 'documentation', ... });
  
  return Promise.all([posts, docs]).then((items) => items.flat());
}
```

The `createCmsClient()` function tries to get an implementation from the registry:
```typescript
// packages/cms/core/src/create-cms-client.ts
const CMS_CLIENT = process.env.CMS_CLIENT as CmsType;

export async function createCmsClient(type: CmsType = CMS_CLIENT) {
  return cmsRegistry.get(type); // ❌ Throws if type is undefined
}
```

## Solution

Made the sitemap generation **gracefully handle missing CMS configuration**:

### 1. Updated `app/sitemap.xml/route.ts`

```typescript
async function getContentItems() {
  // Check if CMS is configured
  const cmsClient = process.env.CMS_CLIENT;
  
  // If no CMS client is configured, return empty array
  // This allows the build to succeed without a CMS
  if (!cmsClient) {
    console.log('[Sitemap] No CMS_CLIENT configured, skipping content items');
    return [];
  }

  try {
    const client = await createCmsClient();

    // do not paginate the content items
    const limit = Infinity;
    
    const posts = client
      .getContentItems({ collection: 'posts', ... })
      .catch((error) => {
        console.error('[Sitemap] Error fetching blog posts:', error);
        return [];
      });

    const docs = client
      .getContentItems({ collection: 'documentation', ... })
      .catch((error) => {
        console.error('[Sitemap] Error fetching docs:', error);
        return [];
      });

    return Promise.all([posts, docs]).then((items) => items.flat());
  } catch (error) {
    console.error('[Sitemap] Error creating CMS client:', error);
    return [];
  }
}
```

**Key Changes:**
- ✅ Check if `CMS_CLIENT` is set before trying to create client
- ✅ Return empty array if no CMS configured
- ✅ Wrap CMS client creation in try-catch
- ✅ Catch errors when fetching posts/docs individually
- ✅ Sitemap still generates with static paths even without CMS

### 2. Added `CMS_CLIENT` to CI Workflows

Set to empty string to explicitly indicate "no CMS":

```yaml
# .github/workflows/test-frontend.yml
# .github/workflows/test-all.yml
env:
  # ... other variables ...
  
  # CMS (optional - empty means no CMS)
  CMS_CLIENT: ""
```

### 3. Updated Documentation

Added CMS configuration to `docs/COMPLETE_ENV_VARS.md`:

```bash
# CMS / Content Management (Optional)
CMS_CLIENT=""                           # "keystatic" | "wordpress" | "" (empty = no CMS)
```

## Behavior

### Without CMS (Current Setup)

```
Sitemap includes:
✅ Static paths: /, /faq, /blog, /docs, /pricing, /contact, etc.
⚠️  No dynamic blog posts (CMS not configured)
⚠️  No dynamic documentation pages (CMS not configured)
```

### With CMS Configured

If you later want to add CMS support, set:

```bash
# For Keystatic CMS
CMS_CLIENT="keystatic"

# For WordPress CMS  
CMS_CLIENT="wordpress"
```

Then the sitemap will also include:
- All blog posts from CMS
- All documentation pages from CMS

## Benefits

1. **Build Succeeds Without CMS**: Application doesn't require a CMS to build
2. **Graceful Degradation**: Sitemap works with or without CMS
3. **Future-Proof**: Easy to add CMS later by just setting env var
4. **Error Resilience**: Individual CMS fetch failures don't break entire sitemap
5. **Clear Logging**: Console messages explain what's happening

## Verification

### Sitemap should now include:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.parlae.ca/</loc>
    <lastmod>2026-02-11T...</lastmod>
  </url>
  <url>
    <loc>https://www.parlae.ca/faq</loc>
    <lastmod>2026-02-11T...</lastmod>
  </url>
  <url>
    <loc>https://www.parlae.ca/blog</loc>
    <lastmod>2026-02-11T...</lastmod>
  </url>
  <!-- ... other static paths ... -->
  <!-- No dynamic blog/doc entries (CMS not configured) -->
</urlset>
```

### Check in browser after deployment:

```bash
curl https://www.parlae.ca/sitemap.xml
```

## Related Files Modified

```
M  apps/frontend/apps/web/app/sitemap.xml/route.ts
   • Added CMS_CLIENT check
   • Added error handling for CMS operations
   • Returns empty array if CMS not configured

M  .github/workflows/test-frontend.yml
   • Added CMS_CLIENT: ""

M  .github/workflows/test-all.yml
   • Added CMS_CLIENT: ""

M  docs/COMPLETE_ENV_VARS.md
   • Added CMS configuration section
   • Updated variable count to 24 (23 required + 1 optional)
```

## Future: Adding CMS Support

If you want to add a CMS in the future:

### Option 1: Keystatic CMS

```bash
# Set in environment
CMS_CLIENT="keystatic"

# Configure Keystatic (already included in packages)
# See: apps/frontend/packages/cms/keystatic/
```

### Option 2: WordPress CMS

```bash
# Set in environment
CMS_CLIENT="wordpress"

# Set WordPress URL
WORDPRESS_API_URL="https://your-wordpress-site.com/wp-json/wp/v2"

# Configure WordPress (already included in packages)
# See: apps/frontend/packages/cms/wordpress/
```

### Option 3: No CMS (Current)

```bash
# Leave empty or unset
CMS_CLIENT=""
```

## Summary

**Problem:** Sitemap generation failed because it tried to use a CMS that wasn't configured.

**Solution:** Made CMS optional - sitemap generates static paths without CMS, and can include dynamic content if CMS is later configured.

**Result:** Build succeeds, sitemap works, and you can add CMS support anytime by setting one environment variable.

---

**Last Updated:** 2026-02-11  
**Status:** ✅ Fixed  
**Issue:** CMS implementation not found during sitemap generation  
**Solution:** Made CMS optional with graceful fallback
