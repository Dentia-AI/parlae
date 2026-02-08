import withBundleAnalyzer from '@next/bundle-analyzer';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ASSET_BASE_URL = process.env.S3_PUBLIC_BASE_URL;
const ENABLE_REACT_COMPILER = process.env.ENABLE_REACT_COMPILER === 'true';

const INTERNAL_PACKAGES = [
  '@kit/ui',
  '@kit/accounts',
  '@kit/shared',
  '@kit/i18n',
  '@kit/mailers',
  '@kit/billing-gateway',
  '@kit/email-templates',
  '@kit/cms',
  '@kit/prisma',
  '@kit/monitoring',
  '@kit/next',
];
const optimizePackageImports = IS_PRODUCTION
  ? undefined
  : [
      'recharts',
      'lucide-react',
      '@radix-ui/react-icons',
      '@radix-ui/react-avatar',
      '@radix-ui/react-select',
      'date-fns',
      ...INTERNAL_PACKAGES,
    ];

const SERVER_EXTERNAL_PACKAGES = [
  '@aws-sdk/client-s3',
  '@aws-sdk/s3-request-presigner',
  '@prisma/client',
  'prisma',
];

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  /** Enables hot reloading for local packages without a build step */
  transpilePackages: INTERNAL_PACKAGES,
  output: IS_PRODUCTION ? 'standalone' : undefined,
  // Generate unique build ID on each production build to bust CloudFront cache
  generateBuildId: IS_PRODUCTION ? async () => {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  } : undefined,
  images: getImagesConfig(),
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  serverExternalPackages: SERVER_EXTERNAL_PACKAGES,
  // needed for supporting dynamic imports for local content
  outputFileTracingIncludes: {
    '/*': ['./content/**/*'],
  },
  redirects: getRedirects,
  turbopack: {
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx'],
    resolveAlias: getModulesAliases(),
  },
  devIndicators:
    process.env.NEXT_PUBLIC_CI === 'true'
      ? false
      : {
          position: 'bottom-right',
        },
  reactCompiler: ENABLE_REACT_COMPILER,
  // Fix Server Actions in local development
  async headers() {
    if (process.env.NODE_ENV !== 'production') {
      return [
        {
          source: '/:path*',
          headers: [
            {
              key: 'x-forwarded-host',
              value: 'localhost:3000',
            },
          ],
        },
      ];
    }
    return [];
  },
  experimental: {
    mdxRs: true,
    turbopackFileSystemCacheForDev: true,
    ...(optimizePackageImports
      ? { optimizePackageImports }
      : {}),
  },
  modularizeImports: {
    lodash: {
      transform: 'lodash/{{member}}',
    },
  },
  /** We already do linting and typechecking as separate tasks in CI */
  typescript: { ignoreBuildErrors: true },
};

export default withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})(config);

/** @returns {import('next').NextConfig['images']} */
function getImagesConfig() {
  const remotePatterns = [];

  if (ASSET_BASE_URL) {
    try {
      const url = new URL(ASSET_BASE_URL);
      const protocol = url.protocol.replace(':', '');

      remotePatterns.push({
        protocol: /** @type {'http' | 'https'} */ (protocol || 'https'),
        hostname: url.hostname,
      });
    } catch {
      // ignore invalid URL during build; we will warn in follow-up validations
    }
  }

  if (IS_PRODUCTION) {
    return {
      remotePatterns,
    };
  }

  remotePatterns.push(
    /** @type {const} */ ({
      protocol: 'http',
      hostname: '127.0.0.1',
    }),
    /** @type {const} */ ({
      protocol: 'http',
      hostname: 'localhost',
    }),
  );

  return {
    remotePatterns,
  };
}

async function getRedirects() {
  return [
    {
      source: '/server-sitemap.xml',
      destination: '/sitemap.xml',
      permanent: true,
    },
  ];
}

/**
 * @description Aliases modules based on the environment variables
 * This will speed up the development server by not loading the modules that are not needed
 * @returns {Record<string, string>}
 */
function getModulesAliases() {
  if (process.env.NODE_ENV !== 'development') {
    return {};
  }

  const monitoringProvider = process.env.NEXT_PUBLIC_MONITORING_PROVIDER;
  const billingProvider = process.env.NEXT_PUBLIC_BILLING_PROVIDER;
  const mailerProvider = process.env.MAILER_PROVIDER;
  const captchaProvider = process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY;

  // exclude the modules that are not needed
  const excludeSentry = monitoringProvider !== 'sentry';
  const excludeStripe = billingProvider !== 'stripe';
  const excludeNodemailer = mailerProvider !== 'nodemailer';
  const excludeTurnstile = !captchaProvider;

  /** @type {Record<string, string>} */
  const aliases = {};

  // the path to the noop module
  const noopPath = '~/lib/dev-mock-modules';

  if (excludeSentry) {
    aliases['@sentry/nextjs'] = noopPath;
  }

  if (excludeStripe) {
    aliases['stripe'] = noopPath;
    aliases['@stripe/stripe-js'] = noopPath;
  }

  if (excludeNodemailer) {
    aliases['nodemailer'] = noopPath;
  }

  if (excludeTurnstile) {
    aliases['@marsidev/react-turnstile'] = noopPath;
  }

  return aliases;
}
