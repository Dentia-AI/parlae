import { SiteFooter } from '~/(marketing)/_components/site-footer';
import { SiteHeader } from '~/(marketing)/_components/site-header';
import { withI18n } from '~/lib/i18n/with-i18n';
import { getSessionUser } from '~/lib/auth/session-user';

async function SiteLayout(props: React.PropsWithChildren) {
  const user = await getSessionUser();

  return (
    <div className={'flex min-h-[100vh] flex-col'}>
      <SiteHeader user={user} />

      <main className={'flex-1 pt-16 lg:pt-20'}>{props.children}</main>

      <SiteFooter />
    </div>
  );
}

export default withI18n(SiteLayout);
