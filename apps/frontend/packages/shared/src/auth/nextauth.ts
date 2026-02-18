import NextAuth from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Credentials from 'next-auth/providers/credentials';

import { ensureUserProvisioned } from './ensure-user';
import { getCognitoUser, initiateUserPasswordAuth } from './cognito-helpers';
import { storeCognitoTokens } from './token-storage';
import { createGoHighLevelService } from '../gohighlevel/gohighlevel.service';

const isProduction = process.env.NODE_ENV === 'production';

const requiredVars = ['COGNITO_CLIENT_ID', 'COGNITO_CLIENT_SECRET', 'COGNITO_ISSUER'] as const;

// Check if we're using dummy values (for local CI/testing only)
const hasDummyValues = requiredVars.some(v => 
  process.env[v]?.includes('dummy-client-id-for-build') ||
  process.env[v]?.includes('dummy-client-secret-for-build') ||
  process.env[v]?.includes('dummy-pool-for-build')
);

// Only validate env vars in production runtime (not during local CI builds with dummy values)
if (isProduction && !hasDummyValues) {
  for (const variable of requiredVars) {
    if (!process.env[variable]) {
      throw new Error(`${variable} is not set`);
    }
  }
}

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error('NEXTAUTH_SECRET is not set');
} else if (isProduction && !process.env.NEXTAUTH_SECRET.includes('dummy')) {
  // Additional validation for production
  if (process.env.NEXTAUTH_SECRET.length < 32) {
    console.warn('NEXTAUTH_SECRET should be at least 32 characters for security');
  }
}

