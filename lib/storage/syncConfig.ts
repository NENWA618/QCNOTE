import {
  ONEDRIVE_VAULT_KEY_STORAGE_KEY,
  WEBDAV_VAULT_KEY_STORAGE_KEY,
  decryptConfigSecret,
  encryptConfigSecret,
} from './crypto';
import type { KeyValueStore } from './keyValueStore';
import type { SealedValue } from './sealing';
import type { OneDriveConfig, WebDAVConfig } from './types';

/** Which fields of a sync config are secret, and the key a guest's are encrypted with. */
export interface SyncConfigSpec<T> {
  secretFields: (keyof T & string)[];
  vaultKeyStorageKey: string;
}

export const WEBDAV_CONFIG_SPEC: SyncConfigSpec<WebDAVConfig> = {
  secretFields: ['password', 'encryptionKey'],
  vaultKeyStorageKey: WEBDAV_VAULT_KEY_STORAGE_KEY,
};

export const ONEDRIVE_CONFIG_SPEC: SyncConfigSpec<OneDriveConfig> = {
  secretFields: ['accessToken', 'encryptionKey'],
  vaultKeyStorageKey: ONEDRIVE_VAULT_KEY_STORAGE_KEY,
};

/** Where sync configs live, and how the current user's are sealed. */
export interface SyncConfigStore {
  kv: KeyValueStore;
  signedIn: boolean;
  seal<T>(value: T): Promise<T | SealedValue>;
  unseal<T>(stored: unknown): Promise<T | null>;
}

/**
 * Reads a sync config. A signed-in user's config is sealed as a whole; a
 * guest's has its secret fields encrypted with the per-device key. Throws if
 * a secret no longer decrypts (e.g. the device key is gone): never fall
 * through with the ciphertext as the secret, or it would be sent as the
 * password or used as the sync encryption key.
 */
export async function readSyncConfig<T extends object>(
  store: SyncConfigStore,
  key: string,
  spec: SyncConfigSpec<T>,
): Promise<T | null> {
  const stored = await store.kv.readKeyValue(key);
  if (!stored) return null;
  if (store.signedIn) return store.unseal<T>(stored);
  return decryptGuestSecrets(stored as Record<string, unknown>, spec);
}

async function decryptGuestSecrets<T extends object>(
  stored: Record<string, unknown>,
  spec: SyncConfigSpec<T>,
): Promise<T> {
  const config = { ...stored };
  for (const field of spec.secretFields) {
    const value = config[field];
    if (typeof value !== 'string' || !value.startsWith('encrypted:')) continue;
    config[field] = await decryptConfigSecret(value, spec.vaultKeyStorageKey);
  }
  return config as T;
}

export async function writeSyncConfig<T extends object>(
  store: SyncConfigStore,
  key: string,
  config: T,
  spec: SyncConfigSpec<T>,
): Promise<void> {
  let toStore: unknown;
  if (store.signedIn) {
    // Throws while the device is locked rather than falling back to a
    // weaker encryption.
    toStore = await store.seal(config);
  } else {
    const fields = { ...config } as Record<string, unknown>;
    for (const field of spec.secretFields) {
      const value = fields[field];
      if (typeof value !== 'string' || !value || value.startsWith('encrypted:')) continue;
      try {
        fields[field] = await encryptConfigSecret(value, spec.vaultKeyStorageKey);
      } catch (e) {
        console.warn(`[NoteStorage] Failed to encrypt config field ${field}, storing plaintext`, e);
      }
    }
    toStore = fields;
  }
  await store.kv.writeKeyValue(key, toStore);
}

/**
 * Reads a guest's sync config with its secrets decrypted with the device
 * key. Throws if one no longer decrypts: the caller must never save
 * ciphertext as the secret.
 */
export async function readGuestSyncConfig<T extends object>(
  kv: KeyValueStore,
  key: string,
  spec: SyncConfigSpec<T>,
): Promise<T | null> {
  const stored = await kv.readFromEitherStore<Record<string, unknown>>(key);
  if (!stored) return null;
  return decryptGuestSecrets(stored, spec);
}
