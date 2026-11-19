// Stateless text-encryption helpers used by NoteStorage: PBKDF2 + AES-GCM
// for notes/sync payloads, and the per-device vault key used to protect
// WebDAV/OneDrive secrets at rest.

// localStorage keys holding a random, per-device key used to encrypt
// WebDAV/OneDrive secrets at rest. The key is generated locally and never
// checked into source control.
export const WEBDAV_VAULT_KEY_STORAGE_KEY = 'qcnote:webdav:device-vault-key';
export const ONEDRIVE_VAULT_KEY_STORAGE_KEY = 'qcnote:onedrive:device-vault-key';

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const saltBuffer = salt.buffer.slice(
    salt.byteOffset,
    salt.byteOffset + salt.byteLength,
  ) as ArrayBuffer;
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBuffer, iterations: 250000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptText(plain: string, passphrase: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plain),
  );
  // format: salt + iv + ciphertext
  const combined = new Uint8Array(salt.byteLength + iv.byteLength + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.byteLength);
  combined.set(new Uint8Array(encrypted), salt.byteLength + iv.byteLength);
  return arrayBufferToBase64(combined.buffer);
}

export async function decryptText(encryptedBase64: string, passphrase: string): Promise<string> {
  const decoder = new TextDecoder();
  const combined = new Uint8Array(base64ToArrayBuffer(encryptedBase64));
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const ciphertext = combined.slice(28);
  const key = await deriveKey(passphrase, salt);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return decoder.decode(decrypted);
}

/**
 * Returns the random, device-local key material used to encrypt
 * WebDAV/OneDrive secrets at rest, generating and persisting one on
 * first use. The key never leaves the device and isn't recoverable from
 * the source or bundle.
 *
 * It lives in the same origin's storage as the ciphertext, so it only
 * keeps the secrets out of plain sight (exports, casual inspection of
 * storage). Anything that can run script on this origin or read the
 * browser profile can read both and decrypt.
 */
export function getOrCreateDeviceVaultKeyMaterial(storageKey: string): string {
  if (typeof localStorage === 'undefined') {
    throw new Error('localStorage unavailable for device vault key');
  }
  let material = localStorage.getItem(storageKey);
  if (!material) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    material = arrayBufferToBase64(bytes.buffer);
    localStorage.setItem(storageKey, material);
  }
  return material;
}

/** Decrypts a value stored as `encrypted:<payload>` with the per-device vault key. */
export async function decryptConfigSecret(
  value: string,
  vaultKeyStorageKey: string,
): Promise<string> {
  const deviceKeyMaterial = getOrCreateDeviceVaultKeyMaterial(vaultKeyStorageKey);
  return decryptText(value.slice('encrypted:'.length), deviceKeyMaterial);
}

export async function encryptConfigSecret(
  plain: string,
  vaultKeyStorageKey: string,
): Promise<string> {
  const deviceKeyMaterial = getOrCreateDeviceVaultKeyMaterial(vaultKeyStorageKey);
  return `encrypted:${await encryptText(plain, deviceKeyMaterial)}`;
}
