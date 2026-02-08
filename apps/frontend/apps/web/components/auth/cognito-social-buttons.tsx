'use client';

import { Fragment, useMemo } from 'react';

import { Badge } from '@kit/ui/badge';
import { Separator } from '@kit/ui/separator';
import { CognitoSignInButton } from './cognito-sign-in-button';
import { Globe } from 'lucide-react';

const providerLabels: Record<string, string> = {
  Google: 'Google',
  LoginWithAmazon: 'Amazon',
  Facebook: 'Facebook',
  Apple: 'Apple',
  GitHub: 'GitHub',
  Twitter: 'Twitter',
  Microsoft: 'Microsoft',
};

const providerIcons: Record<string, React.ReactNode> = {
  Google: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M11.988 10.176v3.916h5.458c-.218 1.26-.982 2.327-2.09 3.04l3.381 2.624c1.974-1.822 3.11-4.502 3.11-7.693 0-.738-.066-1.45-.192-2.132h-9.667z"
      />
      <path
        fill="#34A853"
        d="M6.53 14.308l-.748.571-2.694 2.096c1.535 3.051 4.688 5.141 8.307 5.141 2.511 0 4.62-.828 6.161-2.251l-3.381-2.624c-.906.61-2.065.97-2.78.97-2.132 0-3.944-1.438-4.588-3.37z"
      />
      <path
        fill="#4A90E2"
        d="M3.088 6.825A8.964 8.964 0 001.5 11.91a8.968 8.968 0 001.584 5.084l3.444-2.686a5.34 5.34 0 01-.31-1.74c0-.6.108-1.178.303-1.718z"
      />
      <path
        fill="#FBBC05"
        d="M11.395 4.596a5.116 5.116 0 013.593 1.428l2.66-2.66C16.71 1.932 14.6 1 11.988 1 8.372 1 5.223 3.085 3.088 6.825l3.432 2.659c.649-1.943 2.462-3.388 4.875-3.388z"
      />
    </svg>
  ),
  LoginWithAmazon: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        d="M15.102 2.21c-.077.001-.154.01-.231.027-1.437.33-2.355 1.55-2.86 2.737-.404.959-.608 1.995-.68 3.036-.045.657-.005 1.322.104 1.97l-1.342.319c-.087-.472-.146-.948-.168-1.428-.13-2.59.722-5.655 2.77-7.2C14.332 1 15.86.722 17.097 1.266c1.111.487 1.574 1.704 1.62 2.806.02.48-.036.96-.167 1.42-.162.56-.592 1.042-1.121 1.215-.718.233-1.513-.01-2.066-.493-.564-.478-.767-1.146-.725-1.85.039-.636.516-1.182 1.164-1.206.644-.003 1.194.52 1.198 1.175.002.28-.12.552-.325.744-.202.202-.487.31-.775.31-.148 0-.295-.032-.43-.093-.278-.113-.487-.365-.55-.656a.63.63 0 01.144-.534c.12-.135.3-.214.479-.214.19 0 .374.085.498.225.118.13.149.319.079.482-.071.163-.224.281-.4.3-.113.016-.229-.027-.314-.113-.069-.068-.103-.165-.092-.262.014-.132.11-.247.239-.288.058-.028.122-.035.184-.019.063.018.118.056.157.108" fill="#FF9900" />
    </svg>
  ),
};

function formatProviderLabel(provider: string) {
  return providerLabels[provider] ?? provider.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CognitoSocialSignInButtons({
  providers,
  callbackUrl,
  mode = 'signin',
}: {
  providers: string[];
  callbackUrl?: string;
  mode?: 'signin' | 'signup';
}) {
  const providerDetails = useMemo(
    () =>
      providers.map((provider) => {
        const normalized = provider.trim();
        return {
          id: normalized,
          label: formatProviderLabel(normalized),
          icon: providerIcons[normalized] ?? <Globe className="h-4 w-4" aria-hidden="true" />,
        };
      }),
    [providers],
  );

  if (!providerDetails.length) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {providerDetails.map((provider) => (
          <CognitoSignInButton
            key={provider.id}
            callbackUrl={callbackUrl}
            identityProvider={provider.id}
            screenHint={mode === 'signup' ? 'signup' : undefined}
            variant="outline"
            leadingIcon={provider.icon}
          >
            Continue with {provider.label}
          </CognitoSignInButton>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Separator className="flex-1" />
        <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
          Or continue with email
        </Badge>
        <Separator className="flex-1" />
      </div>
    </div>
  );
}
