/**
 * Digital Asset Links（/.well-known/assetlinks.json）：Android 靠它确认 TWA 包和站点属于同一主人，
 * 验证通过后 TWA 才会全屏显示，否则顶部会多出一条浏览器地址栏。
 *
 * 指纹放在环境变量里而不是写死在 public/：上架 Google Play 后真正给用户装的包由 Play App Signing
 * 重新签名，指纹要等 Play Console 生成后才知道，改环境变量重新部署即可，不用改代码。
 */

export const DEFAULT_TWA_PACKAGE_NAME = 'com.qcnote.app';

// keytool 输出的格式：32 个字节，十六进制大写，冒号分隔
const FINGERPRINT_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function parseFingerprints(raw: string | undefined): string[] {
  if (!raw) return [];
  const fingerprints = raw
    .split(/[\s,]+/)
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);
  const invalid = fingerprints.filter((f) => !FINGERPRINT_RE.test(f));
  if (invalid.length > 0) {
    // 格式错的指纹 Android 不会报错，只会静默验证失败；直接抛出让部署时就发现
    throw new Error(`Invalid SHA-256 certificate fingerprint(s): ${invalid.join(', ')}`);
  }
  return [...new Set(fingerprints)];
}

export function buildAssetLinks(packageName: string, fingerprints: string[]) {
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}
