import crypto from 'crypto';

/**
 * Application-Level Field Encryption for PHI (HIPAA Compliance)
 *
 * Provides AES-256-GCM encryption for sensitive database fields such as
 * call transcripts, summaries, and notes that may contain Protected Health
 * Information (PHI).
 *
 * Encrypted values use a versioned format:
 *   enc:v1:<base64(iv)>:<base64(authTag)>:<base64(ciphertext)>
 *
 * This format:
 * - Is easily detectable (prefix-based) to distinguish encrypted vs plaintext
 * - Is version-tagged to support future key rotation or algorithm changes
 * - Uses base64 encoding for compact storage in TEXT columns
 *
 * Environment variable: ENCRYPTION_KEY (32-byte hex string = 64 hex characters)
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag
const ENCRYPTION_PREFIX = 'enc:v1:';

/**
 * Get the encryption key from the environment.
 * Returns null if not configured (encryption will be skipped).
 */
function getEncryptionKey(): Buffer | null {
  const keyHex = process.env.ENCRYPTION_KEY;

  if (!keyHex) {
    return null;
  }

  if (keyHex.length !== 64) {
    console.error(
      '[Encryption] ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
        `Got ${keyHex.length} characters. Encryption disabled.`,
    );
    return null;
  }

  return Buffer.from(keyHex, 'hex');
}

/**
 * Check if a string value is already encrypted (has the versioned prefix).
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTION_PREFIX);
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * Returns the encrypted value in the format: enc:v1:<iv>:<authTag>:<ciphertext>
 * If encryption key is not configured, returns the plaintext unchanged.
 * If the value is already encrypted, returns it unchanged.
 *
 * @param plaintext - The string to encrypt
 * @returns The encrypted string, or plaintext if encryption is unavailable
 */
export function encryptField(plaintext: string): string {
  if (!plaintext) return plaintext;

  // Don't double-encrypt
  if (isEncrypted(plaintext)) return plaintext;

  const key = getEncryptionKey();
  if (!key) return plaintext;

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

/**
 * Decrypt an encrypted field value.
 *
 * If the value doesn't have the encryption prefix (plaintext/legacy data),
 * returns it unchanged. This allows seamless migration of existing data.
 *
 * @param encryptedValue - The encrypted string (enc:v1:...) or plaintext
 * @returns The decrypted plaintext string
 */
export function decryptField(encryptedValue: string): string {
  if (!encryptedValue) return encryptedValue;

  // If not encrypted, return as-is (legacy/plaintext data)
  if (!isEncrypted(encryptedValue)) return encryptedValue;

  const key = getEncryptionKey();
  if (!key) {
    console.error(
      '[Encryption] Cannot decrypt field — ENCRYPTION_KEY is not configured.',
    );
    return encryptedValue;
  }

  try {
    // Format: enc:v1:<iv>:<authTag>:<ciphertext>
    const parts = encryptedValue.split(':');
    if (parts.length !== 5) {
      console.error('[Encryption] Malformed encrypted value — unexpected format.');
      return encryptedValue;
    }

    const [, , ivB64, authTagB64, ciphertextB64] = parts;

    const iv = Buffer.from(ivB64!, 'base64');
    const authTag = Buffer.from(authTagB64!, 'base64');
    const ciphertext = Buffer.from(ciphertextB64!, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  } catch (error) {
    console.error(
      '[Encryption] Decryption failed:',
      error instanceof Error ? error.message : error,
    );
    // Return the encrypted value rather than losing data
    return encryptedValue;
  }
}

// CallLog encryption helpers have been removed.
// Call data (transcripts, summaries) is no longer stored locally.
// All call data is fetched from Vapi API on demand.
// The generic encryptField/decryptField utilities above are kept for future use.
