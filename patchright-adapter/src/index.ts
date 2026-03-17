#!/usr/bin/env node
/**
 * Patchright Adapter - JSON-RPC 2.0 Server
 *
 * Receives commands via stdin, executes them through Patchright,
 * and returns results via stdout.
 */

// Record startup time immediately
const startupTime = performance.now();

import * as readline from 'readline';
import {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError,
  ErrorCodes,
} from './types.js';

// Debug logging utility - logs to stderr to avoid interfering with JSON-RPC stdout
function debug(message: string): void {
  console.error(`[DEBUG] ${message}`);
}

// Command handlers will be registered here
type CommandHandler = (params: unknown) => Promise<unknown>;
const commandRegistry = new Map<string, CommandHandler>();

// Track whether command modules have been loaded (lazy loading)
let commandsLoaded = false;

// Register a command handler
export function registerCommand(method: string, handler: CommandHandler): void {
  commandRegistry.set(method, handler);
}

// Create JSON-RPC error response
function createErrorResponse(id: number, error: JsonRpcError): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error,
  };
}

// Create JSON-RPC success response
function createSuccessResponse(id: number, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

// Parse and validate JSON-RPC request
function parseRequest(line: string): JsonRpcRequest | { error: JsonRpcError; id: number } {
  let parsed: unknown;

  try {
    parsed = JSON.parse(line);
  } catch {
    return {
      error: { code: ErrorCodes.PARSE_ERROR, message: 'Invalid JSON' },
      id: 0,
    };
  }

  const req = parsed as Record<string, unknown>;

  if (req.jsonrpc !== '2.0') {
    return {
      error: { code: ErrorCodes.INVALID_REQUEST, message: 'Invalid JSON-RPC version' },
      id: (typeof req.id === 'number' ? req.id : 0),
    };
  }

  if (typeof req.id !== 'number') {
    return {
      error: { code: ErrorCodes.INVALID_REQUEST, message: 'Missing or invalid id' },
      id: 0,
    };
  }

  if (typeof req.method !== 'string') {
    return {
      error: { code: ErrorCodes.INVALID_REQUEST, message: 'Missing or invalid method' },
      id: req.id,
    };
  }

  return req as unknown as JsonRpcRequest;
}

// Lazy load command handlers on first command
async function ensureCommandsLoaded(): Promise<void> {
  if (commandsLoaded) return;

  const loadStart = performance.now();

  // Import command modules - these register themselves
  await Promise.all([
    import('./commands/launch.js'),
    import('./commands/navigate.js'),
    import('./commands/interact.js'),
    import('./commands/query.js'),
    import('./commands/session.js'),
  ]);

  commandsLoaded = true;
  const loadTime = (performance.now() - loadStart).toFixed(2);
  debug(`Command handlers loaded in ${loadTime}ms`);
}

// Execute a command
async function executeCommand(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const commandStart = performance.now();

  // Ensure commands are loaded (lazy loading on first command)
  await ensureCommandsLoaded();

  const handler = commandRegistry.get(request.method);

  if (!handler) {
    return createErrorResponse(request.id, {
      code: ErrorCodes.METHOD_NOT_FOUND,
      message: `Unknown method: ${request.method}`,
    });
  }

  try {
    const result = await handler(request.params ?? {});
    const elapsed = (performance.now() - commandStart).toFixed(2);
    debug(`Command ${request.method} completed in ${elapsed}ms`);
    return createSuccessResponse(request.id, result);
  } catch (error: unknown) {
    const elapsed = (performance.now() - commandStart).toFixed(2);
    debug(`Command ${request.method} failed in ${elapsed}ms`);

    // Handle structured errors from handlers
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      return createErrorResponse(request.id, error as JsonRpcError);
    }

    // Handle unexpected errors
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(request.id, {
      code: ErrorCodes.INTERNAL_ERROR,
      message,
    });
  }
}

// Send response to stdout
function sendResponse(response: JsonRpcResponse): void {
  console.log(JSON.stringify(response));
}

// Main server loop
async function main(): Promise<void> {
  // Commands are now lazy-loaded on first request for faster startup
  // This allows the adapter to be ready to accept commands immediately

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', async (line: string) => {
    if (!line.trim()) return;

    const parsed = parseRequest(line);

    if ('error' in parsed) {
      sendResponse(createErrorResponse(parsed.id, parsed.error));
      return;
    }

    const response = await executeCommand(parsed);
    sendResponse(response);
  });

  rl.on('close', () => {
    process.exit(0);
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error(JSON.stringify({
      jsonrpc: '2.0',
      id: 0,
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: `Uncaught exception: ${error.message}`,
      },
    }));
  });

  // Log startup completion time
  const elapsed = (performance.now() - startupTime).toFixed(2);
  debug(`Adapter ready in ${elapsed}ms`);
}

main().catch((error) => {
  console.error(`Failed to start adapter: ${error.message}`);
  process.exit(1);
});
