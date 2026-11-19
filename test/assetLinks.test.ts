import { describe, it, expect } from 'vitest';
import { buildAssetLinks, parseFingerprints } from '../lib/assetLinks';

const FP_A = Array.from({ length: 32 }, (_, i) =>
  i.toString(16).padStart(2, '0').toUpperCase(),
).join(':');
const FP_B = Array(32).fill('AB').join(':');

describe('TWA asset links', () => {
  it('returns no fingerprints when the variable is unset or empty', () => {
    expect(parseFingerprints(undefined)).toEqual([]);
    expect(parseFingerprints('  ')).toEqual([]);
  });

  it('accepts comma or whitespace separated fingerprints, normalises case and dedupes', () => {
    expect(parseFingerprints(`${FP_A.toLowerCase()}, ${FP_B}\n${FP_A}`)).toEqual([FP_A, FP_B]);
  });

  it('rejects malformed fingerprints instead of serving a file Android silently ignores', () => {
    expect(() => parseFingerprints('AB:CD')).toThrow(/Invalid/);
    // SHA-1 指纹（20 字节）是常见的误填
    expect(() => parseFingerprints(Array(20).fill('AB').join(':'))).toThrow(/Invalid/);
  });

  it('builds the handle_all_urls statement for the package', () => {
    expect(buildAssetLinks('com.qcnote.app', [FP_A])).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.qcnote.app',
          sha256_cert_fingerprints: [FP_A],
        },
      },
    ]);
  });
});
