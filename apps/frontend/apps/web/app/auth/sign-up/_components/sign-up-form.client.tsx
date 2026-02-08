'use client';

import { useMemo, useState, useTransition } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { Checkbox } from '@kit/ui/checkbox';
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

import { ApiErrorHandler } from '~/lib/api-error-handler';
import { PasswordInput } from '~/components/ui/password-input';
import { SignUpSchema, SIGN_UP_ERROR_KEYS, type SignUpInput } from '../_lib/sign-up.schema';
import { VerifyEmailForm } from './verify-email-form';

type SignUpFormStatus =
  | { state: 'idle' }
  | { state: 'submitting' }
  | {
      state: 'success';
      email: string;
      username: string;
      password: string;
      requiresConfirmation: boolean;
    };

function translateMessage(t: (key: string) => string, message?: string) {
  if (!message) {
    return '';
  }

  if (message.includes(':')) {
    return t(message);
  }

  return message;
}

type SignUpFormProps = {
  callbackUrl?: string;
};

export function SignUpForm({ callbackUrl }: SignUpFormProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SignUpFormStatus>({ state: 'idle' });
  const [pending, startTransition] = useTransition();

  const form = useForm<SignUpInput>({
    resolver: zodResolver(SignUpSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
      acceptTerms: false,
    },
  });

  const rootError = form.formState.errors.root?.message;

  const submitLabel = useMemo(() => {
    if (pending || status.state === 'submitting') {
      return t('auth:signingUp');
    }

    return t('auth:signUpWithEmail');
  }, [pending, status.state, t]);

  if (status.state === 'success') {
    if (status.requiresConfirmation) {
      return (
        <VerifyEmailForm
          email={status.email}
          username={status.username}
          password={status.password}
          callbackUrl={callbackUrl}
        />
      );
    }

    // If no confirmation required and callbackUrl is provided, redirect immediately
    if (callbackUrl) {
      // Redirect to the provided URL (typically hub OAuth URL)
      window.location.href = callbackUrl;
      return null;
    }

    return (
      <Alert variant="success">
        <AlertTitle>
          <Trans i18nKey="auth:accountCreated" defaults="Account created!" />
        </AlertTitle>

        <AlertDescription>
          <Trans
            i18nKey="auth:accountCreatedBody"
            defaults="Your account has been created. You can now sign in."
          />
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Form {...form}>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => {
          setStatus({ state: 'submitting' });
          form.clearErrors('root');

          startTransition(async () => {
            try {
              const response = await fetch('/api/auth/sign-up', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(values),
              });

              const payload = await response.json();

              if (!response.ok) {
                // Log the error with comprehensive details
                await ApiErrorHandler.handleError(response.clone(), {
                  endpoint: '/api/auth/sign-up',
                  method: 'POST',
                  body: values,
                });

                if (payload?.errors?.fieldErrors) {
                  const fieldErrors = payload.errors.fieldErrors as Record<string, string[]>;

                  Object.entries(fieldErrors).forEach(([field, messages]) => {
                    if (messages?.length) {
                      form.setError(field as keyof SignUpInput, {
                        message: translateMessage(t, messages[0]),
                      });
                    }
                  });
                } else if (payload?.error) {
                  const message = translateMessage(t, payload.error.message);
                  const field = payload.error.field as keyof SignUpInput | undefined;

                  if (field) {
                    form.setError(field, { message });
                  } else {
                    form.setError('root', { message });
                  }
                } else {
                  form.setError('root', { message: t(SIGN_UP_ERROR_KEYS.GENERIC) });
                }

                setStatus({ state: 'idle' });
                return;
              }

              setStatus({
                state: 'success',
                email: values.email,
                username: payload.username || values.email,
                password: values.password,
                requiresConfirmation: Boolean(payload.requiresConfirmation ?? true),
              });
            } catch (error) {
              // Log the exception with comprehensive details
              await ApiErrorHandler.handleError(error, {
                endpoint: '/api/auth/sign-up',
                method: 'POST',
                body: values,
              });
              
              form.setError('root', { message: t(SIGN_UP_ERROR_KEYS.GENERIC) });
              setStatus({ state: 'idle' });
            }
          });
        })}
      >
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <Trans i18nKey="auth:fullNameLabel" defaults="Full name" />
              </FormLabel>
              <FormControl>
                <Input
                  autoComplete="name"
                  placeholder={t('auth:fullNamePlaceholder', { defaultValue: 'Alex Smith' })}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <Trans i18nKey="common:emailAddress" defaults="Email address" />
              </FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder={t('auth:emailPlaceholder', { defaultValue: 'you@example.com' })}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <Trans i18nKey="common:password" defaults="Password" />
                </FormLabel>
                <FormControl>
                  <PasswordInput
                    autoComplete="new-password"
                    placeholder="••••••••"
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      // Trigger validation on confirmPassword field when password changes
                      // This ensures the "passwords don't match" error updates in real-time
                      if (form.getValues('confirmPassword')) {
                        form.trigger('confirmPassword');
                      }
                    }}
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  <Trans
                    i18nKey="auth:passwordHint"
                    defaults="Ensure it's at least 8 characters with a mix of numbers and symbols."
                  />
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <Trans i18nKey="auth:repeatPassword" defaults="Repeat password" />
                </FormLabel>
                <FormControl>
                  <PasswordInput
                    autoComplete="new-password"
                    placeholder="••••••••"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="acceptTerms"
          render={({ field }) => (
            <FormItem className="flex items-start gap-3 space-y-0 rounded-md border border-border/60 p-4">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                />
              </FormControl>

              <div className="space-y-1">
                <FormLabel className="text-sm font-normal leading-relaxed text-muted-foreground">
                  <Trans
                    i18nKey="auth:acceptTermsAndConditions"
                    components={{
                      TermsOfServiceLink: (
                        <a href="/terms-of-service" className="font-medium text-primary underline" target="_blank" rel="noreferrer">
                          {t('auth:termsOfService', { defaultValue: 'Terms of Service' })}
                        </a>
                      ),
                      PrivacyPolicyLink: (
                        <a href="/privacy-policy" className="font-medium text-primary underline" target="_blank" rel="noreferrer">
                          {t('auth:privacyPolicy', { defaultValue: 'Privacy Policy' })}
                        </a>
                      ),
                    }}
                  />
                </FormLabel>

                <FormMessage />
              </div>
            </FormItem>
          )}
        />

        {rootError ? (
          <Alert variant="destructive">
            <AlertTitle>
              <Trans i18nKey="auth:authenticationErrorAlertHeading" defaults="Authentication Error" />
            </AlertTitle>
            <AlertDescription>{translateMessage(t, rootError)}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" className="w-full" disabled={pending}>
          {submitLabel}
        </Button>
      </form>
    </Form>
  );
}
