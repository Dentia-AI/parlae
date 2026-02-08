import { z } from 'zod';

export const SIGN_UP_ERROR_KEYS = {
  PASSWORD_LENGTH: 'auth:errors.minPasswordLength',
  PASSWORD_NUMBER: 'auth:errors.minPasswordNumbers',
  PASSWORD_SPECIAL: 'auth:errors.minPasswordSpecialChars',
  PASSWORD_UPPERCASE: 'auth:errors.uppercasePassword',
  PASSWORD_MISMATCH: 'auth:errors.passwordsDoNotMatch',
  TERMS: 'auth:errors.acceptTerms',
  GENERIC: 'auth:errors.generic',
} as const;

export const SignUpSchema = z
  .object({
    fullName: z
      .string()
      .min(2, { message: SIGN_UP_ERROR_KEYS.GENERIC })
      .max(120, { message: SIGN_UP_ERROR_KEYS.GENERIC }),
    email: z.string().email({ message: SIGN_UP_ERROR_KEYS.GENERIC }),
    password: z
      .string()
      .min(8, { message: SIGN_UP_ERROR_KEYS.PASSWORD_LENGTH })
      .regex(/\d/, { message: SIGN_UP_ERROR_KEYS.PASSWORD_NUMBER })
      .regex(/[A-Z]/, { message: SIGN_UP_ERROR_KEYS.PASSWORD_UPPERCASE }),
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, { message: SIGN_UP_ERROR_KEYS.TERMS }),
    inviteToken: z.string().optional(), // Optional invite token for employee signup
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: SIGN_UP_ERROR_KEYS.PASSWORD_MISMATCH,
        path: ['confirmPassword'],
      });
    }
  });

export type SignUpInput = z.infer<typeof SignUpSchema>;
