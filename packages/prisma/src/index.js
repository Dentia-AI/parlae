"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decryptCallLogFields = exports.encryptCallLogFields = exports.isEncrypted = exports.decryptField = exports.encryptField = exports.prisma = void;
const client_1 = require("@prisma/client");
const encryption_1 = require("./encryption");

function createPrismaClient() {
    const client = new client_1.PrismaClient({
        log: process.env.NODE_ENV === 'development'
            ? ['query', 'error', 'warn']
            : ['error'],
    });
    // PHI Encryption Middleware (HIPAA Compliance)
    client.$use(async (params, next) => {
        if (params.model !== 'CallLog') {
            return next(params);
        }
        // Encrypt on write
        if (['create', 'update', 'upsert'].includes(params.action)) {
            if (params.args.data) {
                params.args.data = (0, encryption_1.encryptCallLogFields)(params.args.data);
            }
            if (params.action === 'upsert') {
                if (params.args.create) {
                    params.args.create = (0, encryption_1.encryptCallLogFields)(params.args.create);
                }
                if (params.args.update) {
                    params.args.update = (0, encryption_1.encryptCallLogFields)(params.args.update);
                }
            }
        }
        if (params.action === 'createMany' && params.args.data) {
            if (Array.isArray(params.args.data)) {
                params.args.data = params.args.data.map(encryption_1.encryptCallLogFields);
            }
            else {
                params.args.data = (0, encryption_1.encryptCallLogFields)(params.args.data);
            }
        }
        if (params.action === 'updateMany' && params.args.data) {
            params.args.data = (0, encryption_1.encryptCallLogFields)(params.args.data);
        }
        const result = await next(params);
        // Decrypt on read
        if (['findFirst', 'findUnique', 'create', 'update', 'upsert'].includes(params.action)) {
            if (result) {
                return (0, encryption_1.decryptCallLogFields)(result);
            }
        }
        if (params.action === 'findMany') {
            if (Array.isArray(result)) {
                return result.map(encryption_1.decryptCallLogFields);
            }
        }
        return result;
    });
    return client;
}

exports.prisma = global.__prismaClient ?? createPrismaClient();
if (process.env.NODE_ENV !== 'production') {
    global.__prismaClient = exports.prisma;
}
__exportStar(require("@prisma/client"), exports);

// Re-export encryption utilities
var encryption_2 = require("./encryption");
Object.defineProperty(exports, "encryptField", { enumerable: true, get: function () { return encryption_2.encryptField; } });
Object.defineProperty(exports, "decryptField", { enumerable: true, get: function () { return encryption_2.decryptField; } });
Object.defineProperty(exports, "isEncrypted", { enumerable: true, get: function () { return encryption_2.isEncrypted; } });
Object.defineProperty(exports, "encryptCallLogFields", { enumerable: true, get: function () { return encryption_2.encryptCallLogFields; } });
Object.defineProperty(exports, "decryptCallLogFields", { enumerable: true, get: function () { return encryption_2.decryptCallLogFields; } });
