import { PrismaClient } from '@prisma/client';
declare global {
    var __prismaClient: PrismaClient | undefined;
}
export declare const prisma: any;
export * from '@prisma/client';
