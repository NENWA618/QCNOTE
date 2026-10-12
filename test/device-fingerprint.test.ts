// Registering the first device must be one conditional write, so two devices
// signing in at once can't both be allowed while only one stays registered.
import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import type { RedisClientType } from 'redis';
import { UGCService } from '../server/ugc-service';

function setup(...rowCounts: number[]) {
  const query = vi.fn();
  for (const rowCount of rowCounts) query.mockResolvedValueOnce({ rows: [], rowCount });
  const service = new UGCService({} as unknown as RedisClientType, { query } as unknown as Pool);
  const sql = (call: number) => String(query.mock.calls[call][0]).replace(/\s+/g, ' ');
  return { service, query, sql };
}

describe('verifyDeviceFingerprint', () => {
  it('registers the first device only while none is registered', async () => {
    const { service, query, sql } = setup(1);
    await expect(service.verifyDeviceFingerprint('u1', 'fp-a')).resolves.toEqual({
      allowed: true,
      firstTime: true,
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(sql(0)).toMatch(/^UPDATE users /);
    expect(sql(0)).toContain(
      "WHERE id = $1 AND (device_fingerprints IS NULL OR device_fingerprints = '{}'::jsonb)",
    );
  });

  it('only touches lastSeen of a device that is already registered', async () => {
    const { service, query, sql } = setup(0, 1);
    await expect(service.verifyDeviceFingerprint('u1', 'fp-a')).resolves.toEqual({
      allowed: true,
      firstTime: false,
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(sql(1)).toContain("ARRAY[$2::text, 'lastSeen']");
    expect(sql(1)).toContain('WHERE id = $1 AND device_fingerprints ? $2::text');
  });

  it('rejects another device without writing anything', async () => {
    const { service, query } = setup(0, 0, 1);
    await expect(service.verifyDeviceFingerprint('u1', 'fp-b')).resolves.toEqual({
      allowed: false,
      firstTime: false,
    });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('fails for a user that does not exist instead of reporting a device mismatch', async () => {
    const { service } = setup(0, 0, 0);
    await expect(service.verifyDeviceFingerprint('missing', 'fp-a')).rejects.toThrow(
      'User not found',
    );
  });
});
