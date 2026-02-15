import { PrismaClient } from '@prisma/client';
declare global {
    var __prismaClient: PrismaClient | undefined;
}
export declare const prisma: PrismaClient;
export * from '@prisma/client';
export { encryptField, decryptField, isEncrypted, encryptCallLogFields, decryptCallLogFields, } from './encryption';
