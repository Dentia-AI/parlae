import {
  BarChart3,
  FileText,
  Bot,
  Wrench,
  UserCog,
  ToggleLeft,
  Sparkles,
  BookOpen,
  Phone,
  Plug2,
} from 'lucide-react';
import { z } from 'zod';

import { NavigationConfigSchema } from '@kit/ui/navigation-schema';

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
        Icon: <Bot className={iconClasses} />,
        collapsible: true,
        collapsed: true,
        children: [
          {
            label: 'common:routes.agentOverview',
            path: '/home/agent',
            Icon: <Sparkles className={iconClasses} />,
          },
          {
            label: 'common:routes.knowledgeBase',
            path: '/home/agent/knowledge',
            Icon: <BookOpen className={iconClasses} />,
          },
          {
            label: 'common:routes.phoneSettings',
            path: '/home/agent/phone-settings',
            Icon: <Phone className={iconClasses} />,
          },
          {
            label: 'common:routes.integrations',
            path: '/home/agent/integrations',
            Icon: <Plug2 className={iconClasses} />,
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
    label: 'common:routes.manage',
    children: [
      {
        label: 'common:routes.accountSettings',
        path: pathsConfig.app.personalAccountSettings,
        Icon: <UserCog className={iconClasses} />,
      },
      {
        label: 'common:routes.features',
        path: '/home/features',
        Icon: <ToggleLeft className={iconClasses} />,
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
