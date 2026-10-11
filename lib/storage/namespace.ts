export function sanitizeUserId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** Key/value store key for `baseKey`, per user (or the guest when `userId` is null). */
export function namespacedKey(prefix: string, baseKey: string, userId: string | null): string {
  if (!userId) {
    return `${prefix}_${baseKey}`;
  }
  return `${prefix}_${baseKey}_USER_${sanitizeUserId(userId)}`;
}

export function notesDbName(prefix: string, userId: string | null): string {
  const suffix = userId ? sanitizeUserId(userId) : 'GUEST';
  return `${prefix}_NOTES_DB_${suffix}`;
}
