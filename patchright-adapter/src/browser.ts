/**
 * Patchright Browser Wrapper
 * Manages browser lifecycle and session state
 */

import { chromium, Browser, BrowserContext, Page } from 'patchright';
import { BrowserSession, LaunchParams, ErrorCodes } from './types.js';

let currentSession: BrowserSession | null = null;
let refCounter = 0;

export function getSession(): BrowserSession | null {
  return currentSession;
}

// Default args for anti-detection
// Note: WebGL flags removed - Patchright handles WebGL natively
// SwiftShader explicitly avoided as it's detected by bot scanners
const DEFAULT_ARGS = [
  // Disable automation indicators
  '--disable-blink-features=AutomationControlled',
];

export async function launchBrowser(params: LaunchParams): Promise<BrowserSession> {
  if (currentSession) {
    throw {
      code: ErrorCodes.INTERNAL_ERROR,
      message: 'Browser session already exists. Close it first.',
    };
  }

  // Merge default args with user-provided args
  const userArgs = params.args ?? [];
  const allArgs = [...DEFAULT_ARGS, ...userArgs];

  const browser = await chromium.launch({
    headless: params.headless ?? true,
    args: allArgs,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  const sessionId = `session-${Date.now()}`;

  currentSession = {
    sessionId,
    browser,
    context,
    page,
    elementRefs: new Map(),
  };

  return currentSession;
}

export async function closeBrowser(): Promise<void> {
  if (!currentSession) {
    throw {
      code: ErrorCodes.SESSION_NOT_STARTED,
      message: 'No browser session to close.',
    };
  }

  await currentSession.browser.close();
  currentSession = null;
  refCounter = 0;
}

export function requireSession(): BrowserSession {
  if (!currentSession) {
    throw {
      code: ErrorCodes.SESSION_NOT_STARTED,
      message: 'Browser session not started. Call launch first.',
    };
  }
  return currentSession;
}

export function generateRef(): string {
  refCounter++;
  return `e${refCounter}`;
}

export function resetRefs(): void {
  if (currentSession) {
    currentSession.elementRefs.clear();
  }
  refCounter = 0;
}
