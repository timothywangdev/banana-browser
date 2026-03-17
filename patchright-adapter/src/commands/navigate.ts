/**
 * Navigate Command Handler
 * Navigates to a URL
 */

import { registerCommand } from '../index.js';
import { requireSession } from '../browser.js';
import { NavigateParams, NavigateResult, ErrorCodes } from '../types.js';

registerCommand('navigate', async (params: unknown): Promise<NavigateResult> => {
  const p = params as NavigateParams;

  if (!p.url) {
    throw { code: ErrorCodes.INVALID_PARAMS, message: 'Missing required parameter: url' };
  }

  const session = requireSession();

  try {
    await session.page.goto(p.url, {
      waitUntil: p.waitUntil ?? 'load',
    });
  } catch (error) {
    throw {
      code: ErrorCodes.NAVIGATION_FAILED,
      message: error instanceof Error ? error.message : 'Navigation failed',
    };
  }

  const title = await session.page.title();
  const url = session.page.url();

  return { url, title };
});
