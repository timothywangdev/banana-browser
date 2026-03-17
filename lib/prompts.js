/**
 * Prompts module for banana-browser
 *
 * Handles tasteful promotional prompts like GitHub star CTA.
 * Shows prompts once and remembers user has seen them.
 */

import { getConfig, setConfig } from './config.js';

// Dynamic import for chalk
let chalk;

async function initChalk() {
  if (chalk) return chalk;

  try {
    const chalkModule = await import('chalk');
    chalk = chalkModule.default;
  } catch {
    chalk = {
      yellow: (s) => s,
      cyan: (s) => s,
      bold: (s) => s,
      dim: (s) => s,
    };
  }

  return chalk;
}

/**
 * Check if the star prompt should be shown
 *
 * Returns true only if the user hasn't seen the prompt before.
 *
 * @returns {boolean} True if prompt should be shown
 *
 * @example
 * if (shouldShowStarPrompt()) {
 *   await showStarPrompt();
 * }
 */
export function shouldShowStarPrompt() {
  const config = getConfig();
  return config.starPromptShown !== true;
}

/**
 * Show the GitHub star prompt to the user
 *
 * Displays a tasteful prompt asking users to star the repo.
 * Automatically marks the prompt as shown so it won't appear again.
 *
 * @param {Object} options - Options for the prompt
 * @param {boolean} [options.quiet=false] - If true, suppress output but still mark as shown
 * @returns {Promise<void>}
 *
 * @example
 * // Show prompt after successful demo
 * await showStarPrompt();
 *
 * @example
 * // Suppress output in CI but prevent future prompts
 * await showStarPrompt({ quiet: true });
 */
export async function showStarPrompt(options = {}) {
  const { quiet = false } = options;

  // Mark as shown first (even if quiet) so it doesn't appear later
  setConfig('starPromptShown', true);

  // If quiet mode, don't display anything
  if (quiet) {
    return;
  }

  await initChalk();

  console.log('');
  console.log(chalk.dim('  ─────────────────────────────────────────'));
  console.log('');
  console.log(chalk.yellow('  Enjoying banana-browser?'));
  console.log('');
  console.log('  Help us grow by starring the repo:');
  console.log(chalk.cyan('  ') + chalk.bold('https://github.com/timothywangdev/banana-browser'));
  console.log('');
  console.log(chalk.dim('  Your star helps others discover this tool!'));
  console.log('');
}
