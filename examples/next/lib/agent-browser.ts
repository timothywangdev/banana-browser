/**
 * Client for the agent-browser API server.
 *
 * In production, AGENT_BROWSER_API_URL points to your deployed
 * agent-browser API server (Docker on Railway/Fly/Render/etc.).
 * Locally, it defaults to http://localhost:3001.
 */

const API_URL =
  process.env.AGENT_BROWSER_API_URL || "http://localhost:3001";

const API_SECRET = process.env.AGENT_BROWSER_API_SECRET;

export type Command = {
  action: string;
  [key: string]: unknown;
};

export type CommandResult = {
  success: boolean;
  id: string;
  data?: Record<string, unknown>;
  error?: string;
};

async function request<T = CommandResult>(
  path: string,
  body: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (API_SECRET) {
    headers["Authorization"] = `Bearer ${API_SECRET}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`agent-browser API error (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

/** Send a single command to agent-browser. */
export async function command(cmd: Command): Promise<CommandResult> {
  return request<CommandResult>("/api/command", cmd);
}

/** Run a sequence of commands. Stops on first failure. */
export async function run(
  commands: Command[],
): Promise<{ results: CommandResult[] }> {
  return request<{ results: CommandResult[] }>("/api/run", { commands });
}

/** Health check -- is the daemon running? */
export async function health(): Promise<{
  ok: boolean;
  daemon: boolean;
  session: string;
}> {
  const res = await fetch(`${API_URL}/health`);
  return res.json();
}

/**
 * Convenience: screenshot a URL and return base64 image data.
 * This is the "one-off task" pattern for server actions.
 */
export async function screenshotUrl(
  url: string,
  opts: { fullPage?: boolean; waitUntil?: string } = {},
): Promise<{ screenshot: string; title: string }> {
  const commands: Command[] = [
    { action: "launch", headless: true },
    {
      action: "navigate",
      url,
      ...(opts.waitUntil && { waitUntil: opts.waitUntil }),
    },
    { action: "title" },
    {
      action: "screenshot",
      ...(opts.fullPage && { fullPage: true }),
    },
  ];

  const { results } = await run(commands);

  const titleResult = results.find((r) => r.data?.title);
  const screenshotResult = results.find((r) => r.data?.base64);

  return {
    title: (titleResult?.data?.title as string) || url,
    screenshot: (screenshotResult?.data?.base64 as string) || "",
  };
}

/**
 * Convenience: snapshot a URL and return the accessibility tree.
 * Useful for scraping or content extraction.
 */
export async function snapshotUrl(
  url: string,
  opts: { interactive?: boolean; compact?: boolean; selector?: string } = {},
): Promise<{ snapshot: string; title: string }> {
  const commands: Command[] = [
    { action: "launch", headless: true },
    { action: "navigate", url, waitUntil: "load" },
    { action: "title" },
    {
      action: "snapshot",
      ...(opts.interactive && { interactive: true }),
      ...(opts.compact && { compact: true }),
      ...(opts.selector && { selector: opts.selector }),
    },
  ];

  const { results } = await run(commands);

  const titleResult = results.find((r) => r.data?.title);
  const snapshotResult = results.find((r) => r.data?.snapshot);

  return {
    title: (titleResult?.data?.title as string) || url,
    snapshot: (snapshotResult?.data?.snapshot as string) || "",
  };
}
