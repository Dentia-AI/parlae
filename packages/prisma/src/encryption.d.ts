/**
 * Check if a string value is already encrypted (has the versioned prefix).
 */
export declare function isEncrypted(value: string): boolean;

/**
 * Encrypt a plaintext string using AES-256-GCM.
 */
export declare function encryptField(plaintext: string): string;

/**
 * Decrypt an encrypted field value.
 */
export declare function decryptField(encryptedValue: string): string;
