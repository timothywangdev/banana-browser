#!/usr/bin/env node

/**
 * Postinstall script for banana-browser
 *
 * Downloads the platform-specific native binary from GitHub releases.
 * On global installs, patches npm's bin entry to use the native binary directly.
 *
 * Uses foundational modules:
 * - ../lib/platform.js for platform detection
 * - ../lib/github-releases.js for release info
 * - ./download-binary.js for download with progress
 */

import { existsSync, mkdirSync, chmodSync, writeFileSync, symlinkSync, unlinkSync, lstatSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { platform } from 'os';
import { execSync } from 'child_process';

// Import foundational modules
import { getPlatform, isPlatformSupported } from '../lib/platform.js';
import { getLatestRelease, getAssetUrl, buildDirectDownloadUrl } from '../lib/github-releases.js';
import { downloadBinary } from './download-binary.js';
import { setConfig } from '../lib/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const binDir = join(projectRoot, 'bin');

// Package info
let packageJson;
try {
  const fs = await import('fs');
  packageJson = JSON.parse(fs.readFileSync(join(projectRoot, 'package.json'), 'utf8'));
} catch {
  packageJson = { version: '0.0.0' };
}

const GITHUB_REPO = 'vercel-labs/agent-browser';

/**
 * Main postinstall function
 */
async function main() {
  // Check platform support
  if (!isPlatformSupported()) {
    console.log('');
    console.log('  Warning: Unsupported platform');
    console.log('  Binary download skipped. You may need to build from source.');
    console.log('');
    showInstallReminder();
    return;
  }

  const { binaryName, platformKey } = getPlatform();
  const binaryPath = join(binDir, binaryName);

  // Check if binary already exists
  if (existsSync(binaryPath)) {
    // Ensure binary is executable (npm doesn't preserve execute bit)
    if (platform() !== 'win32') {
      chmodSync(binaryPath, 0o755);
    }
    console.log(`  Native binary ready: ${binaryName}`);

    // Store version in config
    setConfig('installedVersion', packageJson.version);

    // On global installs, fix npm's bin entry to use native binary directly
    await fixGlobalInstallBin(binaryPath);

    showInstallReminder();
    return;
  }

  // Ensure bin directory exists
  if (!existsSync(binDir)) {
    mkdirSync(binDir, { recursive: true });
  }

  console.log('');
  console.log(`  Downloading native binary for ${platformKey}...`);

  try {
    // Try to get latest release info from GitHub API
    let downloadUrl;
    let version = packageJson.version;

    try {
      const release = await getLatestRelease(GITHUB_REPO);
      downloadUrl = getAssetUrl(release, binaryName);
      version = release.version;

      if (!downloadUrl) {
        // Asset not found in release, fall back to version-based URL
        downloadUrl = buildDirectDownloadUrl(GITHUB_REPO, `v${packageJson.version}`, binaryName);
      }
    } catch (apiError) {
      // GitHub API failed (rate limit, network error, etc.)
      // Fall back to direct download URL using package version
      console.log('  Using package version for download...');
      downloadUrl = buildDirectDownloadUrl(GITHUB_REPO, `v${packageJson.version}`, binaryName);
    }

    // Download binary with progress
    const result = await downloadBinary(downloadUrl, binaryPath, {
      silent: false,
      executable: true,
    });

    if (result.success) {
      console.log(`  Native binary installed: ${binaryName}`);

      // Store version in config
      setConfig('installedVersion', version);
    } else {
      handleDownloadFailure(result.error);
      return;
    }
  } catch (err) {
    handleDownloadFailure(err.message);
    return;
  }

  // On global installs, fix npm's bin entry to use native binary directly
  await fixGlobalInstallBin(binaryPath);

  showInstallReminder();
}

/**
 * Handle download failure gracefully
 * Don't fail npm install completely - warn and continue
 */
function handleDownloadFailure(errorMessage) {
  console.log('');
  console.log('  Warning: Could not download native binary');
  console.log(`  ${errorMessage || 'Unknown error'}`);
  console.log('');
  console.log('  To retry the download, run:');
  console.log('');
  console.log('    npx banana-browser --install-binary');
  console.log('');
  console.log('  Or build the native binary locally:');
  console.log('    1. Install Rust: https://rustup.rs');
  console.log('    2. Run: npm run build:native');
  console.log('');

  // Don't exit with error - allow npm install to complete
  // The CLI wrapper will show a helpful error if binary is missing
}

/**
 * Show post-install reminder about Chromium
 */
function showInstallReminder() {
  console.log('');
  console.log('  To download Chromium, run:');
  console.log('');
  console.log('    banana-browser install');
  console.log('');
  console.log('  On Linux, include system dependencies with:');
  console.log('');
  console.log('    banana-browser install --with-deps');
  console.log('');
}

/**
 * Fix npm's bin entry on global installs to use the native binary directly.
 * This provides zero-overhead CLI execution for global installs.
 */
async function fixGlobalInstallBin(binaryPath) {
  if (platform() === 'win32') {
    await fixWindowsShims(binaryPath);
  } else {
    await fixUnixSymlink(binaryPath);
  }
}

/**
 * Fix npm symlink on Mac/Linux global installs.
 * Replace the symlink to the JS wrapper with a symlink to the native binary.
 */
async function fixUnixSymlink(binaryPath) {
  // Get npm's global bin directory (npm prefix -g + /bin)
  let npmBinDir;
  try {
    const prefix = execSync('npm prefix -g', { encoding: 'utf8' }).trim();
    npmBinDir = join(prefix, 'bin');
  } catch {
    return; // npm not available
  }

  const symlinkPath = join(npmBinDir, 'banana-browser');

  // Check if symlink exists (indicates global install)
  try {
    const stat = lstatSync(symlinkPath);
    if (!stat.isSymbolicLink()) {
      return; // Not a symlink, don't touch it
    }
  } catch {
    return; // Symlink doesn't exist, not a global install
  }

  // Replace symlink to point directly to native binary
  try {
    unlinkSync(symlinkPath);
    symlinkSync(binaryPath, symlinkPath);
    console.log('  Optimized: symlink points to native binary (zero overhead)');
  } catch (err) {
    // Permission error or other issue - not critical, JS wrapper still works
    console.log(`  Note: Could not optimize symlink: ${err.message}`);
    console.log('  CLI will work via Node.js wrapper (slightly slower startup)');
  }
}

/**
 * Fix npm-generated shims on Windows global installs.
 * npm generates shims that try to run /bin/sh, which doesn't exist on Windows.
 * We overwrite them to invoke the native .exe directly.
 */
async function fixWindowsShims(binaryPath) {
  let npmBinDir;
  try {
    npmBinDir = execSync('npm prefix -g', { encoding: 'utf8' }).trim();
  } catch {
    return;
  }

  const cmdShim = join(npmBinDir, 'banana-browser.cmd');
  const ps1Shim = join(npmBinDir, 'banana-browser.ps1');

  // Shims may not exist yet during postinstall
  if (!existsSync(cmdShim)) {
    return;
  }

  // Only rewrite shims if the native binary actually exists
  if (!existsSync(binaryPath)) {
    return;
  }

  try {
    // Use relative path from npm bin to the binary
    const relativeBinaryPath = binaryPath.replace(npmBinDir + '\\', '').replace(npmBinDir + '/', '');

    const cmdContent = `@ECHO off\r\n"${binaryPath}" %*\r\n`;
    writeFileSync(cmdShim, cmdContent);

    const ps1Content = `#!/usr/bin/env pwsh\r\n& "${binaryPath}" $args\r\nexit $LASTEXITCODE\r\n`;
    writeFileSync(ps1Shim, ps1Content);

    console.log('  Optimized: shims point to native binary (zero overhead)');
  } catch (err) {
    console.log(`  Note: Could not optimize shims: ${err.message}`);
    console.log('  CLI will work via Node.js wrapper (slightly slower startup)');
  }
}

// Run main function
main().catch((err) => {
  // Catch-all error handler - don't fail npm install
  console.log('');
  console.log('  Warning: Postinstall encountered an error');
  console.log(`  ${err.message}`);
  console.log('');
  console.log('  The package was installed, but you may need to run:');
  console.log('    npx banana-browser --install-binary');
  console.log('');
});
