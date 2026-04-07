#!/usr/bin/env node
/**
 * Dependency Security Audit
 * Checks for known vulnerable or outdated packages
 * 
 * Usage: npx ts-node scripts/audit-dependencies.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface ProblematicPackage {
  name: string;
  minVersion: string;
  reason: string;
  suggestions: string;
}

interface VersionParts {
  major: number;
  minor: number;
  patch: number;
  original: string;
}

interface AuditResults {
  outdated: string[];
  problematic: string[];
  secure: string[];
}

// Known problematic packages that should be avoided or updated
const PROBLEMATIC_PACKAGES: ProblematicPackage[] = [
  {
    name: 'pixi-live2d-display',
    minVersion: '0.2.2',
    reason: 'Ensure version is up to date',
    suggestions: 'Check for newer versions that include security patches',
  },
];

// Packages that should have specific minimum versions for security
const MINIMUM_VERSIONS: Record<string, string> = {
  'next': '14.0.0',
  'react': '18.2.0',
  'typescript': '5.2.0',
};

function parseVersion(versionString: string): VersionParts {
  // Remove ^ or ~ prefix
  const cleaned = versionString.replace(/^[\^~]/, '');
  const parts = cleaned.split('.');
  return {
    major: parseInt(parts[0] || '0', 10),
    minor: parseInt(parts[1] || '0', 10),
    patch: parseInt(parts[2] || '0', 10),
    original: cleaned,
  };
}

function compareVersions(actual: VersionParts, required: VersionParts): number {
  if (actual.major > required.major) return 1;
  if (actual.major < required.major) return -1;
  if (actual.minor > required.minor) return 1;
  if (actual.minor < required.minor) return -1;
  if (actual.patch > required.patch) return 1;
  if (actual.patch < required.patch) return -1;
  return 0;
}

async function auditDependencies(): Promise<void> {
  console.log('[Dependency Audit] Starting security check...\n');

  try {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const allDeps: Record<string, string> = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    let issues = 0;
    const results: AuditResults = {
      outdated: [],
      problematic: [],
      secure: [],
    };

    console.log('Checking core dependencies...\n');

    for (const [pkg, version] of Object.entries(allDeps)) {
      const actualVersion = parseVersion(version);

      // Check for known problematic packages
      const problematic = PROBLEMATIC_PACKAGES.find((p) => p.name === pkg);
      if (problematic) {
        const requiredVersion = parseVersion(problematic.minVersion);
        if (compareVersions(actualVersion, requiredVersion) < 0) {
          console.log(`⚠️  ${pkg}: ${version} (requires >= ${problematic.minVersion})`);
          console.log(`   Reason: ${problematic.reason}`);
          console.log(`   Suggestion: ${problematic.suggestions}\n`);
          results.problematic.push(pkg);
          issues++;
        }
      }

      // Check minimum versions
      const minVersion = MINIMUM_VERSIONS[pkg];
      if (minVersion) {
        const requiredVersion = parseVersion(minVersion);
        if (compareVersions(actualVersion, requiredVersion) < 0) {
          console.log(`⚠️  ${pkg}: ${version} (requires >= ${minVersion})`);
          results.outdated.push(pkg);
          issues++;
        } else {
          results.secure.push(pkg);
        }
      }
    }

    console.log('\n=== Audit Summary ===');
    console.log(`✓ Secure packages: ${results.secure.length}`);
    if (results.outdated.length > 0) {
      console.log(`⚠️  Outdated packages: ${results.outdated.length}`);
    }
    if (results.problematic.length > 0) {
      console.log(`⚠️  Problematic packages: ${results.problematic.length}`);
    }

    if (issues > 0) {
      console.log(`\n❌ Found ${issues} issue(s). Please update your dependencies.`);
      process.exit(1);
    } else {
      console.log('\n✅ All dependencies are secure!');
      process.exit(0);
    }
  } catch (error) {
    console.error('[Dependency Audit] Error:', error);
    process.exit(1);
  }
}

auditDependencies();
