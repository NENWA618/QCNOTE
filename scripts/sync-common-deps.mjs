#!/usr/bin/env node

/**
 * Sync Common Dependencies Script
 * 
 * 用途: 同步前端和后端的共有依赖版本
 * 用法: node scripts/sync-common-deps.mjs
 * 
 * 这个脚本会:
 * 1. 读取前端和后端的 package.json
 * 2. 识别共有依赖
 * 3. 对比版本差异
 * 4. 自动同步到相同的版本
 * 5. 生成报告
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

const FRONTEND_PACKAGE_JSON = path.join(PROJECT_ROOT, 'package.json');
const BACKEND_PACKAGE_JSON = path.join(PROJECT_ROOT, 'server', 'package.json');

function loadPackageJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function savePackageJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function findCommonDependencies(frontend, backend) {
  const frontendDeps = {
    ...frontend.dependencies,
    ...frontend.devDependencies,
  };

  const backendDeps = {
    ...backend.dependencies,
    ...backend.devDependencies,
  };

  const commonDeps = {};

  Object.keys(frontendDeps).forEach((dep) => {
    if (backendDeps[dep]) {
      commonDeps[dep] = {
        frontend: frontendDeps[dep],
        backend: backendDeps[dep],
        frontendLocation: frontend.dependencies[dep] ? 'dependencies' : 'devDependencies',
        backendLocation: backend.dependencies[dep] ? 'dependencies' : 'devDependencies',
      };
    }
  });

  return commonDeps;
}

function compareVersions(version1, version2) {
  // Remove ^ and ~ prefixes for comparison
  const v1 = version1.replace(/^[\^~]/, '');
  const v2 = version2.replace(/^[\^~]/, '');
  return v1 === v2;
}

function syncDependencies(frontend, backend, commonDeps) {
  let synced = false;
  const changes = [];

  Object.entries(commonDeps).forEach(([dep, versions]) => {
    if (!compareVersions(versions.frontend, versions.backend)) {
      // 选择较新的版本（通常是有更多数字的版本）
      const frontendVersion = versions.frontend;
      const backendVersion = versions.backend;

      // 比较版本号，选择较新的
      const v1 = frontendVersion.replace(/^[\^~]/, '').split('.').map(Number);
      const v2 = backendVersion.replace(/^[\^~]/, '').split('.').map(Number);

      let targetVersion = frontendVersion;
      let updatedLocation = 'frontend';

      for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
        const n1 = v1[i] || 0;
        const n2 = v2[i] || 0;
        if (n2 > n1) {
          targetVersion = backendVersion;
          updatedLocation = 'backend';
          break;
        } else if (n1 > n2) {
          break;
        }
      }

      // 更新到目标版本
      if (versions.frontendLocation === 'dependencies') {
        frontend.dependencies[dep] = targetVersion;
      } else {
        frontend.devDependencies[dep] = targetVersion;
      }

      if (versions.backendLocation === 'dependencies') {
        backend.dependencies[dep] = targetVersion;
      } else {
        backend.devDependencies[dep] = targetVersion;
      }

      changes.push({
        dep,
        from: `前端: ${frontendVersion}, 后端: ${backendVersion}`,
        to: `同步为: ${targetVersion}`,
        source: updatedLocation,
      });

      synced = true;
    }
  });

  return { synced, changes };
}

function main() {
  console.log('🔄 同步前后端共有依赖版本...\n');

  try {
    const frontend = loadPackageJson(FRONTEND_PACKAGE_JSON);
    const backend = loadPackageJson(BACKEND_PACKAGE_JSON);

    const commonDeps = findCommonDependencies(frontend, backend);

    console.log(`📦 找到 ${Object.keys(commonDeps).length} 个共有依赖\n`);

    const { synced, changes } = syncDependencies(frontend, backend, commonDeps);

    if (synced) {
      console.log('✏️  发现版本不一致，正在同步...\n');

      changes.forEach((change) => {
        console.log(`📝 ${change.dep}`);
        console.log(`   ${change.from}`);
        console.log(`   ✅ ${change.to}`);
        console.log(`   (取自: ${change.source})\n`);
      });

      savePackageJson(FRONTEND_PACKAGE_JSON, frontend);
      savePackageJson(BACKEND_PACKAGE_JSON, backend);

      console.log('✅ 依赖版本已同步！');
      console.log('\n📌 下一步:');
      console.log('  1. npm install (前端)');
      console.log('  2. npm install (后端)');
      console.log('  3. 提交更改到 git');

      process.exit(0);
    } else {
      console.log('✅ 所有共有依赖版本已同步，无需修改\n');
      console.log('📊 共有依赖版本对比:');

      Object.entries(commonDeps).forEach(([dep, versions]) => {
        console.log(
          `  ${dep}: 前端 ${versions.frontend} = 后端 ${versions.backend}`
        );
      });

      process.exit(0);
    }
  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
