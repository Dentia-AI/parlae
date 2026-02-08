import type { NoseconeOptions } from '@nosecone/next';

const APP_BASE_URL = process.env.APP_BASE_URL;
const S3_PUBLIC_BASE_URL = process.env.S3_PUBLIC_BASE_URL;

// disabled to allow loading images from S3/CDN
const CROSS_ORIGIN_EMBEDDER_POLICY = false;

/**
 * @name ALLOWED_ORIGINS
 * @description List of allowed origins for the "connectSrc" directive in the Content Security Policy.
 */
const ALLOWED_ORIGINS: string[] = [
  APP_BASE_URL,
  S3_PUBLIC_BASE_URL,
  // add here additional allowed origins or API endpoints
].filter(isDefined);

/**
 * @name IMG_SRC_ORIGINS
 */
const IMG_SRC_ORIGINS: string[] = [S3_PUBLIC_BASE_URL].filter(isDefined);

/**
 * @name UPGRADE_INSECURE_REQUESTS
 * @description Upgrade insecure requests to HTTPS when in production
 */
const UPGRADE_INSECURE_REQUESTS = process.env.NODE_ENV === 'production';

/**
 * @name createCspResponse
 * @description Create a middleware with enhanced headers applied (if applied).
 */
export async function createCspResponse() {
  const { createMiddleware, defaults: noseconeConfig } = await import(
    '@nosecone/next'
  );

  /*
   * @name allowedOrigins
   * @description List of allowed origins for the "connectSrc" directive in the Content Security Policy.
   */

  const config: NoseconeOptions = {
    ...noseconeConfig,
    contentSecurityPolicy: {
      directives: {
        ...noseconeConfig.contentSecurityPolicy.directives,
        connectSrc: [
          ...noseconeConfig.contentSecurityPolicy.directives.connectSrc,
          ...((ALLOWED_ORIGINS as any) ?? []),
        ],
        imgSrc: [
          ...noseconeConfig.contentSecurityPolicy.directives.imgSrc,
          ...((IMG_SRC_ORIGINS as any) ?? []),
        ],
        upgradeInsecureRequests: UPGRADE_INSECURE_REQUESTS,
      },
    },
    crossOriginEmbedderPolicy: CROSS_ORIGIN_EMBEDDER_POLICY,
  };

  const middleware = createMiddleware(config);

  // create response
  const response = await middleware();

  if (response) {
    const contentSecurityPolicy = response.headers.get(
      'Content-Security-Policy',
    );

    const matches = contentSecurityPolicy?.match(/nonce-([\w-]+)/) || [];
    const nonce = matches[1];

    // set x-nonce header if nonce is found
    // so we can pass it to client-side scripts
    if (nonce) {
      response.headers.set('x-nonce', nonce);
    }
  }

  return response;
}

function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null && value !== '';
}
