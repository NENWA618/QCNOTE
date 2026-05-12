/**
 * Encryption Module
 * Handles text encryption and decryption for sensitive data
 */
import logger from '../logger';
import { safeAsync } from '../errorHandler';

const ENCRYPTION_ALGORITHM = 'AES-GCM';
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 250000;

/**
 * Convert ArrayBuffer to Base64 string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Derive encryption key from passphrase using PBKDF2
 */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: ENCRYPTION_ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt text with a passphrase
 * Returns format: base64(salt + iv + ciphertext)
 */
export async function encryptText(plainText: string, passphrase: string): Promise<string> {
  try {
    const encoder = new TextEncoding();
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const key = await deriveKey(passphrase, salt);

    const encrypted = await crypto.subtle.encrypt(
      { name: ENCRYPTION_ALGORITHM, iv },
      key,
      encoder.encode(plainText)
    );

    // Combine salt + iv + ciphertext
    const combined = new Uint8Array(salt.byteLength + iv.byteLength + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.byteLength);
    combined.set(new Uint8Array(encrypted), salt.byteLength + iv.byteLength);

    return arrayBufferToBase64(combined.buffer);
  } catch (error) {
    logger.error('[Encryption] Failed to encrypt text', { error });
    throw error;
  }
}

/**
 * Decrypt text with a passphrase
 * Expects format: base64(salt + iv + ciphertext)
 */
export async function decryptText(encryptedBase64: string, passphrase: string): Promise<string> {
  try {
    const decoder = new TextDecoder();
    const combined = new Uint8Array(base64ToArrayBuffer(encryptedBase64));

    // Extract salt, iv, and ciphertext
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

    const key = await deriveKey(passphrase, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: ENCRYPTION_ALGORITHM, iv },
      key,
      ciphertext
    );

    return decoder.decode(decrypted);
  } catch (error) {
    logger.error('[Encryption] Failed to decrypt text', { error });
    throw error;
  }
}

/**
 * Safely encrypt with fallback
 */
export async function safeEncrypt(
  plainText: string,
  passphrase: string,
  fallback: string = plainText
): Promise<string> {
  return safeAsync(
    () => encryptText(plainText, passphrase),
    fallback,
    '[Encryption] Safe encrypt failed'
  );
}

/**
 * Safely decrypt with fallback
 */
export async function safeDecrypt(
  encryptedBase64: string,
  passphrase: string,
  fallback: string = encryptedBase64
): Promise<string> {
  return safeAsync(
    () => decryptText(encryptedBase64, passphrase),
    fallback,
    '[Encryption] Safe decrypt failed'
  );
}

export default {
  encryptText,
  decryptText,
  safeEncrypt,
  safeDecrypt,
  arrayBufferToBase64,
  base64ToArrayBuffer,
};
