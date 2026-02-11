import { Footer } from '@kit/ui/marketing';
import { Trans } from '@kit/ui/trans';

import { AppLogo } from '~/components/app-logo';
import appConfig from '~/config/app.config';

export function SiteFooter() {
  return (
    <Footer
      logo={<AppLogo className="w-[85px] md:w-[95px]" />}
      description={<Trans i18nKey="marketing:footerDescription" />}
      copyright={
        <>
          © {new Date().getFullYear()} Dentia Lab Inc. All rights reserved.
        </>
      }
      sections={[
        {
          heading: <Trans i18nKey="marketing:about" />,
          links: [
            { href: '/blog', label: <Trans i18nKey="marketing:blog" /> },
            { href: '/contact', label: <Trans i18nKey="marketing:contact" /> },
          ],
        },
        {
          heading: <Trans i18nKey="marketing:product" />,
          links: [
            {
              href: '#features',
              label: <Trans i18nKey="marketing:features" />,
            },
            {
              href: '#integrations',
              label: <Trans i18nKey="marketing:integrations" />,
            },
          ],
        },
        {
          heading: <Trans i18nKey="marketing:legal" />,
          links: [
            {
              href: '/terms-of-service',
              label: <Trans i18nKey="marketing:termsOfService" />,
            },
            {
              href: '/privacy-policy',
              label: <Trans i18nKey="marketing:privacyPolicy" />,
            },
            {
              href: '/cookie-policy',
              label: <Trans i18nKey="marketing:cookiePolicy" />,
            },
          ],
        },
      ]}
    />
  );
}
