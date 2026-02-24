/**
 * Mock for @kit/next/routes - used by moduleNameMapper for tests.
 * Exports enhanceRouteHandler that wraps handlers and parses body from request.
 */
export const enhanceRouteHandler = jest.fn(
  (handler: (arg: { request: Request; body: unknown }) => Promise<Response>, _config: unknown) => {
    return async (request: Request) => {
      const body = await request.json();
      return handler({ request, body });
    };
  },
);
