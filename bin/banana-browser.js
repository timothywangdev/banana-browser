#!/usr/bin/env node

/**
 * CLI entry point for banana-browser
 *
 * Routes commands to appropriate handlers:
 * - demo       -> ../scripts/demo.js
 * - install    -> ../scripts/install-chromium.js
 * - --version  -> Display all component versions
 * - --help     -> Display help and quick start examples
 * - *          -> Pass through to native agent-browser binary
 */

import { spawn, execSync } from 'child_process';
import { existsSync, accessSync, chmodSync, constants, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { platform, arch } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Load package.json for version info
let packageJson;
try {
  packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
} catch {
  packageJson = { version: 'unknown' };
}

/**
 * Detect if the system uses musl libc (e.g. Alpine Linux)
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
 * Get the platform-specific binary name
 */
function getBinaryName() {
  const os = platform();
  const cpuArch = arch();

  let osKey;
  switch (os) {
    case 'darwin':
      osKey = 'darwin';
      break;
    case 'linux':
      osKey = isMusl() ? 'linux-musl' : 'linux';
      break;
    case 'win32':
      osKey = 'win32';
      break;
    default:
      return null;
  }

  let archKey;
  switch (cpuArch) {
    case 'x64':
    case 'x86_64':
      archKey = 'x64';
      break;
    case 'arm64':
    case 'aarch64':
      archKey = 'arm64';
      break;
    default:
      return null;
  }

  const ext = os === 'win32' ? '.exe' : '';
  return `agent-browser-${osKey}-${archKey}${ext}`;
}

/**
 * Get the path to the native binary
 */
function getBinaryPath() {
  const binaryName = getBinaryName();
  if (!binaryName) return null;
  return join(__dirname, binaryName);
}

/**
 * Display version information for all components
 */
async function showVersion() {
  console.log(`banana-browser v${packageJson.version}`);
  console.log('');

  // agent-browser binary version
  const binaryPath = getBinaryPath();
  if (binaryPath && existsSync(binaryPath)) {
    try {
      const version = execSync(`"${binaryPath}" --version`, { encoding: 'utf8' }).trim();
      console.log(`agent-browser: ${version}`);
    } catch {
      console.log('agent-browser: installed (version unknown)');
    }
  } else {
    console.log('agent-browser: not installed');
    console.log('  Run: npm run postinstall');
  }

  // patchright-adapter version
  const adapterPackageJson = join(projectRoot, 'patchright-adapter', 'package.json');
  if (existsSync(adapterPackageJson)) {
    try {
      const adapterPkg = JSON.parse(readFileSync(adapterPackageJson, 'utf8'));
      console.log(`patchright-adapter: v${adapterPkg.version}`);
    } catch {
      console.log('patchright-adapter: installed (version unknown)');
    }
  } else {
    console.log('patchright-adapter: not found');
  }

  // Chromium status
  const { getConfig } = await import('../lib/config.js');
  const config = getConfig();
  if (config.chromiumPath && existsSync(config.chromiumPath)) {
    console.log(`Chromium: installed`);
    console.log(`  Path: ${config.chromiumPath}`);
  } else {
    console.log('Chromium: not installed');
    console.log('  Run: banana-browser install');
  }
}

/**
 * Display help with quick start examples
 */
function showHelp() {
  console.log(`
banana-browser - Stealth browser automation that bypasses bot detection

USAGE:
  banana-browser <command> [options]

COMMANDS:
  demo                    Run bot detection evasion demo
  install [--with-deps]   Download Chromium (--with-deps for Linux system deps)
  open <url>              Open URL in browser
  click <selector>        Click an element
  fill <selector> <text>  Fill a form field
  screenshot [path]       Take a screenshot
  close                   Close the browser

OPTIONS:
  --version, -v           Show version information
  --help, -h              Show this help message
  --headless              Run in headless mode
  --engine patchright     Use Patchright anti-detection engine

QUICK START:
  # Install and run the demo
  npm install -g banana-browser
  banana-browser install
  banana-browser demo

  # Open a page and interact
  banana-browser open https://example.com
  banana-browser click "button.submit"
  banana-browser screenshot ./page.png

  # Use with anti-detection
  AGENT_BROWSER_ENGINE=patchright banana-browser open https://bot.sannysoft.com

ENVIRONMENT VARIABLES:
  AGENT_BROWSER_ENGINE    Browser engine: "patchright" for anti-detection
  AGENT_BROWSER_HEADLESS  Set to "true" for headless mode

MORE INFO:
  https://github.com/timothywangdev/banana-browser
`);
}

/**
 * Run the demo script
 */
async function runDemo(args) {
  const demoPath = join(projectRoot, 'scripts', 'demo.js');

  if (!existsSync(demoPath)) {
    console.error('Error: Demo script not found');
    console.error('The demo feature will be available in a future release.');
    process.exit(1);
  }

  // Import and run demo module
  const { fork } = await import('child_process');
  const child = fork(demoPath, args, { stdio: 'inherit' });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}

/**
 * Run the install script for Chromium
 */
async function runInstall(args) {
  const installPath = join(projectRoot, 'scripts', 'install-chromium.js');

  if (!existsSync(installPath)) {
    console.error('Error: Install script not found');
    process.exit(1);
  }

  // Import and run install module
  const { fork } = await import('child_process');
  const child = fork(installPath, args, { stdio: 'inherit' });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}

/**
 * Pass command through to the native agent-browser binary
 */
function runNativeBinary(args) {
  const binaryName = getBinaryName();

  if (!binaryName) {
    console.error(`Error: Unsupported platform: ${platform()}-${arch()}`);
    process.exit(1);
  }

  const binaryPath = join(__dirname, binaryName);

  if (!existsSync(binaryPath)) {
    console.error(`Error: Native binary not found for ${platform()}-${arch()}`);
    console.error(`Expected: ${binaryPath}`);
    console.error('');
    console.error('To download the binary, run:');
    console.error('  npm run postinstall');
    console.error('');
    console.error('Or build from source:');
    console.error('  1. Install Rust: https://rustup.rs');
    console.error('  2. Run: npm run build:native');
    process.exit(1);
  }

  // Ensure binary is executable
  if (platform() !== 'win32') {
    try {
      accessSync(binaryPath, constants.X_OK);
    } catch {
      try {
        chmodSync(binaryPath, 0o755);
      } catch (chmodErr) {
        console.error(`Error: Cannot make binary executable: ${chmodErr.message}`);
        console.error('Try running: chmod +x ' + binaryPath);
        process.exit(1);
      }
    }
  }

  // Spawn the native binary with inherited stdio
  const child = spawn(binaryPath, args, {
    stdio: 'inherit',
    windowsHide: false,
  });

  child.on('error', (err) => {
    console.error(`Error executing binary: ${err.message}`);
    process.exit(1);
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Handle special commands and flags
  switch (command) {
    case '--version':
    case '-v':
      await showVersion();
      break;

    case '--help':
    case '-h':
    case undefined:
      showHelp();
      break;

    case 'demo':
      await runDemo(args.slice(1));
      break;

    case 'install':
      await runInstall(args.slice(1));
      break;

    default:
      // Pass all other commands to the native binary
      runNativeBinary(args);
      break;
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
