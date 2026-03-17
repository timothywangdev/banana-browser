/**
 * Tests for lib/config.js
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Store original HOME to restore later
const originalHome = process.env.HOME;
const testConfigDir = join(tmpdir(), `banana-browser-test-${process.pid}`);

describe('config.js', () => {
  beforeEach(() => {
    // Create a temp directory for testing
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true });
    }
    mkdirSync(testConfigDir, { recursive: true });

    // Override HOME so config goes to test directory
    process.env.HOME = testConfigDir;
  });

  afterEach(() => {
    // Restore original HOME
    process.env.HOME = originalHome;

    // Clean up test directory
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true });
    }
  });

  describe('getConfig()', async () => {
    test('returns default config when no config file exists', async () => {
      // Re-import to pick up new HOME
      const { getConfig } = await import(`../lib/config.js?t=${Date.now()}`);

      const config = getConfig();

      assert.strictEqual(config.starPromptShown, false, 'starPromptShown should default to false');
      assert.strictEqual(config.chromiumPath, null, 'chromiumPath should default to null');
      assert.strictEqual(config.installedVersion, null, 'installedVersion should default to null');
    });

    test('returns stored config when config file exists', async () => {
      // Create a config file
      const configDir = join(testConfigDir, '.banana-browser');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, 'config.json'),
        JSON.stringify({ starPromptShown: true, chromiumPath: '/test/path' })
      );

      // Re-import to pick up new config
      const { getConfig } = await import(`../lib/config.js?t=${Date.now() + 1}`);

      const config = getConfig();

      assert.strictEqual(config.starPromptShown, true, 'should read stored starPromptShown');
      assert.strictEqual(config.chromiumPath, '/test/path', 'should read stored chromiumPath');
    });

    test('returns defaults for missing keys in partial config', async () => {
      // Create a partial config file
      const configDir = join(testConfigDir, '.banana-browser');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, 'config.json'),
        JSON.stringify({ starPromptShown: true })
      );

      const { getConfig } = await import(`../lib/config.js?t=${Date.now() + 2}`);

      const config = getConfig();

      assert.strictEqual(config.starPromptShown, true, 'should read stored value');
      assert.strictEqual(config.chromiumPath, null, 'should use default for missing key');
      assert.strictEqual(config.installedVersion, null, 'should use default for missing key');
    });
  });

  describe('setConfig()', async () => {
    test('creates config directory and file if not exist', async () => {
      const { setConfig, getConfigDir } = await import(`../lib/config.js?t=${Date.now() + 3}`);

      const result = setConfig('starPromptShown', true);

      assert.strictEqual(result, true, 'should return true on success');
      assert.ok(existsSync(getConfigDir()), 'should create config directory');
    });

    test('persists value to config file', async () => {
      const { setConfig, getConfig } = await import(`../lib/config.js?t=${Date.now() + 4}`);

      setConfig('chromiumPath', '/custom/path');

      const config = getConfig();
      assert.strictEqual(config.chromiumPath, '/custom/path', 'should persist the value');
    });

    test('preserves existing config values', async () => {
      const { setConfig, getConfig } = await import(`../lib/config.js?t=${Date.now() + 5}`);

      setConfig('starPromptShown', true);
      setConfig('chromiumPath', '/test/path');

      const config = getConfig();
      assert.strictEqual(config.starPromptShown, true, 'should preserve first value');
      assert.strictEqual(config.chromiumPath, '/test/path', 'should have second value');
    });
  });

  describe('resetConfig()', async () => {
    test('resets config to defaults', async () => {
      const { setConfig, resetConfig, getConfig } = await import(`../lib/config.js?t=${Date.now() + 6}`);

      // Set some values first
      setConfig('starPromptShown', true);
      setConfig('chromiumPath', '/custom/path');

      // Reset
      const result = resetConfig();

      assert.strictEqual(result, true, 'should return true on success');

      const config = getConfig();
      assert.strictEqual(config.starPromptShown, false, 'should reset to default');
      assert.strictEqual(config.chromiumPath, null, 'should reset to default');
    });
  });

  describe('getConfigDir() and getConfigPath()', async () => {
    test('returns correct paths', async () => {
      const { getConfigDir, getConfigPath } = await import(`../lib/config.js?t=${Date.now() + 7}`);

      const dir = getConfigDir();
      const path = getConfigPath();

      assert.ok(dir.endsWith('.banana-browser'), 'config dir should end with .banana-browser');
      assert.ok(path.endsWith('config.json'), 'config path should end with config.json');
      assert.ok(path.startsWith(dir), 'config path should be inside config dir');
    });
  });
});
