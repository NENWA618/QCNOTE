#!/usr/bin/env node

/**
 * Check Inline Scripts
 *
 * 用途: 构建后检查预渲染 HTML 里有没有会被生产 CSP 拦截的内联 <script>
 * 用法: npm run build && node scripts/check-inline-scripts.mjs
 *
 * 生产 CSP 的 script-src 没有 'unsafe-inline'、nonce 或 hash，任何可执行的内联脚本都会被浏览器拦截。
 * Next 16.4 的 turbopackSharedRuntime 就曾这样把启动代码内联进 HTML，导致页面卡在加载界面
 * （见 next.config.mjs 里的说明）。JSON / JSON-LD 这类数据块不会执行，CSP 不管，不算违规。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.join(__dirname, '..', '.next', 'server');

// 浏览器会当作脚本执行的 type；其余（application/json、application/ld+json 等）只是数据
const EXECUTABLE_TYPES = new Set([
  '',
  'module',
  'text/javascript',
  'application/javascript',
  'text/ecmascript',
  'application/ecmascript',
]);

function findHtmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findHtmlFiles(full);
    return entry.name.endsWith('.html') ? [full] : [];
  });
}

const files = ['pages', 'app'].flatMap((sub) => findHtmlFiles(path.join(SERVER_DIR, sub)));
if (files.length === 0) {
  console.error('❌ 没找到预渲染的 HTML，先运行 npm run build');
  process.exit(1);
}

const scriptTag = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const violations = [];

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  for (const [, attrs, body] of html.matchAll(scriptTag)) {
    if (/\bsrc\s*=/i.test(attrs) || body.trim() === '') continue;
    const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]*)/i)?.[1] ?? '').toLowerCase();
    if (!EXECUTABLE_TYPES.has(type)) continue;
    violations.push({ file: path.relative(SERVER_DIR, file), snippet: body.trim().slice(0, 120) });
  }
}

if (violations.length > 0) {
  console.error(`❌ ${violations.length} 个内联脚本会被生产 CSP 拦截：`);
  for (const { file, snippet } of violations) console.error(`  ${file}: ${snippet}`);
  process.exit(1);
}

console.log(`✅ ${files.length} 个预渲染页面里没有会被 CSP 拦截的内联脚本`);
