/**
 * AI 模型接入设置 - 本地加密存储
 *
 * 与 storage.ts 里笔记数据的 AES-GCM 字段加密思路一致，但不依赖设备会话
 * 握手（那套机制目前只在 dashboard 页面初始化），确保用户从任意页面进入
 * /models 都能直接保存设置。加密密钥是随机生成、仅保存在本地 localStorage
 * 的设备密钥，不经过网络，也不依赖登录态。
 */
import idb from './idb';

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

export async function getAISettings(userId: string | null): Promise<AISettings | null> {
  try {
    const stored = await idb.getItem<StoredAISettings>(getRecordKey(userId));
    if (!stored) return null;
    const apiKey = stored.apiKeyEncrypted ? await decryptApiKey(stored.apiKeyEncrypted) : '';
    return {
      apiEndpoint: stored.apiEndpoint,
      modelName: stored.modelName,
      apiKey,
      updatedAt: stored.updatedAt,
    };
  } catch (e) {
    console.warn('[aiSettings] getAISettings failed', e);
    return null;
  }
}

export async function saveAISettings(
  userId: string | null,
  settings: { apiEndpoint: string; modelName: string; apiKey: string },
): Promise<boolean> {
  try {
    const apiKeyEncrypted = settings.apiKey ? await encryptApiKey(settings.apiKey) : '';
    const record: StoredAISettings = {
      apiEndpoint: settings.apiEndpoint,
      modelName: settings.modelName,
      apiKeyEncrypted,
      updatedAt: Date.now(),
    };
    await idb.setItem(getRecordKey(userId), record);
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
