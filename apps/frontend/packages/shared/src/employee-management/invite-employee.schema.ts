import { z } from 'zod';

export const InviteEmployeeSchema = z.object({
  email: z.string().email('Invalid email address'),
  displayName: z.string().min(2, 'Name must be at least 2 characters').optional(),
  accountIds: z.array(z.string().uuid('Invalid account ID')).min(1, 'At least one account must be selected'),
  roleName: z.enum(['admin', 'editor', 'viewer'], {
    errorMap: () => ({ message: 'Invalid role. Must be admin, editor, or viewer' }),
  }),
});

export type InviteEmployeeInput = z.infer<typeof InviteEmployeeSchema>;

export const INVITE_EMPLOYEE_ERROR_KEYS = {
  EMAIL_REQUIRED: 'employee:errors.emailRequired',
  EMAIL_INVALID: 'employee:errors.emailInvalid',
  ACCOUNTS_REQUIRED: 'employee:errors.accountsRequired',
  ROLE_INVALID: 'employee:errors.roleInvalid',
  EMPLOYEE_EXISTS: 'employee:errors.employeeExists',
  NO_PERMISSION: 'employee:errors.noPermission',
  GENERIC: 'employee:errors.generic',
} as const;

