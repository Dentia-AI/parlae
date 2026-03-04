'use client';

import type { InitOptions, Resource, i18n } from 'i18next';

import {
  initializeI18nClient,
  initializeI18nClientSync,
} from './i18n.client';

let i18nInstance: i18n | undefined;
let pendingInit: Promise<void> | null = null;
let initSettingsKey = '';
let consecutiveFailures = 0;
const MAX_INIT_RETRIES = 3;

const I18N_PRELOAD_KEY = '__I18N_DATA__';

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
 * Try to consume server-preloaded translation resources from the HTML.
 * Returns true if synchronous init succeeded.
 */
function tryPreloadedInit(settings: InitOptions, key: string): boolean {
  if (typeof window === 'undefined') return false;

  const preloaded = (window as Record<string, unknown>)[
    I18N_PRELOAD_KEY
  ] as Resource | undefined;

  if (!preloaded) return false;

  delete (window as Record<string, unknown>)[I18N_PRELOAD_KEY];

  const instance = initializeI18nClientSync(settings, preloaded);

  if (instance) {
    i18nInstance = instance;
    initSettingsKey = key;
    consecutiveFailures = 0;
    return true;
  }

  return false;
}

/**
 * Suspense-compatible hook that ensures the i18n client is initialised.
 *
 * On the very first hydration, the server may have serialized translation
 * resources into window.__I18N_DATA__. If present, i18next is initialised
 * synchronously — no Promise is thrown, no Suspense fallback is shown,
 * and the server-rendered HTML is preserved without flicker.
 *
 * If pre-loaded resources are not available (e.g. client-side navigation),
 * the hook falls back to the standard async Suspense pattern: throw a
 * Promise that React Suspense tracks until i18n resolves.
 */
function useI18nClient(settings: InitOptions, resolver: Resolver) {
  const key = settingsKey(settings);

  if (i18nInstance && initSettingsKey === key) {
    return i18nInstance;
  }

  // Try synchronous init from server-preloaded resources (hydration path).
  if (tryPreloadedInit(settings, key)) {
    return i18nInstance;
  }

  // Init failed too many times — render children without i18n rather
  // than crashing the entire app.  Translation keys will show as-is.
  if (consecutiveFailures >= MAX_INIT_RETRIES) {
    return i18nInstance;
  }

  // An init for these exact settings is already in flight — re-throw
  // the *same* Promise so React Suspense can track it.
  if (pendingInit) {
    throw pendingInit;
  }

  initSettingsKey = key;

  pendingInit = initializeI18nClient(settings, resolver)
    .then((instance) => {
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
