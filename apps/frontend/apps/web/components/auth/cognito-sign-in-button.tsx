'use client';

import { Button } from '@kit/ui/button';

export function CognitoSignInButton({
  children,
  onStartAuth,
  isAuthenticating = false,
  variant = 'default',
  leadingIcon,
  className,
}: {
  children: React.ReactNode;
  onStartAuth: () => void;
  isAuthenticating?: boolean;
  variant?: 'default' | 'outline' | 'secondary';
  leadingIcon?: React.ReactNode;
  className?: string;
}) {
  return (
    <Button
      variant={variant}
      onClick={onStartAuth}
      disabled={isAuthenticating}
      className={className ? `w-full ${className}` : 'w-full'}
    >
      {leadingIcon && <span className="mr-2 flex h-4 w-4 items-center justify-center">{leadingIcon}</span>}
      {isAuthenticating ? 'Connecting…' : children}
    </Button>
  );
}
