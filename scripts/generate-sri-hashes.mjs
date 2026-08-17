#!/usr/bin/env node

/**
 * SRI Hash Generator Script
 * 
 * 用途: 自动生成外部脚本的 SHA-384 SRI 哈希值
 * 用法: node scripts/generate-sri-hashes.mjs
 * 
 * 这个脚本会:
 * 1. 读取所有配置的脚本文件
 * 2. 计算每个文件的 SHA-384 哈希值
 * 3. 生成 TypeScript 代码片段供复制到 pages/_app.tsx
 * 4. 保存结果到 .script-hashes.json 供参考
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPTS = [
  'public/js/jquery.min.js',
  'public/js/jquery-ui.min.js',
  'public/js/live2d.min.js',
  'public/js/waifu-tips.min.js',
  'public/js/waifu.js',
];

const PROJECT_ROOT = path.join(__dirname, '..');

function generateSRIHashes() {
  console.log('🔐 生成 SRI 哈希值...\n');

  const hashes = {};
  const tsCode = [];

  tsCode.push('const LIVE2D_SCRIPTS: { src: string; integrity?: string; async?: boolean }[] = [');

  SCRIPTS.forEach((file) => {
    const fullPath = path.join(PROJECT_ROOT, file);

    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️  文件未找到: ${file}`);
      return;
    }

    const content = fs.readFileSync(fullPath);
    const hash = crypto.createHash('sha384').update(content).digest('base64');
    const sriHash = `sha384-${hash}`;

    hashes[file] = sriHash;

    console.log(`✓ ${path.basename(file)}`);
    console.log(`  Size: ${(content.length / 1024).toFixed(2)} KB`);
    console.log(`  Hash: ${sriHash}\n`);

    // Generate TypeScript code
    tsCode.push(`  {`);
    tsCode.push(`    src: '/${file}',`);
    tsCode.push(`    integrity: '${sriHash}',`);
    tsCode.push(`  },`);
  });

  tsCode.push('];');

  // Save to JSON file
  const hashesPath = path.join(PROJECT_ROOT, '.script-hashes.json');
  fs.writeFileSync(hashesPath, JSON.stringify(hashes, null, 2));
  console.log(`✅ 哈希值已保存到: ${hashesPath}`);

  // Output TypeScript code
  console.log('\n📝 复制以下代码到 pages/_app.tsx:\n');
  console.log('─'.repeat(60));
  console.log(tsCode.join('\n'));
  console.log('─'.repeat(60));

  console.log('\n💡 提示:');
  console.log('1. 复制上面的代码到 pages/_app.tsx 中的 LIVE2D_SCRIPTS 变量');
  console.log('2. 替换 pages/_app.tsx 第 28-54 行的代码');
  console.log('3. 脚本更新时，重新运行此脚本生成新的哈希值');
  console.log('4. 更新后需要重新部署应用');
}

// Main execution
try {
  generateSRIHashes();
  process.exit(0);
} catch (error) {
  console.error('❌ 错误:', error.message);
  process.exit(1);
}
