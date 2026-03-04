/**
 * Tests for the I18nProvider Suspense-compatible i18n initialization.
 *
 * We test the module-level state machine (promise caching, retry logic,
 * settings-key diffing) by re-requiring the module between tests.
 */

let mockInitResult: 'resolve' | 'reject' = 'resolve';
let initCallCount = 0;

jest.mock('./i18n.client', () => ({
  initializeI18nClient: jest.fn(
    (_settings: unknown, _resolver: unknown) => {
      initCallCount++;
      if (mockInitResult === 'reject') {
        return Promise.reject(new Error('init failed'));
      }
      return Promise.resolve({
        language: 'en',
        isInitialized: true,
      });
    },
  ),
  initializeI18nClientSync: jest.fn(() => null),
}));

function loadModule() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('./i18n-provider') as typeof import('./i18n-provider');
}

const dummySettings = { lng: 'en', ns: ['common'] };
const dummyResolver = jest.fn();

beforeEach(() => {
  jest.resetModules();
  initCallCount = 0;
  mockInitResult = 'resolve';
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('I18nProvider / useI18nClient', () => {
  it('should throw a Promise on first call (Suspense protocol)', () => {
    const { I18nProvider } = loadModule();

    expect(() => {
      I18nProvider({
        settings: dummySettings,
        resolver: dummyResolver,
        children: null,
      });
    }).toThrow(expect.any(Promise));
  });

  it('should throw the SAME Promise on repeated calls (Suspense caching)', () => {
    const { I18nProvider } = loadModule();

    let thrown1: Promise<unknown> | undefined;
    let thrown2: Promise<unknown> | undefined;

    try {
      I18nProvider({ settings: dummySettings, resolver: dummyResolver, children: null });
    } catch (e) {
      thrown1 = e as Promise<unknown>;
    }

    try {
      I18nProvider({ settings: dummySettings, resolver: dummyResolver, children: null });
    } catch (e) {
      thrown2 = e as Promise<unknown>;
    }

    expect(thrown1).toBeDefined();
    expect(thrown1).toBe(thrown2);
  });

  it('should only call initializeI18nClient once for the same settings', () => {
    const { I18nProvider } = loadModule();

    try {
      I18nProvider({ settings: dummySettings, resolver: dummyResolver, children: null });
    } catch {}

    try {
      I18nProvider({ settings: dummySettings, resolver: dummyResolver, children: null });
    } catch {}

    expect(initCallCount).toBe(1);
  });

  it('should return children after initialization resolves', async () => {
    const { I18nProvider } = loadModule();

    let thrownPromise: Promise<unknown> | undefined;
    try {
      I18nProvider({ settings: dummySettings, resolver: dummyResolver, children: null });
    } catch (e) {
      thrownPromise = e as Promise<unknown>;
    }

    await thrownPromise;

    // After the promise settles, next call should not throw
    await new Promise((r) => setTimeout(r, 0));
    const result = I18nProvider({
      settings: dummySettings,
      resolver: dummyResolver,
      children: 'rendered',
    });
    expect(result).toBe('rendered');
  });

  it('should retry on init failure and stop after MAX_INIT_RETRIES', async () => {
    mockInitResult = 'reject';
    const { I18nProvider } = loadModule();

    for (let attempt = 0; attempt < 3; attempt++) {
      let thrownPromise: Promise<unknown> | undefined;
      try {
        I18nProvider({ settings: dummySettings, resolver: dummyResolver, children: null });
      } catch (e) {
        thrownPromise = e as Promise<unknown>;
      }
      if (thrownPromise) {
        await thrownPromise;
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // After 3 failures, it should render children (fallback mode) instead of throwing
    const result = I18nProvider({
      settings: dummySettings,
      resolver: dummyResolver,
      children: 'fallback-rendered',
    });
    expect(result).toBe('fallback-rendered');
  });
});
