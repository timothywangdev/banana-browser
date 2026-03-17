/**
 * User configuration management module for banana-browser
 *
 * Stores user preferences at ~/.banana-browser/config.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Configuration directory path
 */
const CONFIG_DIR = join(homedir(), '.banana-browser');

/**
 * Configuration file path
 */
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

/**
 * Default configuration values
 * @type {{ starPromptShown: boolean, chromiumPath: string|null, installedVersion: string|null }}
 */
const DEFAULT_CONFIG = {
  starPromptShown: false,
  chromiumPath: null,
  installedVersion: null,
};

/**
 * Ensure the config directory exists
 */
function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Get the current configuration
 *
 * Returns default values if config file doesn't exist or is invalid.
 *
 * @returns {{ starPromptShown: boolean, chromiumPath: string|null, installedVersion: string|null }}
 *
 * @example
 * const config = getConfig();
 * if (!config.starPromptShown) {
 *   showStarPrompt();
 * }
 */
export function getConfig() {
  try {
    if (!existsSync(CONFIG_PATH)) {
      return { ...DEFAULT_CONFIG };
    }

    const content = readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(content);

    // Merge with defaults to handle missing keys from older configs
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (error) {
    // If config is corrupted, return defaults
    console.warn(`Warning: Could not read config file: ${error.message}`);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Set a configuration value
 *
 * @param {string} key - The configuration key to set
 * @param {any} value - The value to set
 * @returns {boolean} True if successful
 *
 * @example
 * setConfig('starPromptShown', true);
 * setConfig('chromiumPath', '/path/to/chromium');
 */
export function setConfig(key, value) {
  try {
    ensureConfigDir();

    const config = getConfig();
    config[key] = value;

    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.warn(`Warning: Could not save config: ${error.message}`);
    return false;
  }
}

/**
 * Reset configuration to defaults
 *
 * @returns {boolean} True if successful
 *
 * @example
 * resetConfig(); // Clears all stored preferences
 */
export function resetConfig() {
  try {
    ensureConfigDir();
    writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.warn(`Warning: Could not reset config: ${error.message}`);
    return false;
  }
}

/**
 * Get the configuration directory path
 * @returns {string}
 */
export function getConfigDir() {
  return CONFIG_DIR;
}

/**
 * Get the configuration file path
 * @returns {string}
 */
export function getConfigPath() {
  return CONFIG_PATH;
}
