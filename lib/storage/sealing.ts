export const SEALED_FIELD = '__sealed';
export type SealedValue = { [SEALED_FIELD]: string };

export function isSealedValue(value: unknown): value is SealedValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)[SEALED_FIELD] === 'string'
  );
}
