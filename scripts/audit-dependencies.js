#!/usr/bin/env node
/**
 * Dependency Security Audit
 * Checks for known vulnerable or outdated packages
 * 
 * Usage: node scripts/audit-dependencies.js
 */

const fs = require('fs');
const path = require('path');

// Known problematic packages that should be avoided or updated
const PROBLEMATIC_PACKAGES = [
  {
    name: 'pixi-live2d-display',
    minVersion: '0.2.2',
    reason: 'Ensure version is up to date',
    suggestions: 'Check for newer versions that include security patches',
  },
];

// Packages that should have specific minimum versions for security
const MINIMUM_VERSIONS = {
  'next': '14.0.0',
  'react': '18.2.0',
  'typescript': '5.2.0',
};

function parseVersion(versionString) {
  // Remove ^ or ~ prefix
  const cleaned = versionString.replace(/^[\^~]/, '');
  const parts = cleaned.split('.');
  return {
    major: parseInt(parts[0], 10),
    minor: parseInt(parts[1], 10) || 0,
    patch: parseInt(parts[2], 10) || 0,
    original: cleaned,
  };
}

function compareVersions(actual, required) {
  if (actual.major > required.major) return 1;
  if (actual.major < required.major) return -1;
  if (actual.minor > required.minor) return 1;
  if (actual.minor < required.minor) return -1;
  if (actual.patch > required.patch) return 1;
  if (actual.patch < required.patch) return -1;
  return 0;
}

async function auditDependencies() {
  console.log('[Dependency Audit] Starting security check...\n');

  try {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    let issues = 0;
    const results = {
      outdated: [],
      problematic: [],
      secure: [],
    };

    console.log('Checking core dependencies...\n');

    for (const [pkg, version] of Object.entries(allDeps)) {
      const actualVersion = parseVersion(version);

      // Check for known problematic packages
      const problematic = PROBLEMATIC_PACKAGES.find(p => p.name === pkg);
      if (problematic) {
        const requiredVersion = parseVersion(problematic.minVersion);
        if (compareVersions(actualVersion, requiredVersion) < 0) {
          console.log(`⚠️  ${pkg}: ${version} (requires >= ${problematic.minVersion})`);
          console.log(`    Reason: ${problematic.reason}`);
          console.log(`    Action: ${problematic.suggestions}\n`);
          results.problematic.push(pkg);
          issues++;
        }
      }

      // Check minimum versions for security-critical packages
      if (MINIMUM_VERSIONS[pkg]) {
        const requiredVersion = parseVersion(MINIMUM_VERSIONS[pkg]);
        if (compareVersions(actualVersion, requiredVersion) < 0) {
          console.log(`⚠️  ${pkg}: ${version} (requires >= ${MINIMUM_VERSIONS[pkg]})`);
          results.outdated.push(pkg);
          issues++;
        } else {
          console.log(`✅ ${pkg}: ${version}`);
          results.secure.push(pkg);
        }
      }
    }

    console.log(`\nDependency Audit Summary:`);
    console.log(`  Secure packages: ${results.secure.length}`);
    console.log(`  Outdated: ${results.outdated.length}`);
    console.log(`  Problematic: ${results.problematic.length}`);

    if (issues > 0) {
      console.log(`\n⚠️  Found ${issues} dependency issue(s).`);
      console.log('Recommendations:');
      console.log('  1. Run: npm update <package-name>');
      console.log('  2. Review changelogs for breaking changes');
      console.log('  3. Run tests after updating: npm test');
      process.exit(1);
    } else {
      console.log('\n✅ All dependencies are up to security standards!');
      process.exit(0);
    }
  } catch (error) {
    console.error('[Dependency Audit] Error:', error);
    process.exit(1);
  }
}

auditDependencies();
