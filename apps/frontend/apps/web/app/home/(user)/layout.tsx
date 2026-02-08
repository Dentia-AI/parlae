import { use } from 'react';

import { cookies } from 'next/headers';

import { z } from 'zod';

import { UserWorkspaceContextProvider } from '@kit/accounts/components';
import { Page, PageMobileNavigation, PageNavigation } from '@kit/ui/page';
import { SidebarProvider } from '@kit/ui/shadcn-sidebar';
import { getImpersonationInfo } from '@kit/shared/auth';

import { AppLogo } from '~/components/app-logo';
import { personalAccountNavigationConfig } from '~/config/personal-account-navigation.config';
import { withI18n } from '~/lib/i18n/with-i18n';

// home imports
import { HomeMenuNavigation } from './_components/home-menu-navigation';
import { HomeMobileNavigation } from './_components/home-mobile-navigation';
import { HomeMobileBottomNav } from './_components/home-mobile-bottom-nav';
import { HomeSidebar } from './_components/home-sidebar';
import { loadUserWorkspace } from './_lib/server/load-user-workspace';
import { ImpersonationBanner } from '../../admin/_components/impersonation-banner';
import { endImpersonationAction } from '~/admin/accounts/_lib/server/admin-actions';

function UserHomeLayout({ children }: React.PropsWithChildren) {
  const state = use(getLayoutState());

  if (state.style === 'sidebar') {
    return <SidebarLayout>{children}</SidebarLayout>;
  }

  return <HeaderLayout>{children}</HeaderLayout>;
}

export default withI18n(UserHomeLayout);

function SidebarLayout({ children }: React.PropsWithChildren) {
  const workspace = use(loadUserWorkspace());
  const state = use(getLayoutState());
  const impersonation = use(getImpersonationInfo());

  console.log('[SidebarLayout] Impersonation data:', impersonation);

  return (
    <UserWorkspaceContextProvider value={workspace}>
      <SidebarProvider defaultOpen={state.open}>
        <Page style={'sidebar'}>
          <PageNavigation>
            <HomeSidebar workspace={workspace} />
          </PageNavigation>

          <PageMobileNavigation className={'flex items-center justify-between'}>
            <MobileNavigation />
          </PageMobileNavigation>

          <div className="flex flex-1 flex-col">
            {impersonation && (
              <div className="w-full px-4 pt-4 pb-2">
                <ImpersonationBanner
                  adminEmail={impersonation.admin.email}
                  targetEmail={impersonation.targetUser.email}
                  onStop={endImpersonationAction}
                />
              </div>
            )}
            {children}
          </div>
        </Page>

        <HomeMobileBottomNav workspace={workspace} />
      </SidebarProvider>
    </UserWorkspaceContextProvider>
  );
}

function HeaderLayout({ children }: React.PropsWithChildren) {
  const workspace = use(loadUserWorkspace());
  const impersonation = use(getImpersonationInfo());

  return (
    <UserWorkspaceContextProvider value={workspace}>
      <Page style={'header'}>
        <PageNavigation>
          <HomeMenuNavigation workspace={workspace} />
        </PageNavigation>

        <PageMobileNavigation className={'flex items-center justify-between'}>
          <MobileNavigation />
        </PageMobileNavigation>

        <div className="flex flex-1 flex-col">
          {impersonation && (
            <div className="w-full px-4 pt-4 pb-2">
              <ImpersonationBanner
                adminEmail={impersonation.admin.email}
                targetEmail={impersonation.targetUser.email}
                onStop={endImpersonationAction}
              />
            </div>
          )}
          {children}
        </div>
      </Page>

      <HomeMobileBottomNav workspace={workspace} />
    </UserWorkspaceContextProvider>
  );
}

function MobileNavigation() {
  return (
    <>
      <AppLogo />

      <HomeMobileNavigation />
    </>
  );
}

async function getLayoutState() {
  const cookieStore = await cookies();

  const LayoutStyleSchema = z.enum(['sidebar', 'header', 'custom']);

  const layoutStyleCookie = cookieStore.get('layout-style');
  const sidebarOpenCookie = cookieStore.get('sidebar:state');

  const sidebarOpen = sidebarOpenCookie
    ? sidebarOpenCookie.value === 'false'
    : !personalAccountNavigationConfig.sidebarCollapsed;

  const parsedStyle = LayoutStyleSchema.safeParse(layoutStyleCookie?.value);

  const style = parsedStyle.success
    ? parsedStyle.data
    : personalAccountNavigationConfig.style;

  return {
    open: sidebarOpen,
    style,
  };
}
