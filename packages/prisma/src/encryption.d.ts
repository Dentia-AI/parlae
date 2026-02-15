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

/**
 * Fields on the CallLog model that contain PHI and should be encrypted.
 */
export declare const ENCRYPTED_CALL_LOG_FIELDS: readonly ['transcript', 'summary', 'callNotes'];

/**
 * Encrypt all PHI fields in a CallLog data object (for create/update).
 */
export declare function encryptCallLogFields<T extends Record<string, any>>(data: T): T;

/**
 * Decrypt all PHI fields in a CallLog result object (for reads).
 */
export declare function decryptCallLogFields<T extends Record<string, any>>(data: T): T;
