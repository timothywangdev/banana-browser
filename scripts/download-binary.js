#!/usr/bin/env node

/**
 * Binary download module with progress indicator
 *
 * Downloads files with a visual progress spinner using ora and chalk.
 */

import { createWriteStream, existsSync, mkdirSync, unlinkSync, chmodSync } from 'fs';
import { dirname } from 'path';
import { platform } from 'os';
import { get } from 'https';
import { get as httpGet } from 'http';

// Dynamic imports for optional dependencies (ora, chalk)
let ora, chalk;

/**
 * Initialize optional dependencies
 * Falls back to simple console output if not available
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
    };
  }
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Download a file from URL with progress indicator
 *
 * @param {string} url - URL to download from
 * @param {string} destPath - Destination file path
 * @param {Object} [options] - Download options
 * @param {boolean} [options.silent=false] - Suppress output
 * @param {boolean} [options.executable=true] - Make file executable on Unix
 * @returns {Promise<{ success: boolean, path: string, size: number, error?: string }>}
 *
 * @example
 * const result = await downloadBinary(
 *   'https://github.com/user/repo/releases/download/v1.0/binary',
 *   '/usr/local/bin/my-binary'
 * );
 * if (result.success) {
 *   console.log(`Downloaded ${result.size} bytes to ${result.path}`);
 * }
 */
export async function downloadBinary(url, destPath, options = {}) {
  const { silent = false, executable = true } = options;

  await initDependencies();

  // Ensure destination directory exists
  const destDir = dirname(destPath);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  // Create spinner if ora is available and not silent
  let spinner = null;
  if (!silent && ora) {
    spinner = ora({
      text: `Downloading...`,
      spinner: 'dots',
    }).start();
  } else if (!silent) {
    console.log('Downloading...');
  }

  return new Promise((resolve) => {
    const file = createWriteStream(destPath);
    let downloadedBytes = 0;
    let totalBytes = 0;

    const handleResponse = (response) => {
      // Handle redirects (GitHub releases use redirects)
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (spinner) {
          spinner.text = 'Following redirect...';
        }
        // Follow redirect
        const protocol = redirectUrl.startsWith('https') ? get : httpGet;
        protocol(redirectUrl, handleResponse).on('error', handleError);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        try { unlinkSync(destPath); } catch {}

        if (spinner) {
          spinner.fail(chalk.red(`Download failed: HTTP ${response.statusCode}`));
        }
        resolve({
          success: false,
          path: destPath,
          size: 0,
          error: `HTTP ${response.statusCode}`,
        });
        return;
      }

      totalBytes = parseInt(response.headers['content-length'] || '0', 10);

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (spinner && totalBytes > 0) {
          const percent = Math.round((downloadedBytes / totalBytes) * 100);
          spinner.text = `Downloading... ${percent}% (${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)})`;
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();

        // Make executable on Unix
        if (executable && platform() !== 'win32') {
          try {
            chmodSync(destPath, 0o755);
          } catch {}
        }

        if (spinner) {
          spinner.succeed(chalk.green(`Downloaded ${formatBytes(downloadedBytes)}`));
        } else if (!silent) {
          console.log(`Downloaded ${formatBytes(downloadedBytes)}`);
        }

        resolve({
          success: true,
          path: destPath,
          size: downloadedBytes,
        });
      });
    };

    const handleError = (err) => {
      file.close();
      try { unlinkSync(destPath); } catch {}

      if (spinner) {
        spinner.fail(chalk.red(`Download failed: ${err.message}`));
      } else if (!silent) {
        console.error(`Download failed: ${err.message}`);
      }

      resolve({
        success: false,
        path: destPath,
        size: 0,
        error: err.message,
      });
    };

    // Start download
    const protocol = url.startsWith('https') ? get : httpGet;
    protocol(url, handleResponse).on('error', handleError);
  });
}

/**
 * Check if a URL is accessible
 *
 * @param {string} url - URL to check
 * @returns {Promise<boolean>}
 */
export async function isUrlAccessible(url) {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? get : httpGet;
    const req = protocol(url, { method: 'HEAD' }, (response) => {
      // 200 or redirect means accessible
      resolve(response.statusCode === 200 ||
              response.statusCode === 301 ||
              response.statusCode === 302);
    });

    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// CLI usage when run directly
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const [,, url, dest] = process.argv;

  if (!url || !dest) {
    console.error('Usage: download-binary.js <url> <destination>');
    process.exit(1);
  }

  downloadBinary(url, dest).then(result => {
    process.exit(result.success ? 0 : 1);
  });
}
