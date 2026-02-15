"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decryptCallLogFields = exports.encryptCallLogFields = exports.ENCRYPTED_CALL_LOG_FIELDS = exports.decryptField = exports.encryptField = exports.isEncrypted = void 0;

const crypto = require("crypto");

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTION_PREFIX = 'enc:v1:';

function getEncryptionKey() {
    const keyHex = process.env.ENCRYPTION_KEY;
    if (!keyHex) {
        return null;
    }
    if (keyHex.length !== 64) {
        console.error('[Encryption] ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
            `Got ${keyHex.length} characters. Encryption disabled.`);
        return null;
    }
    return Buffer.from(keyHex, 'hex');
}

function isEncrypted(value) {
    return value.startsWith(ENCRYPTION_PREFIX);
}
exports.isEncrypted = isEncrypted;

function encryptField(plaintext) {
    if (!plaintext)
        return plaintext;
    if (isEncrypted(plaintext))
        return plaintext;
    const key = getEncryptionKey();
    if (!key)
        return plaintext;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [
        'enc:v1',
        iv.toString('base64'),
        authTag.toString('base64'),
        encrypted.toString('base64'),
    ].join(':');
}
exports.encryptField = encryptField;

function decryptField(encryptedValue) {
    if (!encryptedValue)
        return encryptedValue;
    if (!isEncrypted(encryptedValue))
        return encryptedValue;
    const key = getEncryptionKey();
    if (!key) {
        console.error('[Encryption] Cannot decrypt field — ENCRYPTION_KEY is not configured.');
        return encryptedValue;
    }
    try {
        const parts = encryptedValue.split(':');
        if (parts.length !== 5) {
            console.error('[Encryption] Malformed encrypted value — unexpected format.');
            return encryptedValue;
        }
        const [, , ivB64, authTagB64, ciphertextB64] = parts;
        const iv = Buffer.from(ivB64, 'base64');
        const authTag = Buffer.from(authTagB64, 'base64');
        const ciphertext = Buffer.from(ciphertextB64, 'base64');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(ciphertext);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString('utf8');
    }
    catch (error) {
        console.error('[Encryption] Decryption failed:', error instanceof Error ? error.message : error);
        return encryptedValue;
    }
}
exports.decryptField = decryptField;

const ENCRYPTED_CALL_LOG_FIELDS = ['transcript', 'summary', 'callNotes'];
exports.ENCRYPTED_CALL_LOG_FIELDS = ENCRYPTED_CALL_LOG_FIELDS;

function encryptCallLogFields(data) {
    const result = { ...data };
    for (const field of ENCRYPTED_CALL_LOG_FIELDS) {
        if (field in result && result[field] != null && typeof result[field] === 'string') {
            result[field] = encryptField(result[field]);
        }
    }
    return result;
}
exports.encryptCallLogFields = encryptCallLogFields;

function decryptCallLogFields(data) {
    if (!data)
        return data;
    const result = { ...data };
    for (const field of ENCRYPTED_CALL_LOG_FIELDS) {
        if (field in result && result[field] != null && typeof result[field] === 'string') {
            result[field] = decryptField(result[field]);
        }
    }
    return result;
}
exports.decryptCallLogFields = decryptCallLogFields;
