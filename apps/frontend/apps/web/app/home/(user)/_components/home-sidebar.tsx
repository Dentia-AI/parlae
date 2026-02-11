import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarNavigation,
} from '@kit/ui/shadcn-sidebar';

import { AppLogo } from '~/components/app-logo';
import { NotificationBellSidebar } from '~/components/notifications';
import { ProfileAccountDropdownContainer } from '~/components/personal-account-dropdown-container';
import { personalAccountNavigationConfig } from '~/config/personal-account-navigation.config';

// home imports
import type { UserWorkspace } from '../_lib/server/load-user-workspace';
import { AccountSelector } from './account-selector';

interface HomeSidebarProps {
  workspace: UserWorkspace;
}

export function HomeSidebar(props: HomeSidebarProps) {
  const { workspace, user, accounts } = props.workspace;
  const collapsible = personalAccountNavigationConfig.sidebarCollapsedStyle;

  return (
    <Sidebar collapsible={collapsible}>
      <SidebarHeader className={'flex flex-col gap-3 py-3'}>
        <div className="flex justify-center px-2">
          <AppLogo />
        </div>
        <div className="px-2 group-data-[minimized=true]/sidebar:hidden">
          <AccountSelector
            accounts={accounts}
            currentAccountId={workspace.id}
            className="w-full"
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarNavigation config={personalAccountNavigationConfig} />
      </SidebarContent>

      <SidebarFooter>
        <div className="flex flex-col gap-2 w-full">
          <NotificationBellSidebar />
          <ProfileAccountDropdownContainer user={user} account={workspace} />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
