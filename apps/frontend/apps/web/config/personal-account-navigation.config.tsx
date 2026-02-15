import { CreditCard, User, Users, Settings, Wrench, BarChart3, Palette, FileText } from 'lucide-react';
import { z } from 'zod';

import { NavigationConfigSchema } from '@kit/ui/navigation-schema';

import featureFlagsConfig from '~/config/feature-flags.config';
import pathsConfig from '~/config/paths.config';

const iconClasses = 'w-4';

const routes = [
  {
    label: 'common:routes.application',
    children: [
      {
        label: 'common:routes.dashboard',
        path: pathsConfig.app.home,
        Icon: <BarChart3 className={iconClasses} />,
        end: true,
      },
      {
        label: 'common:routes.callLogs',
        path: '/home/call-logs',
        Icon: <FileText className={iconClasses} />,
      },
      {
        label: 'common:routes.setup',
        path: '/home/agent',
        Icon: <Settings className={iconClasses} />,
        children: [
          {
            label: 'common:routes.aiAgents',
            path: '/home/agent',
            Icon: <Settings className={iconClasses} />,
          },
          {
            label: 'common:routes.advancedSetup',
            path: '/home/agent/advanced',
            Icon: <Wrench className={iconClasses} />,
          },
        ],
      },
    ],
  },
  {
    label: 'common:routes.settings',
    children: [
      {
        label: 'common:routes.profile',
        path: pathsConfig.app.personalAccountSettings,
        Icon: <User className={iconClasses} />,
      },
      {
        label: 'Email Branding',
        path: '/home/settings/branding',
        Icon: <Palette className={iconClasses} />,
      },
      featureFlagsConfig.enablePersonalAccountBilling
        ? {
            label: 'common:routes.billing',
            path: pathsConfig.app.personalAccountBilling,
            Icon: <CreditCard className={iconClasses} />,
          }
        : undefined,
      {
        label: 'account:team',
        path: '/home/employees',
        Icon: <Users className={iconClasses} />,
      },
    ].filter((route) => !!route),
  },
] satisfies z.infer<typeof NavigationConfigSchema>['routes'];

export const personalAccountNavigationConfig = NavigationConfigSchema.parse({
  routes,
  style: process.env.NEXT_PUBLIC_USER_NAVIGATION_STYLE,
  sidebarCollapsed: process.env.NEXT_PUBLIC_HOME_SIDEBAR_COLLAPSED,
  sidebarCollapsedStyle: process.env.NEXT_PUBLIC_SIDEBAR_COLLAPSIBLE_STYLE,
});
