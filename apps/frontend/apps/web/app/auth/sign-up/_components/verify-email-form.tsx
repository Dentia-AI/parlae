'use client';

import { useEffect, useState, useTransition } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { signIn } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@kit/ui/form';
import { Input } from '@kit/ui/input';
import { Trans } from '@kit/ui/trans';

const VerifyEmailSchema = z.object({
  code: z.string().min(6, 'Verification code must be at least 6 characters'),
});

type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;

interface VerifyEmailFormProps {
  email: string;
  username: string;
  password: string;
  callbackUrl?: string;
}

type AutoSignInStatus = 'idle' | 'running' | 'success' | 'error';

export function VerifyEmailForm({ email, username, password, callbackUrl }: VerifyEmailFormProps) {
  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [autoSignInStatus, setAutoSignInStatus] = useState<AutoSignInStatus>('idle');
  const [pending, startTransition] = useTransition();

  const form = useForm<VerifyEmailInput>({
    resolver: zodResolver(VerifyEmailSchema),
    defaultValues: {
      code: '',
    },
  });

  const handleVerify = (values: VerifyEmailInput) => {
    setStatus('verifying');
    setErrorMessage(null);
    setAutoSignInStatus('idle');

    startTransition(async () => {
      try {
        const response = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username,
            code: values.code,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.message || 'Verification failed');
        }

        setStatus('success');
      } catch (error) {
        setStatus('error');
        setErrorMessage(
          error instanceof Error ? error.message : 'Verification failed. Please try again.',
        );
      }
    });
  };

  useEffect(() => {
    if (status !== 'success' || autoSignInStatus !== 'idle') {
      return;
    }

    // If we somehow got here without a password, fall back to manual sign-in.
    if (!password) {
      setAutoSignInStatus('error');
      return;
    }

    setAutoSignInStatus('running');

    void (async () => {
      try {
        const result = await signIn('credentials', {
          email,
          password,
          redirect: false,
        });

        if (result?.error) {
          throw new Error(result.error);
        }

        setAutoSignInStatus('success');

        const destination =
          callbackUrl ||
          result?.url ||
          (typeof window !== 'undefined' ? window.location.origin : undefined);

        if (destination && typeof window !== 'undefined') {
          window.location.href = destination;
        }
      } catch (error) {
        console.error('Auto sign-in failed after verification', error);
        setAutoSignInStatus('error');
      }
    })();
  }, [status, email, password, callbackUrl, autoSignInStatus]);

  const handleResendCode = () => {
    startTransition(async () => {
      try {
        const response = await fetch('/api/auth/resend-verification', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username }),
        });

        if (response.ok) {
          alert('Verification code resent! Check your email.');
        } else {
          const data = await response.json();
          alert(data.error?.message || 'Failed to resend code');
        }
      } catch (error) {
        alert('Failed to resend code');
      }
    });
  };

  if (status === 'success') {
    const signInUrl = callbackUrl
      ? `/auth/sign-in?next=${encodeURIComponent(callbackUrl)}`
      : '/auth/sign-in';

    const renderAutoSignInStatus = () => {
      if (autoSignInStatus === 'error') {
        return (
          <p className="text-sm text-destructive">
            <Trans
              i18nKey="auth:autoSignInFailed"
              defaults="We verified your email but couldn't sign you in automatically. Use the button below to finish."
            />
          </p>
        );
      }

      if (autoSignInStatus === 'running' || autoSignInStatus === 'idle') {
        return (
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="auth:autoSigningIn"
              defaults="Hang tight—we're signing you in automatically."
            />
          </p>
        );
      }

      if (autoSignInStatus === 'success') {
        return (
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="auth:autoSignInComplete"
              defaults="Redirecting you to complete setup..."
            />
          </p>
        );
      }

      return null;
    };

    return (
      <Alert variant="success">
        <AlertTitle>
          <Trans i18nKey="auth:emailVerifiedHeading" defaults="Email verified!" />
        </AlertTitle>
        <AlertDescription className="space-y-4">
          <p>
            <Trans
              i18nKey="auth:emailVerifiedBody"
              defaults="Your email has been verified. You can now sign in with your credentials."
            />
          </p>

          {renderAutoSignInStatus()}

          <Button asChild>
            <a href={signInUrl}>
              <Trans i18nKey="auth:goToSignIn" defaults="Go to Sign In" />
            </a>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>
          <Trans i18nKey="auth:verifyEmailHeading" defaults="Check your email" />
        </AlertTitle>
        <AlertDescription>
          <Trans
            i18nKey="auth:verifyEmailBody"
            defaults="We sent a verification code to {email}. Enter it below to verify your account."
            values={{ email }}
          />
        </AlertDescription>
      </Alert>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleVerify)} className="space-y-4">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <Trans i18nKey="auth:verificationCode" defaults="Verification Code" />
                </FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    placeholder="123456"
                    autoComplete="one-time-code"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending || status === 'verifying'} className="flex-1">
              {status === 'verifying' ? (
                <Trans i18nKey="auth:verifying" defaults="Verifying..." />
              ) : (
                <Trans i18nKey="auth:verifyEmail" defaults="Verify Email" />
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={handleResendCode}
            >
              <Trans i18nKey="auth:resendCode" defaults="Resend Code" />
            </Button>
          </div>
        </form>
      </Form>

      <p className="text-center text-sm text-muted-foreground">
        <Trans
          i18nKey="auth:didntReceiveCode"
          defaults="Didn't receive the code? Check your spam folder or click Resend Code."
        />
      </p>
    </div>
  );
}
