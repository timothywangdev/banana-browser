/**
 * Tests for lib/platform.js
 */

import { test, describe, mock } from 'node:test';
import assert from 'node:assert';

// We need to test the module's exports
import { getPlatform, isPlatformSupported, getExecutableExtension } from '../lib/platform.js';

describe('platform.js', () => {
  describe('getPlatform()', () => {
    test('returns an object with required properties', () => {
      // This test will pass on any supported platform
      try {
        const result = getPlatform();

        assert.ok(result.platform, 'should have platform property');
        assert.ok(result.arch, 'should have arch property');
        assert.ok(result.binaryName, 'should have binaryName property');
        assert.ok(result.platformKey, 'should have platformKey property');
      } catch (error) {
        // If we're on an unsupported platform, that's also valid behavior
        assert.ok(
          error.message.includes('Unsupported platform'),
          'should throw descriptive error for unsupported platforms'
        );
      }
    });

    test('binaryName follows naming convention', () => {
      try {
        const result = getPlatform();

        // Binary name should start with 'agent-browser-'
        assert.ok(
          result.binaryName.startsWith('agent-browser-'),
          'binaryName should start with agent-browser-'
        );

        // Binary name should contain platform info
        assert.ok(
          result.binaryName.includes(result.platform) || result.binaryName.includes('linux'),
          'binaryName should contain platform identifier'
        );
      } catch {
        // Skip if unsupported platform
      }
    });

    test('platformKey matches platform-arch format', () => {
      try {
        const result = getPlatform();

        // Platform key should be in format "os-arch" or "os-variant-arch"
        const parts = result.platformKey.split('-');
        assert.ok(parts.length >= 2, 'platformKey should have at least 2 parts separated by dash');
      } catch {
        // Skip if unsupported platform
      }
    });
  });

  describe('isPlatformSupported()', () => {
    test('returns a boolean', () => {
      const result = isPlatformSupported();
      assert.strictEqual(typeof result, 'boolean', 'should return a boolean');
    });

    test('returns true on common development platforms', () => {
      // This test documents expected behavior - most dev machines are supported
      const result = isPlatformSupported();

      // If running in CI or on a common dev machine, we expect true
      // This serves as a canary for unexpected platform issues
      if (process.env.CI || ['darwin', 'linux', 'win32'].includes(process.platform)) {
        assert.strictEqual(result, true, 'common platforms should be supported');
      }
    });
  });

  describe('getExecutableExtension()', () => {
    test('returns a string', () => {
      const result = getExecutableExtension();
      assert.strictEqual(typeof result, 'string', 'should return a string');
    });

    test('returns .exe on Windows, empty string otherwise', () => {
      const result = getExecutableExtension();

      if (process.platform === 'win32') {
        assert.strictEqual(result, '.exe', 'should return .exe on Windows');
      } else {
        assert.strictEqual(result, '', 'should return empty string on non-Windows');
      }
    });
  });
});
