/**
 * Web Push 订阅端点校验。刻意不依赖 pg / web-push 等服务端包，
 * 这样前端的单元测试（CI 只安装根目录依赖）也能直接导入。
 */
// 只允许浏览器厂商的官方推送服务，避免订阅端点被用来让服务器请求任意（含内网）地址。
const ALLOWED_PUSH_HOST_SUFFIXES = [
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'notify.windows.com',
  'push.apple.com',
];

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    const host = url.hostname.toLowerCase();
    return ALLOWED_PUSH_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}
