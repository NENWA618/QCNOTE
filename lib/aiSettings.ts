/**
 * AI 模型接入设置 - 本地加密存储
 *
 * 登录用户：整份设置用该用户笔记库的密钥 seal（见 NoteStorage.sealForCurrentUser），
 * 和笔记一样，拿不到服务端下发的密钥就读不出 API Key；设备未解锁时既不能读也不能存。
 * 游客：API Key 用随机生成、保存在 localStorage 的设备密钥加密（游客的笔记本身就是明文，
 * 这里只防止 Key 以原文出现在存储里）。
 *
 * 旧版本对登录用户也只用设备密钥加密，而设备密钥就放在密文旁边，等于没有保护；
 * 读到这种旧记录时会自动改存为 seal 格式。
 */
import idb from './idb';
import { isSealedValue, type NoteStorage } from './storage';

export interface AISettings {
  apiEndpoint: string;
  modelName: string;
  apiKey: string;
  updatedAt: number;
}

interface StoredAISettings {
  apiEndpoint: string;
  modelName: string;
  apiKeyEncrypted: string; // base64: salt + iv + ciphertext
  updatedAt: number;
}

const VAULT_KEY_STORAGE_KEY = 'qcnote:ai-settings:vault-key';

function getRecordKey(userId: string | null): string {
  return `qcnote:ai-settings:${userId ?? 'GUEST'}`;
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  arr.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getOrCreateVaultKeyMaterial(): string {
  if (typeof localStorage === 'undefined') {
    throw new Error('localStorage unavailable');
  }
  let material = localStorage.getItem(VAULT_KEY_STORAGE_KEY);
  if (!material) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    material = toBase64(bytes);
    localStorage.setItem(VAULT_KEY_STORAGE_KEY, material);
  }
  return material;
}

async function deriveVaultKey(): Promise<CryptoKey> {
  const material = fromBase64(getOrCreateVaultKeyMaterial());
  return crypto.subtle.importKey(
    'raw',
    material.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptApiKey(plain: string): Promise<string> {
  const key = await deriveVaultKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain),
  );
  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.byteLength);
  return toBase64(combined);
}

async function decryptApiKey(encoded: string): Promise<string> {
  const key = await deriveVaultKey();
  const combined = fromBase64(encoded);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

/** The storage must already be switched to `userId` (setCurrentUser). */
function assertStorageUser(storage: NoteStorage, userId: string | null): void {
  if (storage.currentUserId !== userId) {
    throw new Error('aiSettings: storage is not switched to this user');
  }
}

/**
 * Throws NoteStorageError('locked') if a signed-in user's device is locked,
 * so the UI can tell "locked" apart from "nothing saved".
 */
export async function getAISettings(
  userId: string | null,
  storage: NoteStorage,
): Promise<AISettings | null> {
  assertStorageUser(storage, userId);
  const stored = await idb.getItem<unknown>(getRecordKey(userId));
  if (!stored) return null;
  if (isSealedValue(stored)) {
    return storage.unsealForCurrentUser<AISettings>(stored);
  }

  const legacy = stored as StoredAISettings;
  let apiKey = '';
  try {
    apiKey = legacy.apiKeyEncrypted ? await decryptApiKey(legacy.apiKeyEncrypted) : '';
  } catch (e) {
    console.warn('[aiSettings] failed to decrypt API key', e);
  }
  const settings: AISettings = {
    apiEndpoint: legacy.apiEndpoint,
    modelName: legacy.modelName,
    apiKey,
    updatedAt: legacy.updatedAt,
  };
  if (userId) {
    // device-key encryption isn't real protection for a signed-in user
    await writeAISettings(userId, settings, storage).catch((e) => {
      console.warn('[aiSettings] failed to migrate settings to sealed storage', e);
    });
  }
  return settings;
}

async function writeAISettings(
  userId: string | null,
  settings: AISettings,
  storage: NoteStorage,
): Promise<void> {
  const record = userId
    ? await storage.sealForCurrentUser(settings)
    : ({
        apiEndpoint: settings.apiEndpoint,
        modelName: settings.modelName,
        apiKeyEncrypted: settings.apiKey ? await encryptApiKey(settings.apiKey) : '',
        updatedAt: settings.updatedAt,
      } satisfies StoredAISettings);
  await idb.setItem(getRecordKey(userId), record);
}

/** False if the settings couldn't be saved (check storage.notesDbLocked for why). */
export async function saveAISettings(
  userId: string | null,
  settings: { apiEndpoint: string; modelName: string; apiKey: string },
  storage: NoteStorage,
): Promise<boolean> {
  try {
    assertStorageUser(storage, userId);
    await writeAISettings(userId, { ...settings, updatedAt: Date.now() }, storage);
    return true;
  } catch (e) {
    console.warn('[aiSettings] saveAISettings failed', e);
    return false;
  }
}

export async function clearAISettings(userId: string | null): Promise<void> {
  try {
    await idb.deleteItem(getRecordKey(userId));
  } catch (e) {
    console.warn('[aiSettings] clearAISettings failed', e);
  }
}
