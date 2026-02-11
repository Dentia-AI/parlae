import { Header } from '@kit/ui/marketing';
import { cn } from '@kit/ui/utils';

import { AppLogo } from '~/components/app-logo';
import type { JWTUserData } from '~/types/auth';

import { SiteHeaderAccountSection } from './site-header-account-section';
import { SiteNavigation } from './site-navigation';

type SupportedUserShape =
  | JWTUserData
  | (Partial<JWTUserData> & {
      id?: string | null;
      name?: string | null;
      image?: string | null;
    });

export function SiteHeader(props: { user?: SupportedUserShape | null; transparent?: boolean }) {
  const normalizedUser = normalizeUser(props.user);

  return (
    <Header
      className={cn(
        props.transparent && 'bg-transparent dark:bg-transparent border-b border-white/10'
      )}
      logo={<AppLogo />}
      navigation={<SiteNavigation />}
      actions={<SiteHeaderAccountSection user={normalizedUser} />}
    />
  );
}

function normalizeUser(user?: SupportedUserShape | null): JWTUserData | null {
  if (!user) {
    return null;
  }

  if ('is_anonymous' in user && 'aal' in user) {
    return user as JWTUserData;
  }

  if (!user.id) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? null,
    phone: ('phone' in user ? user.phone : null) ?? null,
    is_anonymous: false,
    aal: ('aal' in user ? user.aal : null) ?? 'aal1',
    app_metadata: ('app_metadata' in user && user.app_metadata) || {},
    user_metadata: ('user_metadata' in user && user.user_metadata) || {},
    amr: ('amr' in user && Array.isArray(user.amr) ? user.amr : []) ?? [],
  };
}
