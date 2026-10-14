import IDB from '../idb';
import { QCRuntime } from '../../qcruntime/qcnote-runtime';
import { setDeviceSessionToken } from './deviceSession';
import { STORAGE_KEY_PREFIX, notesDbName, userKeySuffix } from './namespace';

/**
 * Deletes everything this browser keeps for `userId`: the encrypted notes DB
 * (and its key metadata), every per-user key/value entry in IndexedDB and
 * localStorage (settings, sync configs, conflicts, sync bases, search caches)
 * and the device session token. Used after the account is deleted on the
 * server: with the server-held vault key gone the notes can't be decrypted
 * anyway. Guest data and other accounts on this device are left alone.
 *
 * Doesn't need NoteStorage, so the profile page can call it without loading
 * the storage layer. Each step runs even if an earlier one fails; the first
 * error is rethrown at the end.
 */
export async function purgeLocalUserData(userId: string): Promise<void> {
  const suffix = userKeySuffix(userId);
  const isUserKey = (key: string) =>
    key.startsWith(`${STORAGE_KEY_PREFIX}_`) && key.endsWith(suffix);
  const errors: unknown[] = [];
  const attempt = async (step: () => unknown) => {
    try {
      await step();
    } catch (err) {
      errors.push(err);
    }
  };

  await attempt(() => QCRuntime.drop(notesDbName(STORAGE_KEY_PREFIX, userId)));
  await attempt(async () => {
    const keys = await IDB.getAllKeys();
    for (const key of keys) {
      if (typeof key === 'string' && isUserKey(key)) await IDB.deleteItem(key);
    }
  });
  await attempt(() => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && isUserKey(key)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  });
  await attempt(() => setDeviceSessionToken(userId, null));

  if (errors.length) throw errors[0];
}
