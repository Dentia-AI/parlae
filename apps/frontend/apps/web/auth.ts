import NextAuth from 'next-auth';

export default NextAuth({
  baseURL: process.env.NEXT_PUBLIC_NEXTAUTH_URL,
  providers: [],
});
