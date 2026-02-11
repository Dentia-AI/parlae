# ESLint Configuration TODO

## Current Status: ⚠️ Broken

The ESLint configuration is currently non-functional and has been made **non-blocking** in the CI pipeline (`continue-on-error: true`). This means:
- ✅ TypeCheck, Build, and Test steps are **blocking** (will fail CI)
- ⚠️ Lint step is **non-blocking** (warnings only, won't fail CI)

## Issues to Fix

### 1. Frontend: Missing `@kit/eslint-config` Package

**Problem:**
```javascript
// apps/frontend/apps/web/eslint.config.mjs
import eslintConfigApps from '@kit/eslint-config/apps.js';
import eslintConfigBase from '@kit/eslint-config/base.js';
```

This package doesn't exist in the workspace.

**Error:**
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@kit/eslint-config'
```

**Solution Options:**

#### Option A: Create the Missing Package (Recommended)
Create `packages/eslint-config/` with:

```
packages/eslint-config/
├── package.json
├── base.js          # Base ESLint config
└── apps.js          # App-specific overrides
```

**`packages/eslint-config/package.json`:**
```json
{
  "name": "@kit/eslint-config",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    "./base.js": "./base.js",
    "./apps.js": "./apps.js"
  },
  "peerDependencies": {
    "eslint": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0"
  }
}
```

**`packages/eslint-config/base.js`:**
```javascript
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_' 
      }],
    },
  },
];
```

**`packages/eslint-config/apps.js`:**
```javascript
export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
];
```

#### Option B: Use Inline Configs (Quick Fix)
Replace all `eslint.config.mjs` files with inline configs:

```javascript
// apps/frontend/apps/web/eslint.config.mjs
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    ignores: ['dist/**', '.next/**', 'node_modules/**'],
  },
];
```

### 2. Backend: Old ESLint v8 Config Format

**Problem:**
Backend uses `.eslintrc.js` (ESLint v8 format), but ESLint v9 expects flat config (`eslint.config.js`).

**Error:**
```
ESLint couldn't find an eslint.config.(js|mjs|cjs) file.
From ESLint v9.0.0, the default configuration file is now eslint.config.js.
```

**Solution: Migrate to Flat Config**

Rename `.eslintrc.js` to `eslint.config.js` and convert:

**`apps/backend/eslint.config.js`:**
```javascript
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'import': importPlugin,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      'import/order': [
        'error',
        {
          alphabetize: { order: 'asc', caseInsensitive: true },
          'newlines-between': 'always',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_' 
      }],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
];
```

## Recommended Approach

1. **Short-term (Current):** 
   - Keep lint as non-blocking (`continue-on-error: true`)
   - Focus on TypeCheck, Build, and Test checks (these are working)

2. **Medium-term (Fix ESLint):**
   - Create `@kit/eslint-config` package (Option A above)
   - Migrate backend to flat config format
   - Test locally: `pnpm --filter web lint` and `pnpm --filter @apps/backend lint`
   - Remove `continue-on-error: true` once working

3. **Long-term (Enhance):**
   - Add more strict rules
   - Add pre-commit hooks with Husky
   - Add lint-staged for incremental linting

## Testing After Fix

### Frontend:
```bash
# Should pass without errors
pnpm --filter web lint
```

### Backend:
```bash
# Should pass without errors
pnpm --filter @apps/backend lint
```

### Verify in CI:
```bash
# Remove continue-on-error from workflows
# Push and check GitHub Actions
```

## Current CI Pipeline Priority

```
┌─────────────────────────────────────────────────────────────┐
│  BLOCKING (Fails CI)                                        │
├─────────────────────────────────────────────────────────────┤
│  ✅ Type Check  - Catches TypeScript errors                │
│  ✅ Build       - Catches build/compilation errors         │
│  ✅ Test        - Catches logic errors                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  NON-BLOCKING (Warnings only)                               │
├─────────────────────────────────────────────────────────────┤
│  ⚠️  Lint       - Reports style issues (needs config fix)  │
└─────────────────────────────────────────────────────────────┘
```

This still catches the critical errors (like the variable shadowing bug) in TypeCheck and Build steps!

## References

- [ESLint v9 Migration Guide](https://eslint.org/docs/latest/use/configure/migration-guide)
- [ESLint Flat Config](https://eslint.org/docs/latest/use/configure/configuration-files)
- [TypeScript ESLint](https://typescript-eslint.io/getting-started)

## Status

- [ ] Create `@kit/eslint-config` package
- [ ] Migrate backend to flat config
- [ ] Test lint commands locally
- [ ] Remove `continue-on-error` from CI
- [ ] Add pre-commit hooks (optional)
