/**
 * Mock fetch responses for testing
 */

export interface MockFetchResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  json?: () => Promise<any>;
  text?: () => Promise<string>;
  headers?: Headers;
}

/**
 * Create a mock fetch response
 */
export function createMockFetchResponse(
  data: any,
  options: Partial<MockFetchResponse> = {}
): Response {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? 'OK',
    headers: options.headers ?? new Headers(),
    json: async () => data,
    text: async () => JSON.stringify(data),
    blob: async () => new Blob([JSON.stringify(data)]),
    arrayBuffer: async () => new ArrayBuffer(0),
    formData: async () => new FormData(),
    clone: function() { return this; },
    body: null,
    bodyUsed: false,
    redirected: false,
    type: 'basic',
    url: '',
  } as Response;
}

/**
 * Mock global fetch
 */
export function mockFetch(response: any, options: Partial<MockFetchResponse> = {}) {
  global.fetch = jest.fn(() =>
    Promise.resolve(createMockFetchResponse(response, options))
  ) as jest.Mock;
}

/**
 * Mock fetch to reject with error
 */
export function mockFetchError(error: Error | string) {
  global.fetch = jest.fn(() =>
    Promise.reject(typeof error === 'string' ? new Error(error) : error)
  ) as jest.Mock;
}

/**
 * Reset fetch mock
 */
export function resetFetchMock() {
  if (global.fetch && jest.isMockFunction(global.fetch)) {
    (global.fetch as jest.Mock).mockReset();
  }
}

