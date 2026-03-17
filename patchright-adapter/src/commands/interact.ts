/**
 * Interaction Command Handlers
 * click, fill, type commands
 */

import { registerCommand } from '../index.js';
import { requireSession } from '../browser.js';
import {
  ClickParams,
  FillParams,
  TypeParams,
  ActionResult,
  ErrorCodes,
} from '../types.js';
import { Locator } from 'patchright';

/**
 * Resolve selector to Patchright locator
 * Supports: @ref, CSS, xpath=, text=
 */
function resolveSelector(selector: string): Locator {
  const session = requireSession();

  // Element ref from snapshot
  if (selector.startsWith('@')) {
    const ref = selector.slice(1);
    const locator = session.elementRefs.get(ref);
    if (!locator) {
      throw {
        code: ErrorCodes.ELEMENT_NOT_FOUND,
        message: `Element ref not found: ${selector}`,
      };
    }
    return locator;
  }

  // XPath selector
  if (selector.startsWith('xpath=')) {
    return session.page.locator(selector);
  }

  // Text selector
  if (selector.startsWith('text=')) {
    return session.page.locator(selector);
  }

  // CSS selector (default)
  return session.page.locator(selector);
}

// Click command
registerCommand('click', async (params: unknown): Promise<ActionResult> => {
  const p = params as ClickParams;

  if (!p.selector) {
    throw { code: ErrorCodes.INVALID_PARAMS, message: 'Missing required parameter: selector' };
  }

  try {
    const locator = resolveSelector(p.selector);
    await locator.click();
    return { success: true };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      throw error;
    }
    throw {
      code: ErrorCodes.ELEMENT_NOT_FOUND,
      message: `Click failed: ${error instanceof Error ? error.message : 'Element not found'}`,
    };
  }
});

// Fill command (clears field first)
registerCommand('fill', async (params: unknown): Promise<ActionResult> => {
  const p = params as FillParams;

  if (!p.selector) {
    throw { code: ErrorCodes.INVALID_PARAMS, message: 'Missing required parameter: selector' };
  }
  if (p.value === undefined) {
    throw { code: ErrorCodes.INVALID_PARAMS, message: 'Missing required parameter: value' };
  }

  try {
    const locator = resolveSelector(p.selector);
    await locator.fill(p.value);
    return { success: true };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      throw error;
    }
    throw {
      code: ErrorCodes.ELEMENT_NOT_FOUND,
      message: `Fill failed: ${error instanceof Error ? error.message : 'Element not found'}`,
    };
  }
});

// Type command (types character by character)
registerCommand('type', async (params: unknown): Promise<ActionResult> => {
  const p = params as TypeParams;

  if (!p.selector) {
    throw { code: ErrorCodes.INVALID_PARAMS, message: 'Missing required parameter: selector' };
  }
  if (!p.text) {
    throw { code: ErrorCodes.INVALID_PARAMS, message: 'Missing required parameter: text' };
  }

  try {
    const locator = resolveSelector(p.selector);
    await locator.pressSequentially(p.text, { delay: p.delay ?? 0 });
    return { success: true };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      throw error;
    }
    throw {
      code: ErrorCodes.ELEMENT_NOT_FOUND,
      message: `Type failed: ${error instanceof Error ? error.message : 'Element not found'}`,
    };
  }
});
