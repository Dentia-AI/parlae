# Multilingual Implementation Guide

## Overview

The application now supports multiple languages with automatic region-based detection and quick language switching between English and French. Users can select their preferred language from the header, and the system will remember their choice.

## Features Implemented

### 1. **Supported Languages**
- **English (en)** - Default language
- **French (fr)** - Fully translated

### 2. **Automatic Language Detection**
The application automatically detects the user's preferred language based on:
1. **User Selection** - Language chosen via the language selector (stored in cookie)
2. **Browser Language** - Detected from the `Accept-Language` header
3. **Default Fallback** - English if no preference is detected

### 3. **Language Selector in Header**
A language selector has been added to the site header, visible on all pages:
- Shows in both authenticated and non-authenticated states
- Displays language names in their native form (e.g., "English", "Français")
- Automatically refreshes the page when language is changed to load new translations

## Configuration

### Environment Variables

The language detection behavior is controlled by the `NEXT_PUBLIC_LANGUAGE_PRIORITY` environment variable:

```bash
# .env.local or .env.example
NEXT_PUBLIC_LANGUAGE_PRIORITY=user  # Options: 'user' | 'application'
```

- **`user`** - Detect language from browser's Accept-Language header
- **`application`** - Always use the application's default language (English)

### Supported Languages Configuration

Languages are configured in `/apps/frontend/apps/web/lib/i18n/i18n.settings.ts`:

```typescript
export const languages: string[] = ['en', 'fr'];
```

## Translation Files

All translation files are located in `/apps/frontend/apps/web/public/locales/{language}/`:

```
/public/locales/
├── en/                  # English translations
│   ├── common.json
│   ├── auth.json
│   ├── account.json
│   ├── billing.json
│   ├── teams.json
│   ├── marketing.json
│   └── admin.json
└── fr/                  # French translations
    ├── common.json
    ├── auth.json
    ├── account.json
    ├── billing.json
    ├── teams.json
    ├── marketing.json
    └── admin.json
```

### Translation Namespaces

- **common** - General UI elements, navigation, errors
- **auth** - Authentication-related text
- **account** - Account settings and profile
- **billing** - Subscription and payment
- **teams** - Team management
- **marketing** - Landing pages, marketing content
- **admin** - Admin console

## Adding a New Language

To add support for a new language (e.g., Spanish):

### 1. Update Language Configuration

Edit `/apps/frontend/apps/web/lib/i18n/i18n.settings.ts`:

```typescript
export const languages: string[] = ['en', 'fr', 'es'];
```

### 2. Create Translation Files

Create a new directory and copy the English files:

```bash
cd apps/frontend/apps/web/public/locales
mkdir es
cp en/*.json es/
```

### 3. Translate Content

Edit each JSON file in the `es/` directory and translate the values (keep the keys unchanged):

```json
{
  "signIn": "Iniciar sesión",
  "signUp": "Registrarse"
}
```

### 4. Test the Language

The new language will automatically appear in the language selector.

## Using Translations in Code

### In React Components

```tsx
import { Trans } from '@kit/ui/trans';

// Simple translation
<Trans i18nKey="common:signIn" />

// With variables
<Trans 
  i18nKey="account:welcomeMessage" 
  values={{ name: user.name }} 
/>
```

### With useTranslation Hook

```tsx
'use client';
import { useTranslation } from 'react-i18next';

export function MyComponent() {
  const { t } = useTranslation('common');
  
  return <h1>{t('homeTabLabel')}</h1>;
}
```

### In Server Components

```tsx
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';

async function MyServerComponent() {
  const i18n = await createI18nServerInstance();
  const title = i18n.t('account:myFeaturePage');
  
  return <h1>{title}</h1>;
}
```

## Language Storage

User language preferences are stored in a cookie named `lang`:
- **Cookie Name**: `lang`
- **Values**: `en`, `fr`, etc.
- **Persistence**: Persists across sessions
- **Scope**: Application-wide