function normalizeDomain(value?: string | null) {
  if (!value) {
    return null;
  }

  return value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`;
}

const cognitoDomain = normalizeDomain(process.env.COGNITO_DOMAIN);
const issuerDomain = process.env.COGNITO_ISSUER;
const defaultAllowedOrigins = [
  'https://hub.parlae.ca',
  'https://app.parlae.ca',
  'https://hub.parlae.com',
  'https://hub.dentia.co',
  'https://hub.parlae.app',
  'https://hub.parlae.ca',
  'http://localhost:3000',
];
const allowedCallbackOrigins = (
  process.env.NEXTAUTH_ALLOWED_CALLBACK_ORIGINS ?? defaultAllowedOrigins.join(',')
)
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

function buildCognitoUrl(path: string) {
  const base = cognitoDomain ?? issuerDomain;

  if (!base) {
    throw new Error('COGNITO_DOMAIN or COGNITO_ISSUER must be defined');
  }

  return `${base.replace(/\/$/, '')}${path}`;
}

function buildCookies() {
  const configuredDomain = process.env.COOKIE_DOMAIN ?? '.parlae.ca';
  // Local dev runs on localhost and can't accept domain cookies – only force
  // a domain when explicitly configured or when running production builds.
  const cookieDomain = isProduction || process.env.COOKIE_DOMAIN ? configuredDomain : undefined;
  const baseOptions = {
    sameSite: 'lax' as const,
    path: '/',
    secure: isProduction,
  };
  const domainOptions = cookieDomain ? { ...baseOptions, domain: cookieDomain } : baseOptions;

  return {
    sessionToken: {
      name: isProduction ? '__Secure-authjs.session-token' : 'authjs.session-token',
      options: {
        ...domainOptions,
        httpOnly: true,
      },
    },
    callbackUrl: {
      name: isProduction ? '__Secure-authjs.callback-url' : 'authjs.callback-url',
      options: {
        ...domainOptions,
        httpOnly: false,
      },
    },
    csrfToken: {
      name: isProduction ? '__Host-authjs.csrf-token' : 'authjs.csrf-token',
      options: {
        ...baseOptions,
        httpOnly: false,
      },
    },
    pkceCodeVerifier: {
      name: isProduction ? '__Secure-authjs.pkce.code_verifier' : 'authjs.pkce.code_verifier',
      options: {
        ...domainOptions,
        httpOnly: true,
        maxAge: 60 * 15,
      },
    },
    state: {
      name: isProduction ? '__Secure-authjs.state' : 'authjs.state',
      options: {
        ...domainOptions,
        httpOnly: true,
        maxAge: 60 * 15,
      },
    },
    nonce: {
      name: isProduction ? '__Secure-authjs.nonce' : 'authjs.nonce',
      options: {
        ...domainOptions,
        httpOnly: true,
        maxAge: 60 * 15,
      },
    },
  };
}

function buildRedirectCallback() {
  return ({ url, baseUrl: defaultBase }: { url: string | undefined; baseUrl: string }) => {
    // Use runtime NEXTAUTH_URL for base URL determination
    const runtimeBase = process.env.NEXTAUTH_URL ?? defaultBase ?? 'https://app.parlae.ca';
    let baseUrl: URL;

    try {
      baseUrl = new URL(runtimeBase);
    } catch {
      baseUrl = new URL('https://app.parlae.ca');
    }

    const trustedHost = baseUrl.host;
    const trustedOrigin = baseUrl.origin;
    const allowedOrigins = new Set<string>([trustedOrigin, ...allowedCallbackOrigins]);
    try {
      if (!url) {
        return baseUrl.toString();
      }

      let target: URL;

      if (url.startsWith('/')) {
        target = new URL(url, baseUrl);
      } else {
        try {
          target = new URL(url);
        } catch {
          target = new URL(url, defaultBase);
        }
      }

      const targetOrigin = target.origin;

      if (targetOrigin === trustedOrigin) {
        target.host = trustedHost;
        target.protocol = baseUrl.protocol;
        target.port = baseUrl.port;
        console.log(JSON.stringify({
          message: '[Auth][NextAuth][Redirect] Normalized internal redirect',
          input: url,
          output: target.toString(),
          trustedHost,
        }));
        return target.toString();
      }

      if (allowedOrigins.has(targetOrigin)) {
        console.log(JSON.stringify({
          message: '[Auth][NextAuth][Redirect] Allowing external redirect',
          input: url,
          output: target.toString(),
        }));
        return target.toString();
      }

      console.warn(JSON.stringify({
        message: '[Auth][NextAuth][Redirect] Origin not allowed, falling back',
        input: url,
        fallback: baseUrl.toString(),
      }));
      return baseUrl.toString();
    } catch (error) {
      console.error(JSON.stringify({
        message: '[Auth][NextAuth] Failed to normalize redirect URL',
        url,
        error: error instanceof Error ? error.message : error,
      }));

      return baseUrl.toString();
    }
  };
}

const providers = [];

// Disable Cognito OAuth in Docker/local development to avoid production redirect issues
const isDockerLocal = process.env.NEXTAUTH_URL?.includes('localhost:3009') ||
                     process.env.NODE_ENV === 'development';

if (
  process.env.COGNITO_CLIENT_ID &&
  process.env.COGNITO_CLIENT_SECRET &&
  process.env.COGNITO_ISSUER &&
  !process.env.COGNITO_CLIENT_ID.includes('dummy') &&
  !isDockerLocal
) {
  providers.push({
    id: 'cognito',
    name: 'Cognito',
    type: 'oidc', // Use OIDC to properly handle Cognito's issuer in ID token
    clientId: process.env.COGNITO_CLIENT_ID,
    clientSecret: process.env.COGNITO_CLIENT_SECRET,
    issuer: process.env.COGNITO_ISSUER, // Tell Next-Auth to expect Cognito's issuer
    authorization: {
      url: buildCognitoUrl('/oauth2/authorize'),
      params: {
        scope: 'openid email profile',
      },
    },
    // Ensure all recommended checks run end-to-end via CloudFront
    checks: ['pkce', 'state', 'nonce'],
    token: {
      url: buildCognitoUrl('/oauth2/token'),
      // Next-Auth will automatically include code_verifier for PKCE
    },
    userinfo: {
      url: buildCognitoUrl('/oauth2/userInfo'),
      // Next-Auth will automatically fetch user data from this endpoint
    },
    profile(profile) {
      // Cognito with Google federation may provide given_name/family_name
      // instead of (or in addition to) a single "name" field.
      const p = profile as Record<string, unknown>;
      const givenName = typeof p.given_name === 'string' ? p.given_name.trim() : '';
      const familyName = typeof p.family_name === 'string' ? p.family_name.trim() : '';
      const fullName = typeof p.name === 'string' ? p.name.trim() : '';

      const resolvedName =
        fullName ||
        [givenName, familyName].filter(Boolean).join(' ') ||
        profile.email;

      return {
        id: profile.sub ?? p.username ?? profile.email,
        email: profile.email,
        name: resolvedName,
        image: profile.picture,
      };
    },
  } satisfies Provider);
}

const enableCredentialsSignin = process.env.ENABLE_CREDENTIALS_SIGNIN !== 'false';

if (enableCredentialsSignin || process.env.NODE_ENV === 'development') {
  providers.push(
    Credentials({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('InvalidCredentials');
        }

        // Development mode: Accept test credentials
        if (process.env.NODE_ENV === 'development' || process.env.NEXTAUTH_URL?.includes('localhost')) {
          const ensureDevUser = async (userData: { id: string; email: string; name: string | null; image: null }) => {
            const ensured = await ensureUserProvisioned({
              userId: userData.id,
              email: userData.email ?? credentials.email,
              displayName: userData.name,
            });

            return {
              ...userData,
              id: ensured.user.id,
              email: ensured.user.email,
              name: ensured.user.displayName,
            };
          };

          // Check for admin impersonation flow via special password
          if (credentials.password === '__impersonate__') {
            // Look up the user by email
            const { prisma } = await import('@kit/prisma');
            const targetUser = await prisma.user.findUnique({
              where: { email: credentials.email.toLowerCase() },
              select: { id: true, email: true, displayName: true },
            });
            
            if (targetUser) {
              return ensureDevUser({
                id: targetUser.id,
                email: targetUser.email,
                name: targetUser.displayName,
                image: null,
              });
            }
            
            throw new Error('InvalidCredentials');
          }

          // Test credentials for development
          if (credentials.email === 'test@example.com' && credentials.password === 'Thereis1') {
            // Look up the actual user from database instead of hardcoded ID
            const { prisma } = await import('@kit/prisma');
            const existingUser = await prisma.user.findUnique({
              where: { email: 'test@example.com' },
              select: { id: true, email: true, displayName: true },
            });
            
            if (existingUser) {
              return ensureDevUser({
                id: existingUser.id,
                email: existingUser.email,
                name: existingUser.displayName,
                image: null,
              });
            }
          }

          if (credentials.email === 'admin@example.com' && credentials.password === 'Thereis1') {
            // Look up the actual user from database instead of hardcoded ID
            const { prisma } = await import('@kit/prisma');
            const existingUser = await prisma.user.findUnique({
              where: { email: 'admin@example.com' },
              select: { id: true, email: true, displayName: true },
            });
            
            if (existingUser) {
              return ensureDevUser({
                id: existingUser.id,
                email: existingUser.email,
                name: existingUser.displayName,
                image: null,
              });
            }
          }

          // For other emails in development, create a mock user
          if (credentials.password === 'password') {
            return ensureDevUser({
              id: `dev-user-${credentials.email}`,
              email: credentials.email,
              name: credentials.email.split('@')[0],
              image: null,
            });
          }

          throw new Error('InvalidCredentials');
        }

        const clientId = process.env.COGNITO_CLIENT_ID;
        const clientSecret = process.env.COGNITO_CLIENT_SECRET;
        const issuer = process.env.COGNITO_ISSUER;

        if (!clientId || !clientSecret || !issuer) {
          throw new Error('CognitoNotConfigured');
        }

        let authResult;

        try {
          authResult = await initiateUserPasswordAuth({
            email: credentials.email,
            password: credentials.password,
            clientId,
            clientSecret,
            issuer,
          });
        } catch (error) {
          console.error(JSON.stringify({
            message: '[Auth][NextAuth] Cognito password auth failed',
            error: error instanceof Error ? error.message : error,
          }));
          throw new Error('InvalidCredentials');
        }

        let cognitoUser;

        try {
          cognitoUser = await getCognitoUser({
            accessToken: authResult.accessToken,
            issuer,
          });
        } catch (error) {
          console.error(JSON.stringify({
            message: '[Auth][NextAuth] Cognito GetUser failed',
            error: error instanceof Error ? error.message : error,
          }));
          throw new Error('InvalidCredentials');
        }

        const attributes = cognitoUser.attributes ?? {};
        const userId = attributes.sub ?? cognitoUser.username;
        const email = (attributes.email ?? credentials.email).toLowerCase();
        const displayName = attributes.name ?? attributes.email ?? credentials.email;

        const ensured = await ensureUserProvisioned({
          userId,
          email,
          displayName,
        });

        return {
          id: ensured.user.id,
          email: ensured.user.email,
          name: ensured.user.displayName,
          image: ensured.user.avatarUrl,
          cognitoTokens: authResult,
        };
      },
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers,
  cookies: buildCookies(),
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'cognito' && user?.email) {
        const profileRecord = profile as Record<string, unknown> | null | undefined;
        const profileSub = typeof profileRecord?.sub === 'string' ? profileRecord.sub : undefined;
        const candidateId = (user.id ?? account.providerAccountId ?? profileSub) as string | undefined;

        // Resolve the best display name from multiple possible profile fields
        const profileName = typeof profileRecord?.name === 'string' ? profileRecord.name.trim() : '';
        const givenName = typeof profileRecord?.given_name === 'string' ? profileRecord.given_name.trim() : '';
        const familyName = typeof profileRecord?.family_name === 'string' ? profileRecord.family_name.trim() : '';
        const compositeName = [givenName, familyName].filter(Boolean).join(' ');
        const bestName = profileName || compositeName || (typeof user.name === 'string' ? user.name : '');

        // Only use the name if it doesn't look like an email address
        const resolvedDisplayName = bestName && !bestName.includes('@') ? bestName : undefined;

        if (candidateId) {
          try {
            const ensured = await ensureUserProvisioned({
              userId: candidateId,
              email: user.email,
              displayName: resolvedDisplayName ?? user.name,
              cognitoUsername: account.providerAccountId ?? profileSub,
            });
            if (ensured?.user?.id) {
              (user as Record<string, unknown>).id = ensured.user.id;
            }

            // Sync to GoHighLevel CRM (covers Google OAuth and all Cognito logins)
            try {
              const ghlService = createGoHighLevelService();
              if (ghlService.isEnabled()) {
                ghlService.syncRegisteredUser({
                  email: user.email!,
                  displayName: resolvedDisplayName,
                }).catch((ghlErr) => {
                  console.error(JSON.stringify({
                    message: '[Auth][NextAuth] GHL sync failed (non-critical)',
                    error: ghlErr instanceof Error ? ghlErr.message : ghlErr,
                    email: user.email,
                  }));
                });
              }
            } catch { /* GHL init failure — non-critical */ }
          } catch (error) {
            console.error(JSON.stringify({
              message: '[Auth][NextAuth] Failed to provision user',
              error: error instanceof Error ? error.message : error,
              email: user.email,
            }));
          }
        }
      }

      if (user?.email && !account && 'id' in user) {
        const userId = (user as Record<string, unknown>).id as string | undefined;

        if (userId) {
          try {
            await ensureUserProvisioned({
              userId,
              email: user.email.toLowerCase(),
              displayName: user.name,
            });
          } catch (error) {
            console.error(JSON.stringify({
              message: '[Auth][NextAuth] Failed to provision user after credentials login',
              error: error instanceof Error ? error.message : error,
              email: user.email,
            }));
          }
        }
      }

      return true;
    },
    async jwt({ token, account, user }) {
      // Store Cognito tokens in database instead of JWT to keep cookie size small
      if (token.sub && account?.access_token && account?.id_token) {
        await storeCognitoTokens(token.sub, {
          accessToken: account.access_token,
          idToken: account.id_token,
          refreshToken: account.refresh_token,
          expiresIn: account.expires_in ? Number(account.expires_in) : undefined,
        });
      }

      // Handle credentials provider tokens
      if (token.sub && user && typeof user === 'object' && 'cognitoTokens' in user) {
        const tokens = (user as unknown as Record<string, unknown>).cognitoTokens as
          | { accessToken?: string; idToken?: string; refreshToken?: string; expiresIn?: number }
          | undefined;

        if (tokens?.accessToken && tokens?.idToken) {
          await storeCognitoTokens(token.sub, {
            accessToken: tokens.accessToken,
            idToken: tokens.idToken,
            refreshToken: tokens.refreshToken,
            expiresIn: tokens.expiresIn,
          });
        }
      }

      // Don't store tokens in JWT - keep it small!
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as unknown as Record<string, unknown>).id = token.sub;
      }

      // Don't pass tokens in session - they're stored in database
      // and will be fetched when needed for backend API calls
      return session;
    },
    redirect: buildRedirectCallback(),
  },
  secret: process.env.NEXTAUTH_SECRET,
});
