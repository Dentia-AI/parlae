'use client';

import type { InitOptions, i18n } from 'i18next';

import { initializeI18nClient } from './i18n.client';

let i18nInstance: i18n | undefined;
let pendingInit: Promise<void> | null = null;
let initSettingsKey = '';
let consecutiveFailures = 0;
const MAX_INIT_RETRIES = 3;

type Resolver = (
  lang: string,
  namespace: string,
) => Promise<Record<string, string>>;

export function I18nProvider({
  settings,
  children,
  resolver,
}: React.PropsWithChildren<{
  settings: InitOptions;
  resolver: Resolver;
}>) {
  useI18nClient(settings, resolver);

  return children;
}

function settingsKey(settings: InitOptions): string {
  return `${settings.lng ?? ''}:${Array.isArray(settings.ns) ? settings.ns.length : 0}`;
}

/**
 * Suspense-compatible hook that ensures the i18n client is initialised.
 *
 * React Suspense requires that the **same** Promise is thrown on every
 * re-render until it settles.  Previous code called `loadI18nInstance`
 * on every render (creating a new Promise each time), which could cause
 * infinite suspense, duplicate `i18next.init()` calls, or cascading
 * errors that bypass `global-error.tsx` and show the hard
 * "Application error" page.
 */
function useI18nClient(settings: InitOptions, resolver: Resolver) {
  const key = settingsKey(settings);

  if (i18nInstance && initSettingsKey === key) {
    return i18nInstance;
  }

  // Init failed too many times — render children without i18n rather
  // than crashing the entire app.  Translation keys will show as-is.
  if (consecutiveFailures >= MAX_INIT_RETRIES) {
    console.warn(
      `[HYDRATION] i18n init exhausted ${MAX_INIT_RETRIES} retries — rendering without translations`,
    );
    return i18nInstance;
  }

  // An init for these exact settings is already in flight — re-throw
  // the *same* Promise so React Suspense can track it.
  if (pendingInit) {
    console.log('[HYDRATION] i18n init in flight — re-throwing same Promise for Suspense');
    throw pendingInit;
  }

  initSettingsKey = key;

  const initStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
  console.log(`[HYDRATION] i18n init starting (key=${key})`);

  pendingInit = initializeI18nClient(settings, resolver)
    .then((instance) => {
      const elapsed = typeof performance !== 'undefined'
        ? (performance.now() - initStart).toFixed(1)
        : '?';
      console.log(`[HYDRATION] i18n init completed in ${elapsed}ms`);
      i18nInstance = instance;
      consecutiveFailures = 0;
    })
    .catch((err) => {
      consecutiveFailures++;
      console.error(
        `[I18nProvider] i18n init failed (attempt ${consecutiveFailures}/${MAX_INIT_RETRIES}):`,
        err,
      );
    })
    .finally(() => {
      pendingInit = null;
    });

  throw pendingInit;
}
