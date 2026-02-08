import { z } from 'zod';

export const SIGN_IN_ERROR_KEYS = {
  GENERIC: 'auth:errors.Invalid login credentials',
} as const;

export const SignInSchema = z.object({
  email: z.string().email({ message: 'auth:errors.Invalid login credentials' }),
  password: z.string().min(1, { message: 'auth:errors.Invalid login credentials' }),
});

export type SignInInput = z.infer<typeof SignInSchema>;
