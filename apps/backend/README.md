# Dentia Backend (NestJS)

This service provides the API for Dentia. It is based on the [notiz-dev/nestjs-prisma-starter](https://github.com/notiz-dev/nestjs-prisma-starter) conventions and uses the shared Prisma schema located in `packages/prisma`.

## Available Scripts

- `pnpm start` – start in production mode
- `pnpm start:dev` – start in watch mode with hot-reload
- `pnpm build` – compile TypeScript to JavaScript in `dist`
- `pnpm prisma:migrate` – run pending Prisma migrations via the shared package (`@kit/prisma`)

## Environment

Create an `.env` file alongside this package (see `.env.example`) with at least:

```
PORT=3333
DATABASE_URL=postgresql://user:password@host:5432/dentia
```

More Cognito/AWS configuration will be wired in once available.
