declare module 'stripe' {
  export type Stripe = any;
  const Stripe: any;
  export default Stripe;
}

declare module 'next-auth' {
  const NextAuth: any;
  export default NextAuth;
}

declare module 'next-auth/providers/cognito' {
  const CognitoProvider: any;
  export default CognitoProvider;
}

declare module 'next-auth/providers/credentials' {
  const CredentialsProvider: any;
  export default CredentialsProvider;
}
