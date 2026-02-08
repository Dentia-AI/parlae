'use client';

import { useState, useTransition } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

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

import { PasswordInput } from '~/components/ui/password-input';
import { SignInSchema, type SignInInput, SIGN_IN_ERROR_KEYS } from '../_lib/sign-in.schema';

type SignInFormProps = {
  callbackUrl: string;
};

export function SignInForm({ callbackUrl }: SignInFormProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm<SignInInput>({
    resolver: zodResolver(SignInSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  return (
    <Form {...form}>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => {
          setErrorMessage(null);

          startTransition(async () => {
            const result = await signIn('credentials', {
              email: values.email,
              password: values.password,
              redirect: false,
              callbackUrl,
            });

            if (result?.error) {
              setErrorMessage(t(SIGN_IN_ERROR_KEYS.GENERIC));
              return;
            }

            const destination = result?.url ?? callbackUrl;
            router.push(destination);
          });
        })}
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <Trans i18nKey="common:emailAddress" defaults="Email address" />
              </FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" placeholder="you@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <Trans i18nKey="common:password" defaults="Password" />
              </FormLabel>
              <FormControl>
                <PasswordInput autoComplete="current-password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {errorMessage ? (
          <Alert variant="destructive">
            <AlertTitle>
              <Trans i18nKey="auth:authenticationErrorAlertHeading" defaults="Authentication Error" />
            </AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t('auth:signingIn', { defaultValue: 'Signing in...' }) : t('auth:signInWithEmail', { defaultValue: 'Sign in with email' })}
        </Button>
      </form>
    </Form>
  );
}
