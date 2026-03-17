/**
 * Launch Command Handler
 * Starts a browser session with Patchright
 */

import { registerCommand } from '../index.js';
import { launchBrowser } from '../browser.js';
import { LaunchParams, LaunchResult } from '../types.js';

registerCommand('launch', async (params: unknown): Promise<LaunchResult> => {
  const p = params as LaunchParams;
  const session = await launchBrowser(p);
  return { sessionId: session.sessionId };
});
