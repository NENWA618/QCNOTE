export function clampLimit(value: unknown, fallback = 50, max = 100): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

export function isHttpUrl(value: unknown, maxLength = 2048): value is string {
  if (typeof value !== 'string' || value.length > maxLength) return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function getUtc8DayString(date: Date = new Date()): string {
  const utc8Ms = date.getTime() + (date.getTimezoneOffset() + 480) * 60000;
  return new Date(utc8Ms).toISOString().slice(0, 10);
}

export function getNextUtc8Midnight(date: Date = new Date()): Date {
  const day = getUtc8DayString(date);
  const midnight = new Date(`${day}T00:00:00+08:00`);
  midnight.setTime(midnight.getTime() + 24 * 60 * 60 * 1000);
  return midnight;
}
