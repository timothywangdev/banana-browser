#!/usr/bin/env node

/**
 * Development setup script for banana-browser
 *
 * Checks prerequisites, installs dependencies, and prepares the dev environment.
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// ANSI colors for terminal output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logStep(step, message) {
  console.log(`\n${colors.blue}[${step}]${colors.reset} ${message}`);
}

function logSuccess(message) {
  console.log(`  ${colors.green}✓${colors.reset} ${message}`);
}

function logWarning(message) {
  console.log(`  ${colors.yellow}⚠${colors.reset} ${message}`);
}

function logError(message) {
  console.log(`  ${colors.red}✗${colors.reset} ${message}`);
}

/**
 * Check if a command exists and get its version
 */
function checkCommand(command, versionArg = '--version') {
  try {
    const result = spawnSync(command, [versionArg], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result.status === 0) {
      const version = (result.stdout || result.stderr).split('\n')[0].trim();
      return { exists: true, version };
    }
    return { exists: false, version: null };
  } catch {
    return { exists: false, version: null };
  }
}

/**
 * Check Node.js version
 */
function checkNodeVersion() {
  const { exists, version } = checkCommand('node', '--version');

  if (!exists) {
    logError('Node.js is not installed');
    console.log('\n  Install Node.js 20+ from https://nodejs.org/');
    return false;
  }

  const majorVersion = parseInt(version.replace('v', '').split('.')[0], 10);

  if (majorVersion < 20) {
    logError(`Node.js ${version} found, but v20+ is required`);
    console.log('\n  Please upgrade Node.js from https://nodejs.org/');
    return false;
  }

  logSuccess(`Node.js ${version}`);
  return true;
}

/**
 * Check npm version
 */
function checkNpmVersion() {
  const { exists, version } = checkCommand('npm', '--version');

  if (!exists) {
    logError('npm is not installed');
    return false;
  }

  logSuccess(`npm v${version}`);
  return true;
}

/**
 * Check Rust toolchain
 */
function checkRustToolchain() {
  const rustc = checkCommand('rustc', '--version');
  const cargo = checkCommand('cargo', '--version');

  if (!rustc.exists) {
    logWarning('Rust is not installed (optional for JS-only development)');
    console.log('\n  To build native binaries, install Rust from https://rustup.rs/');
    console.log('  Run: curl --proto \'=https\' --tlsv1.2 -sSf https://sh.rustup.rs | sh');
    return false;
  }

  if (!cargo.exists) {
    logWarning('Cargo is not installed');
    console.log('\n  Cargo should be installed with Rust. Try reinstalling from https://rustup.rs/');
    return false;
  }

  logSuccess(`rustc ${rustc.version.replace('rustc ', '')}`);
  logSuccess(`cargo ${cargo.version.replace('cargo ', '')}`);
  return true;
}

/**
 * Check Git installation
 */
function checkGit() {
  const { exists, version } = checkCommand('git', '--version');

  if (!exists) {
    logWarning('Git is not installed');
    console.log('\n  Install Git from https://git-scm.com/');
    return false;
  }

  logSuccess(`${version}`);
  return true;
}

/**
 * Install npm dependencies
 */
function installDependencies() {
  logStep('2', 'Installing npm dependencies...');

  try {
    execSync('npm install', {
      cwd: rootDir,
      stdio: 'inherit',
    });
    logSuccess('npm dependencies installed');
    return true;
  } catch (error) {
    logError('Failed to install npm dependencies');
    console.error(error.message);
    return false;
  }
}

/**
 * Build patchright-adapter if it exists
 */
function buildPatchrightAdapter() {
  const adapterDir = join(rootDir, '..', 'patchright-adapter');

  if (!existsSync(adapterDir)) {
    logSuccess('Skipping patchright-adapter (not present)');
    return true;
  }

  logStep('3', 'Building patchright-adapter...');

  try {
    // Check if package.json exists
    if (!existsSync(join(adapterDir, 'package.json'))) {
      logWarning('patchright-adapter has no package.json, skipping');
      return true;
    }

    // Install adapter dependencies
    execSync('npm install', {
      cwd: adapterDir,
      stdio: 'inherit',
    });

    // Build adapter if build script exists
    try {
      execSync('npm run build', {
        cwd: adapterDir,
        stdio: 'inherit',
      });
      logSuccess('patchright-adapter built successfully');
    } catch {
      logWarning('patchright-adapter build script not found, skipping build');
    }

    return true;
  } catch (error) {
    logWarning(`Failed to build patchright-adapter: ${error.message}`);
    return true; // Non-fatal
  }
}

/**
 * Main setup function
 */
async function main() {
  console.log(`\n${colors.bold}banana-browser Development Setup${colors.reset}`);
  console.log('='.repeat(40));

  // Step 1: Check prerequisites
  logStep('1', 'Checking prerequisites...');

  const hasNode = checkNodeVersion();
  const hasNpm = checkNpmVersion();
  const hasRust = checkRustToolchain();
  const hasGit = checkGit();

  if (!hasNode || !hasNpm) {
    console.log(`\n${colors.red}Setup failed: Node.js and npm are required.${colors.reset}`);
    process.exit(1);
  }

  // Step 2: Install dependencies
  const depsInstalled = installDependencies();

  if (!depsInstalled) {
    console.log(`\n${colors.red}Setup failed: Could not install dependencies.${colors.reset}`);
    process.exit(1);
  }

  // Step 3: Build patchright-adapter
  buildPatchrightAdapter();

  // Summary
  console.log('\n' + '='.repeat(40));
  console.log(`${colors.bold}Setup Complete!${colors.reset}\n`);

  console.log('Next steps:');
  console.log(`  ${colors.blue}npm test${colors.reset}           Run tests`);
  console.log(`  ${colors.blue}npm run demo${colors.reset}       Run demo locally`);

  if (hasRust) {
    console.log(`  ${colors.blue}npm run build:native${colors.reset}  Build native binary`);
  } else {
    console.log(`\n${colors.yellow}Note:${colors.reset} Rust not found. Install from https://rustup.rs/ to build native binaries.`);
  }

  console.log('\nHappy coding!\n');
}

main().catch((error) => {
  console.error('Setup failed:', error);
  process.exit(1);
});
