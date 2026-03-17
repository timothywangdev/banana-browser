/**
 * Session Command Handler
 * close command
 */

import { registerCommand } from '../index.js';
import { closeBrowser } from '../browser.js';
import { ActionResult } from '../types.js';

// Close command - close browser and end session
registerCommand('close', async (): Promise<ActionResult> => {
  await closeBrowser();
  return { success: true };
});