## Browser Language Detection

The system uses the standard HTTP `Accept-Language` header to detect user preferences:

```
Accept-Language: fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7
```

The application will:
1. Parse the header
2. Find the best matching supported language
3. Fall back to English if no match is found

## Component Implementation

### Language Selector Component

The `LanguageSelector` component is already built and located at:
- **Path**: `/apps/frontend/packages/ui/src/makerkit/language-selector.tsx`
- **Import**: `import { LanguageSelector } from '@kit/ui/language-selector';`

### Header Integration

The language selector has been added to:
- **File**: `/apps/frontend/apps/web/app/(marketing)/_components/site-header-account-section.tsx`
- **Location**: Visible in both authenticated and non-authenticated states

## Translation Best Practices

### 1. Use Namespaces

Organize translations by feature area:

```tsx
// Good
<Trans i18nKey="auth:signIn" />
<Trans i18nKey="billing:checkout" />

// Avoid
<Trans i18nKey="signIn" />  // Which namespace?
```

### 2. Keep Keys Descriptive

```json
{
  "updateProfileSuccess": "Profile successfully updated",
  "updateProfileError": "Encountered an error. Please try again"
}
```

### 3. Use Variables for Dynamic Content

```json
{
  "welcomeMessage": "Welcome back, {{name}}!"
}
```

```tsx
<Trans 
  i18nKey="common:welcomeMessage" 
  values={{ name: user.name }} 
/>
```

### 4. Maintain Consistent Keys Across Languages

All language files should have the same keys:

```json
// en/common.json
{ "signIn": "Sign In" }

// fr/common.json
{ "signIn": "Se connecter" }

// es/common.json
{ "signIn": "Iniciar sesión" }
```

## Testing

### Test Language Switching

1. Open the application
2. Click the language selector in the header
3. Select "Français"
4. Verify the page refreshes with French translations
5. Verify the selection persists on navigation

### Test Browser Detection

1. Clear the `lang` cookie
2. Set browser language preference to French
3. Visit the application
4. Verify French is automatically selected

### Test Fallback

1. Remove a translation key from the French file
2. Switch to French
3. Verify the English translation is shown as fallback

## Troubleshooting

### Language Selector Not Appearing

1. Verify `LanguageSelector` is imported in the header component
2. Check that the component is rendered in the JSX
3. Verify the `languages` array in settings has multiple languages

### Translations Not Loading

1. Check the console for errors
2. Verify JSON files are valid (no syntax errors)
3. Ensure translation keys match between languages
4. Check that namespace is correct in `<Trans>` component

### Browser Language Not Detected

1. Verify `NEXT_PUBLIC_LANGUAGE_PRIORITY=user` in `.env.local`
2. Check browser's Accept-Language header
3. Ensure the browser's language is in the supported list

## Future Enhancements

Potential improvements for the multilingual system:

1. **Additional Languages**
   - Spanish (es)
   - German (de)
   - Italian (it)
   - Portuguese (pt)

2. **Professional Translation**
   - Use professional translation services
   - Implement translation management tools

3. **Right-to-Left (RTL) Support**
   - Add support for Arabic, Hebrew
   - Implement RTL CSS layouts

4. **Regional Variants**
   - French (France) vs French (Canada)
   - English (US) vs English (UK)

5. **Translation Management**
   - Integration with translation services (Crowdin, Lokalise)
   - Translation versioning
   - Automatic translation updates

## Resources

- [react-i18next Documentation](https://react.i18next.com/)
- [Next.js Internationalization](https://nextjs.org/docs/advanced-features/i18n-routing)
- [Language Codes (ISO 639-1)](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes)

## Support

For questions or issues related to the multilingual implementation:
1. Check this documentation
2. Review the translation files in `/public/locales/`
3. Consult the i18n rule file: `apps/frontend/.cursor/rules/translations.mdc`
