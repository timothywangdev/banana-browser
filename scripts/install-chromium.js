#!/usr/bin/env node

/**
 * Chromium installation wrapper for banana-browser
 *
 * Wraps `npx patchright install chromium` with progress indication
 * and stores the chromium path in user config.
 */

import { spawn } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { setConfig, getConfig } from '../lib/config.js';

// Dynamic imports for optional dependencies
let ora, chalk;

/**
 * Initialize optional dependencies
 */
async function initDependencies() {
  try {
    const oraModule = await import('ora');
    ora = oraModule.default;
  } catch {
    ora = null;
  }

  try {
    const chalkModule = await import('chalk');
    chalk = chalkModule.default;
  } catch {
    chalk = {
      green: (s) => s,
      red: (s) => s,
      yellow: (s) => s,
      cyan: (s) => s,
      dim: (s) => s,
      bold: (s) => s,
    };
  }
}

/**
 * Get the expected Chromium installation path for Patchright
 *
 * Patchright stores browsers in ~/.cache/ms-playwright on Unix
 * and %LOCALAPPDATA%\ms-playwright on Windows
 *
 * @returns {string}
 */
function getChromiumBasePath() {
  if (process.platform === 'win32') {
    return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'ms-playwright');
  }
  return join(homedir(), '.cache', 'ms-playwright');
}

/**
 * Find the installed Chromium executable path
 *
 * @returns {string|null}
 */
function findChromiumPath() {
  const basePath = getChromiumBasePath();

  if (!existsSync(basePath)) {
    return null;
  }

  // Patchright names the directory chromium-<version>
  // We look for any chromium-* directory
  try {
    const dirs = readdirSync(basePath);
    const chromiumDir = dirs.find(d => d.startsWith('chromium-'));

    if (!chromiumDir) {
      return null;
    }

    // Construct path to executable
    const chromiumBase = join(basePath, chromiumDir);

    if (process.platform === 'darwin') {
      return join(chromiumBase, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
    } else if (process.platform === 'win32') {
      return join(chromiumBase, 'chrome-win', 'chrome.exe');
    } else {
      return join(chromiumBase, 'chrome-linux', 'chrome');
    }
  } catch {
    return null;
  }
}

/**
 * Check if Chromium is already installed via Patchright
 *
 * @returns {Promise<boolean>}
 */
export async function isChromiumInstalled() {
  const config = getConfig();

  // Check cached path first
  if (config.chromiumPath && existsSync(config.chromiumPath)) {
    return true;
  }

  // Try to find it
  const chromiumPath = findChromiumPath();
  if (chromiumPath && existsSync(chromiumPath)) {
    // Cache the path
    setConfig('chromiumPath', chromiumPath);
    return true;
  }

  return false;
}

/**
 * Install Chromium using Patchright
 *
 * @param {Object} [options] - Installation options
 * @param {boolean} [options.silent=false] - Suppress output
 * @param {boolean} [options.withDeps=false] - Install system dependencies (Linux only)
 * @returns {Promise<{ success: boolean, chromiumPath?: string, error?: string }>}
 *
 * @example
 * const result = await installChromium();
 * if (result.success) {
 *   console.log(`Chromium installed at: ${result.chromiumPath}`);
 * }
 */
export async function installChromium(options = {}) {
  const { silent = false, withDeps = false } = options;

  await initDependencies();

  // Create spinner
  let spinner = null;
  if (!silent && ora) {
    spinner = ora({
      text: 'Installing Chromium via Patchright...',
      spinner: 'dots',
    }).start();
  } else if (!silent) {
    console.log('Installing Chromium via Patchright...');
  }

  return new Promise((resolve) => {
    // Build command arguments
    const args = ['patchright', 'install', 'chromium'];

    // Add --with-deps flag on Linux if requested
    if (withDeps && process.platform === 'linux') {
      args.push('--with-deps');
      if (spinner) {
        spinner.text = 'Installing Chromium and system dependencies...';
      }
    }

    // Spawn npx process
    const npx = spawn('npx', args, {
      stdio: silent ? 'ignore' : 'pipe',
      shell: true,
    });

    let output = '';
    let errorOutput = '';

    if (!silent && npx.stdout) {
      npx.stdout.on('data', (data) => {
        output += data.toString();
        // Update spinner with last line of output
        const lines = output.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        if (spinner && lastLine) {
          spinner.text = lastLine.substring(0, 60) + (lastLine.length > 60 ? '...' : '');
        }
      });
    }

    if (npx.stderr) {
      npx.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
    }

    npx.on('close', (code) => {
      if (code === 0) {
        // Try to find the installed Chromium path
        const chromiumPath = findChromiumPath();

        if (chromiumPath) {
          // Store in config
          setConfig('chromiumPath', chromiumPath);

          if (spinner) {
            spinner.succeed(chalk.green('Chromium installed successfully'));
          } else if (!silent) {
            console.log('Chromium installed successfully');
          }

          resolve({
            success: true,
            chromiumPath,
          });
        } else {
          // Installation succeeded but we couldn't find the path
          if (spinner) {
            spinner.succeed(chalk.green('Chromium installed (path detection pending)'));
          }

          resolve({
            success: true,
            chromiumPath: null,
          });
        }
      } else {
        if (spinner) {
          spinner.fail(chalk.red('Chromium installation failed'));
        } else if (!silent) {
          console.error('Chromium installation failed');
        }

        if (!silent && errorOutput) {
          console.error(chalk.dim(errorOutput));
        }

        resolve({
          success: false,
          error: errorOutput || `Exit code: ${code}`,
        });
      }
    });

    npx.on('error', (err) => {
      if (spinner) {
        spinner.fail(chalk.red(`Failed to run npx: ${err.message}`));
      }

      resolve({
        success: false,
        error: err.message,
      });
    });
  });
}

/**
 * Get the cached Chromium path from config
 *
 * @returns {string|null}
 */
export function getChromiumPath() {
  const config = getConfig();
  return config.chromiumPath || null;
}

// CLI usage when run directly
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const withDeps = process.argv.includes('--with-deps');

  installChromium({ withDeps }).then(result => {
    if (result.success) {
      console.log(`\nChromium path: ${result.chromiumPath || '(auto-detected by Patchright)'}`);
    }
    process.exit(result.success ? 0 : 1);
  });
}
