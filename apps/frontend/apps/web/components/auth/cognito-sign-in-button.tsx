'use client';

import { useTransition } from 'react';

import { signIn } from 'next-auth/react';

import { Button } from '@kit/ui/button';

export function CognitoSignInButton({
  callbackUrl,
  children,
  screenHint,
  identityProvider,
  variant = 'default',
  leadingIcon,
  className,
}: {
  callbackUrl?: string;
  children: React.ReactNode;
  screenHint?: 'signup';
  identityProvider?: string;
  variant?: 'default' | 'outline' | 'secondary';
  leadingIcon?: React.ReactNode;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(() => {
      const authParams: Record<string, string> = {};

      if (identityProvider) {
        authParams.identity_provider = identityProvider;
      }

      void signIn(
        'cognito',
        {
          callbackUrl,
        },
        authParams,
      );
    });
  };

  return (
    <Button
      variant={variant}
      onClick={handleClick}
      disabled={isPending}
      className={className ? `w-full ${className}` : 'w-full'}
    >
      {leadingIcon && <span className="mr-2 flex h-4 w-4 items-center justify-center">{leadingIcon}</span>}
      {isPending ? 'Connecting…' : children}
    </Button>
  );
}
