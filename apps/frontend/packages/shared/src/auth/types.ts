export type SessionUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
  is_anonymous: boolean;
  aal: 'aal1' | 'aal2';
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  amr: unknown[];
};

export type JWTUserData = SessionUser;
