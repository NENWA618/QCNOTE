/** Prefix of every key/value store key and notes DB name NoteStorage writes. */
export const STORAGE_KEY_PREFIX = 'QCNOTE';

export function sanitizeUserId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** Key/value store key for `baseKey`, per user (or the guest when `userId` is null). */
export function namespacedKey(prefix: string, baseKey: string, userId: string | null): string {
  if (!userId) {
    return `${prefix}_${baseKey}`;
  }
  return `${prefix}_${baseKey}${userKeySuffix(userId)}`;
}

export function notesDbName(prefix: string, userId: string | null): string {
  const suffix = userId ? sanitizeUserId(userId) : 'GUEST';
  return `${prefix}_NOTES_DB_${suffix}`;
}

/** Suffix shared by every key/value store key namespacedKey gives `userId`. */
export function userKeySuffix(userId: string): string {
  return `_USER_${sanitizeUserId(userId)}`;
}
