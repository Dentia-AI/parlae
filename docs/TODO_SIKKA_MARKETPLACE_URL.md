# 🚨 TODO: Configure Sikka Marketplace URL

## ⚠️ Action Required

You need to update the Sikka marketplace URL in the PMS setup wizard.

### File to Update:
`apps/frontend/apps/web/app/home/(user)/agent/setup/_components/pms-setup-wizard.tsx`

### Line to Change:

```typescript
const handleOpenSikkaMarketplace = () => {
  // ⚠️ TODO: Replace with your actual Sikka marketplace/integration URL
  const sikkaUrl = 'https://marketplace.sikkasoft.com/parlae-ai'; // ← Update this!
  window.open(sikkaUrl, '_blank');
};
```

### What URL Should This Be?

This should be the URL where users can:
1. Register their practice with your Sikka integration
2. Install the Sikka utility/connector
3. Complete the PMS connection

Possible formats:
- Your Sikka marketplace listing
- Your custom Sikka integration portal
- Sikka's partner integration page for Parlae AI

### After Updating:

The wizard will:
1. Show users a button to open your integration page
2. Display instructions to follow email guidance
3. Allow them to verify connection when done

---

**Status**: ⏳ Waiting for Sikka marketplace URL from you
