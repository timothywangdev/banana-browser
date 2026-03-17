/**
 * JSON-RPC 2.0 Types for Patchright Adapter
 * Based on data-model.md and contracts/json-rpc.md
 */

// JSON-RPC 2.0 Base Types
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: number;
  result: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: number;
  error: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

// Error Codes (from contracts/json-rpc.md)
export const ErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  ELEMENT_NOT_FOUND: -32000,
  NAVIGATION_FAILED: -32001,
  TIMEOUT: -32002,
  BROWSER_CRASHED: -32003,
  SESSION_NOT_STARTED: -32004,
} as const;

// Command Parameter Types
export interface LaunchParams {
  headless?: boolean;
  args?: string[];
}

export interface NavigateParams {
  url: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}

export interface ClickParams {
  selector: string;
}

export interface FillParams {
  selector: string;
  value: string;
}

export interface TypeParams {
  selector: string;
  text: string;
  delay?: number;
}

export interface ScreenshotParams {
  path?: string;
  fullPage?: boolean;
  format?: 'png' | 'jpeg';
}

export interface SnapshotParams {
  interestingOnly?: boolean;
}

export interface EvaluateParams {
  expression: string;
}

// Response Result Types
export interface LaunchResult {
  sessionId: string;
}

export interface NavigateResult {
  url: string;
  title: string;
}

export interface ActionResult {
  success: boolean;
}

export interface ScreenshotResult {
  path?: string;
  base64?: string;
}

export interface SnapshotResult {
  tree: string;
  refs: Record<string, ElementRef>;
}

export interface ElementRef {
  role: string;
  name: string;
}

export interface EvaluateResult {
  result: unknown;
}

// Browser Session State (internal)
export interface BrowserSession {
  sessionId: string;
  browser: import('patchright').Browser;
  context: import('patchright').BrowserContext;
  page: import('patchright').Page;
  elementRefs: Map<string, import('patchright').Locator>;
}

// Command Handler Type
export type CommandHandler<P = unknown, R = unknown> = (
  session: BrowserSession | null,
  params: P
) => Promise<R>;
