import {
  BorderedNavigationMenu,
  BorderedNavigationMenuItem,
} from '@kit/ui/bordered-navigation-menu';

import { AppLogo } from '~/components/app-logo';
import { NotificationBell } from '~/components/notifications';
import { ProfileAccountDropdownContainer } from '~/components/personal-account-dropdown-container';
import { personalAccountNavigationConfig } from '~/config/personal-account-navigation.config';

import { type UserWorkspace } from '../_lib/server/load-user-workspace';

export function HomeMenuNavigation(props: { workspace: UserWorkspace }) {
  const { workspace, user } = props.workspace;

  const routes = personalAccountNavigationConfig.routes.reduce<
    Array<{
      path: string;
      label: string;
      Icon?: React.ReactNode;
      end?: boolean | ((path: string) => boolean);
    }>
  >((acc, item) => {
    if ('children' in item) {
      return [...acc, ...item.children];
    }

    if ('divider' in item) {
      return acc;
    }

    return [...acc, item];
  }, []);

  return (
    <div className={'flex w-full flex-1 justify-between'}>
      <div className={'flex items-center space-x-8'}>
        <AppLogo />

        <BorderedNavigationMenu>
          {routes.map((route) => (
            <BorderedNavigationMenuItem {...route} key={route.path} />
          ))}
        </BorderedNavigationMenu>
      </div>

      <div className={'flex items-center gap-4'}>
        <NotificationBell />
        <ProfileAccountDropdownContainer
          user={user}
          account={workspace}
          showProfileName={false}
        />
      </div>
    </div>
  );
}
