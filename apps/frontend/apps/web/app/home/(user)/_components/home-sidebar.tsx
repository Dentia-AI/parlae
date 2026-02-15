import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarNavigation,
  SidebarTrigger,
} from '@kit/ui/shadcn-sidebar';

import { AppLogo } from '~/components/app-logo';
import { ProfileAccountDropdownContainer } from '~/components/personal-account-dropdown-container';
import { personalAccountNavigationConfig } from '~/config/personal-account-navigation.config';
import { SidebarNotificationButton } from './sidebar-notification-button';

// home imports
import type { UserWorkspace } from '../_lib/server/load-user-workspace';

interface HomeSidebarProps {
  workspace: UserWorkspace;
}

export function HomeSidebar(props: HomeSidebarProps) {
  const { workspace, user, accounts } = props.workspace;
  const collapsible = personalAccountNavigationConfig.sidebarCollapsedStyle;

  // Derive display name: business name > account name > user email
  const displayName =
    (workspace as any).brandingBusinessName ||
    workspace.name ||
    user?.email ||
    'My Clinic';

  return (
    <Sidebar collapsible={collapsible}>
      <SidebarHeader className={'flex flex-col gap-3 py-3'}>
        <div className="flex items-center justify-center px-2 group-data-[minimized=true]/sidebar:flex-col group-data-[minimized=true]/sidebar:gap-4 relative">
          <div className="group-data-[minimized=false]/sidebar:absolute group-data-[minimized=false]/sidebar:left-2">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground h-5 w-5 cursor-pointer" />
          </div>
          <div>
            <AppLogo />
          </div>
        </div>
        <div className="px-3 group-data-[minimized=true]/sidebar:hidden">
          <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary text-xs font-bold">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate leading-tight">
                {displayName}
              </p>
              <p className="text-[10px] text-muted-foreground truncate leading-tight">
                {user?.email}
              </p>
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarNavigation config={personalAccountNavigationConfig} />
      </SidebarContent>

      <SidebarFooter>
        <div className="flex flex-col gap-2 w-full">
          <div className="flex items-center gap-1 w-full">
            <div className="flex-1 min-w-0">
              <ProfileAccountDropdownContainer user={user} account={workspace} />
            </div>
            <SidebarNotificationButton />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
