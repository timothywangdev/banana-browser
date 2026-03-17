/**
 * Platform detection module for banana-browser
 *
 * Detects OS and architecture, returns binary naming information.
 */

import { platform, arch } from 'os';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

/**
 * Detect if the system uses musl libc (e.g., Alpine Linux)
 * @returns {boolean}
 */
function isMusl() {
  if (platform() !== 'linux') return false;
  try {
    const result = execSync('ldd --version 2>&1 || true', { encoding: 'utf8' });
    return result.toLowerCase().includes('musl');
  } catch {
    return existsSync('/lib/ld-musl-x86_64.so.1') || existsSync('/lib/ld-musl-aarch64.so.1');
  }
}

/**
 * Supported platform configurations
 */
const SUPPORTED_PLATFORMS = {
  'linux-x64': 'agent-browser-linux-x64',
  'linux-musl-x64': 'agent-browser-linux-musl-x64',
  'darwin-arm64': 'agent-browser-darwin-arm64',
  'darwin-x64': 'agent-browser-darwin-x64',
  'win32-x64': 'agent-browser-win32-x64.exe',
  'win32-arm64': 'agent-browser-win32-arm64.exe',
};

/**
 * Get current platform information
 *
 * @returns {{ platform: string, arch: string, binaryName: string, platformKey: string }}
 * @throws {Error} If the platform is not supported
 *
 * @example
 * const { platform, arch, binaryName } = getPlatform();
 * // On macOS M1: { platform: 'darwin', arch: 'arm64', binaryName: 'agent-browser-darwin-arm64' }
 */
export function getPlatform() {
  const os = platform();
  const cpuArch = arch();

  // Handle musl libc on Linux (Alpine, etc.)
  const osKey = os === 'linux' && isMusl() ? 'linux-musl' : os;
  const platformKey = `${osKey}-${cpuArch}`;

  const binaryName = SUPPORTED_PLATFORMS[platformKey];

  if (!binaryName) {
    const supported = Object.keys(SUPPORTED_PLATFORMS)
      .filter(k => !k.includes('musl')) // Don't show musl variants in error
      .join(', ');
    throw new Error(
      `Unsupported platform: ${platformKey}\n` +
      `Supported platforms: ${supported}\n` +
      `Please open an issue at https://github.com/vercel-labs/agent-browser/issues`
    );
  }

  return {
    platform: os,
    arch: cpuArch,
    binaryName,
    platformKey,
  };
}

/**
 * Check if the current platform is supported
 * @returns {boolean}
 */
export function isPlatformSupported() {
  try {
    getPlatform();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the file extension for executables on the current platform
 * @returns {string}
 */
export function getExecutableExtension() {
  return platform() === 'win32' ? '.exe' : '';
}
