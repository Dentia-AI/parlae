'use client';

import Link from 'next/link';

import { signOut } from 'next-auth/react';

import { LogOut, Menu } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import { Trans } from '@kit/ui/trans';

import pathsConfig from '~/config/paths.config';
import { personalAccountNavigationConfig } from '~/config/personal-account-navigation.config';

interface FlatLink {
  path: string;
  label: string;
  Icon?: React.ReactNode;
  indent?: boolean;
}

export function HomeMobileNavigation() {
  const handleSignOut = () =>
    signOut({
      callbackUrl: pathsConfig.auth.signIn,
    });

  const links: FlatLink[] = [];

  for (const group of personalAccountNavigationConfig.routes) {
    if ('divider' in group) continue;
    if (!('children' in group)) continue;

    for (const item of group.children) {
      links.push({
        path: item.path,
        label: item.label,
        Icon: (item as any).Icon,
      });

      if ('children' in item && Array.isArray((item as any).children)) {
        for (const child of (item as any).children) {
          if (child.path === item.path) continue;
          links.push({
            path: child.path,
            label: child.label,
            Icon: child.Icon,
            indent: true,
          });
        }
      }
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Menu className={'h-9'} />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        sideOffset={10}
        className={'w-screen rounded-none max-h-[80vh] overflow-y-auto'}
      >
        {links.map((link) => (
          <DropdownLink
            key={link.path}
            path={link.path}
            label={link.label}
            Icon={link.Icon ?? null}
            indent={link.indent}
          />
        ))}

        <DropdownMenuSeparator />

        <SignOutDropdownItem onSignOut={handleSignOut} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DropdownLink(
  props: React.PropsWithChildren<{
    path: string;
    label: string;
    Icon: React.ReactNode | null;
    indent?: boolean;
  }>,
) {
  return (
    <DropdownMenuItem asChild key={props.path}>
      <Link
        href={props.path}
        className={
          props.indent
            ? 'flex h-10 w-full items-center space-x-3 pl-10 text-muted-foreground'
            : 'flex h-12 w-full items-center space-x-4'
        }
      >
        {props.Icon}

        <span>
          <Trans i18nKey={props.label} defaults={props.label} />
        </span>
      </Link>
    </DropdownMenuItem>
  );
}

function SignOutDropdownItem(
  props: React.PropsWithChildren<{
    onSignOut: () => unknown;
  }>,
) {
  return (
    <DropdownMenuItem
      className={'flex h-12 w-full items-center space-x-4'}
      onClick={props.onSignOut}
    >
      <LogOut className={'h-6'} />

      <span>
        <Trans i18nKey={'common:signOut'} defaults={'Sign out'} />
      </span>
    </DropdownMenuItem>
  );
}
