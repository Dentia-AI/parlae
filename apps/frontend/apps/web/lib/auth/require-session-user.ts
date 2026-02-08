import { redirect } from 'next/navigation';

import pathsConfig from '~/config/paths.config';

import { getSessionUser } from './session-user';

export async function requireSessionUser(options?: { redirectTo?: string }) {
  const user = await getSessionUser();

  if (!user) {
    redirect(options?.redirectTo ?? pathsConfig.auth.signIn);
  }

  return user;
}
