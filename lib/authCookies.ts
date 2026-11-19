/**
 * NextAuth cookie 名称与属性，前端（authConfig）和 Fastify 后端（getToken）共用，
 * 保证两边读写的是同一个 cookie。
 *
 * 生产环境使用浏览器强制的前缀：
 * - `__Secure-`：必须带 Secure 属性且只能经 HTTPS 设置，子域名/中间人无法用明文连接覆盖它
 * - `__Host-`：在 `__Secure-` 之上再要求不带 Domain 且 Path=/，同一主域下的其他子域名无法写入
 *
 * 开发环境是 http://localhost，带前缀的 cookie 会被浏览器拒收，所以只在生产环境启用。
 */
export const USE_SECURE_COOKIES = process.env.NODE_ENV === 'production';

export const SESSION_COOKIE_NAME = `${USE_SECURE_COOKIES ? '__Secure-' : ''}next-auth.session-token`;
export const CALLBACK_URL_COOKIE_NAME = `${USE_SECURE_COOKIES ? '__Secure-' : ''}next-auth.callback-url`;
export const CSRF_COOKIE_NAME = `${USE_SECURE_COOKIES ? '__Host-' : ''}next-auth.csrf-token`;
