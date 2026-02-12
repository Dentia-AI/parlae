export const dynamic = 'force-static';

const KNOWN_GIT_ENV_VARS = [
  'GIT_COMMIT_SHA',
  'CF_PAGES_COMMIT_SHA',
  'VERCEL_GIT_COMMIT_SHA',
  'GIT_HASH',
];

export const GET = async () => {
  const currentGitHash = await getGitHash();
  const buildTimestamp = process.env.BUILD_TIMESTAMP || 'unknown';
  const cognitoDomain = process.env.COGNITO_DOMAIN || 'NOT_SET';
  const cognitoSocialProviders = process.env.NEXT_PUBLIC_COGNITO_SOCIAL_PROVIDERS || 'NOT_SET';
  const languagePriority = process.env.NEXT_PUBLIC_LANGUAGE_PRIORITY || 'NOT_SET';

  const versionInfo = {
    gitCommit: currentGitHash || 'unknown',
    buildTimestamp,
    deployedAt: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    cognitoDomain,
    cognitoSocialProviders,
    languagePriority,
  };

  return new Response(JSON.stringify(versionInfo, null, 2), {
    headers: {
      'content-type': 'application/json',
    },
  });
};

async function getGitHash() {
  for (const envVar of KNOWN_GIT_ENV_VARS) {
    if (process.env[envVar]) {
      return process.env[envVar];
    }
  }

  try {
    return await getHashFromProcess();
  } catch (error) {
    console.warn(
      `[WARN] Could not find git hash: ${JSON.stringify(error)}. You may want to provide a fallback.`,
    );

    return '';
  }
}

async function getHashFromProcess() {
  // avoid calling a Node.js command in the edge runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.NODE_ENV !== 'development') {
      console.warn(
        `[WARN] Could not find git hash in environment variables. Falling back to git command. Supply a known git hash environment variable to avoid this warning.`,
      );
    }

    const { execSync } = await import('child_process');

    return execSync('git log --pretty=format:"%h" -n1').toString().trim();
  }

  console.log(
    `[INFO] Could not find git hash in environment variables. Falling back to git command. Supply a known git hash environment variable to avoid this warning.`,
  );
}
