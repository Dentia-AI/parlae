import i18next, {
  type InitOptions,
  type ReadCallback,
  type ResourceKey,
  type Resource,
  i18n,
} from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import resourcesToBackend from 'i18next-resources-to-backend';
import { initReactI18next } from 'react-i18next';

/**
 * Synchronously initialize i18next using pre-loaded translation resources
 * that were serialized into the HTML by the server. This avoids the async
 * Suspense throw during hydration, preventing a visible flicker where the
 * server-rendered HTML is momentarily replaced by a fallback spinner.
 *
 * Returns the i18n instance on success, or null if init fails (caller
 * should fall back to the async path).
 */
export function initializeI18nClientSync(
  settings: InitOptions,
  resources: Resource,
): i18n | null {
  if (i18next.isInitialized) {
    const targetLng = settings.lng;

    if (targetLng && i18next.language !== targetLng) {
      Object.entries(resources).forEach(([lang, namespaces]) => {
        Object.entries(namespaces as Record<string, unknown>).forEach(
          ([ns, bundle]) => {
            if (!i18next.hasResourceBundle(lang, ns)) {
              i18next.addResourceBundle(lang, ns, bundle);
            }
          },
        );
      });

      i18next.changeLanguage(targetLng);
    }

    return i18next;
  }

  try {
    i18next
      .use(initReactI18next)
      .init({
        ...settings,
        resources,
        initImmediate: false,
        interpolation: { escapeValue: false },
      });

    return i18next;
  } catch {
    return null;
  }
}

/**
 * Initialize the i18n instance on the client.
 * @param settings - the i18n settings
 * @param resolver - a function that resolves the i18n resources
 */
export async function initializeI18nClient(
  settings: InitOptions,
  resolver: (lang: string, namespace: string) => Promise<object>,
): Promise<i18n> {
  if (i18next.isInitialized) {
    const targetLng = settings.lng;

    if (targetLng && i18next.language !== targetLng) {
      await i18next.changeLanguage(targetLng);
    }

    return i18next;
  }

  const loadedLanguages: string[] = [];
  const loadedNamespaces: string[] = [];

  await i18next
    .use(
      resourcesToBackend(
        (
          language: string,
          namespace: string,
          callback: ReadCallback,
        ) => {
          resolver(language, namespace)
            .then((data) => {
              if (!loadedLanguages.includes(language)) {
                loadedLanguages.push(language);
              }

              if (!loadedNamespaces.includes(namespace)) {
                loadedNamespaces.push(namespace);
              }

              callback(null, data as ResourceKey);
            })
            .catch((error) =>
              callback(error as Error, undefined as unknown as ResourceKey),
            );
        },
      ),
    )
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      ...settings,
      detection: {
        order: ['htmlTag', 'cookie', 'navigator'],
        caches: ['cookie'],
        lookupCookie: 'lang',
      },
      interpolation: {
        escapeValue: false,
      },
    });

  if (loadedLanguages.length === 0 || loadedNamespaces.length === 0) {
    console.debug(
      '[i18n] Resources not yet in tracking arrays after init — this is normal on first load.',
    );
  }

  return i18next;
}
