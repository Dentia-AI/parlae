# Translation Fix Instructions

## Issue
The translation keys are showing up as raw text (e.g., "setup.phone.chooseMethod") instead of the translated values.

## Cause
Next.js cache needs to be cleared after adding new translation keys.

## Solution

### Step 1: Stop the Dev Server
In your terminal where `./dev.sh` is running:
1. Press `Ctrl+C` to stop the server

### Step 2: Clear Caches
Run these commands:
```bash
cd /Users/shaunk/Projects/Parlae-AI/parlae

# Clear Next.js cache
rm -rf apps/frontend/apps/web/.next

# Clear node modules cache (optional but recommended)
rm -rf apps/frontend/apps/web/.next/cache

# Clear browser cache in your browser or do a hard refresh
# Chrome/Edge: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
# Firefox: Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)
```

### Step 3: Restart Dev Server
```bash
./dev.sh
```

### Step 4: Hard Refresh Browser
Once the server is running:
1. Open your browser to the app
2. Do a hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)

### Step 5: Test
1. Switch language to French
2. Navigate to `/home/agent/setup`
3. Go through all steps - everything should now be in French:
   - Step 1: Voice Selection
   - Step 2: Knowledge Base (should show "Étape 2 : Base de connaissances")
   - Step 3: Integrations
   - Step 4: Phone Integration (should show "Étape 4 : Choisir la méthode d'intégration")
   - Step 5: Review & Launch (should show "Étape 1 : Informations de paiement")

## Verification

### Navigation Menu
Should show in French:
- Application → Application
- Dashboard → Tableau de bord  
- Configuration → Configuration
- AI Agents → Agents IA
- Advanced Setup → Configuration avancée

### Setup Wizard Steps (in stepper)
Should show:
1. Sélection de la voix
2. Base de connaissances
3. Intégrations
4. Intégration téléphonique
5. Révision et lancement

### Card Titles
Each step should show French titles:
- "Étape 1 : Sélection de la voix"
- "Étape 2 : Base de connaissances"  
- "Étape 3 : Intégration du logiciel de gestion"
- "Étape 4 : Choisir la méthode d'intégration"
- "Étape 5 : Révision et lancement"

## If Still Not Working

If you still see raw translation keys after following all steps:

1. **Check browser console** for any i18n errors
2. **Verify language is set to French** in the language selector
3. **Check that cookie is set**: Open browser DevTools → Application → Cookies → look for `lang=fr`
4. **Try incognito/private window** to rule out cache issues

## Files Changed
All translation keys are correctly added to:
- `/apps/frontend/apps/web/public/locales/en/common.json`
- `/apps/frontend/apps/web/public/locales/fr/common.json`
- `/apps/frontend/apps/web/config/personal-account-navigation.config.tsx`
- All setup wizard pages updated to use Trans components

## Next Steps After Fix
Once working, you can delete this file.
