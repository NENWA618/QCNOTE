import { useCallback, useSyncExternalStore } from 'react';

const CHANGE_EVENT = 'qcnote:local-storage-flag';

/**
 * A boolean preference backed by localStorage. Reads `false` during SSR and the
 * first hydration pass, then the stored value; stays in sync across tabs and
 * between components in the same tab.
 */
export function useLocalStorageFlag(key: string): [boolean, (value: boolean) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key === key || event.key === null) onChange();
      };
      window.addEventListener('storage', onStorage);
      window.addEventListener(CHANGE_EVENT, onChange);
      return () => {
        window.removeEventListener('storage', onStorage);
        window.removeEventListener(CHANGE_EVENT, onChange);
      };
    },
    [key],
  );

  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(key) === 'true';
    } catch {
      return false;
    }
  }, [key]);

  const value = useSyncExternalStore(subscribe, getSnapshot, () => false);

  const setValue = useCallback(
    (next: boolean) => {
      try {
        localStorage.setItem(key, String(next));
      } catch {
        // storage unavailable (private mode / quota): the toggle just won't persist
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [key],
  );

  return [value, setValue];
}
