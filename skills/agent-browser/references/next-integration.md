# Next.js + Vercel Integration

Two patterns for using agent-browser from Next.js server actions on Vercel.

## Pattern 1: Vercel Sandbox (no external server)

Install `@vercel/sandbox`, create a microVM, run agent-browser CLI commands:

```ts
import { Sandbox } from "@vercel/sandbox";

const sandbox = await Sandbox.create({ runtime: "node24" });
await sandbox.runCommand("npm", ["install", "-g", "agent-browser"]);
await sandbox.runCommand("npx", ["agent-browser", "install"]);
await sandbox.runCommand("agent-browser", ["open", "https://example.com"]);
const result = await sandbox.runCommand("agent-browser", ["screenshot", "--json"]);
const stdout = await result.stdout();
await sandbox.stop();
```

Use `AGENT_BROWSER_SNAPSHOT_ID` with a pre-built snapshot for sub-second startup.

## Pattern 2: External API Server

Run agent-browser + Chrome on a server. Call it from server actions via HTTP.

### API server (minimal)

```ts
import * as http from "node:http";
import * as net from "node:net";

// Forwards HTTP POST /api/command to agent-browser daemon Unix socket
// See examples/next/server/index.ts for full implementation
```

### Server action

```ts
"use server";

const API = process.env.AGENT_BROWSER_API_URL;

export async function screenshotUrl(url: string) {
  const res = await fetch(`${API}/api/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commands: [
        { action: "launch", headless: true },
        { action: "navigate", url, waitUntil: "networkidle" },
        { action: "screenshot" },
      ],
    }),
  });
  return res.json();
}
```

### Deploy the API server

```bash
cd examples/next
docker build -t agent-browser-api .
docker run -p 3001:3001 agent-browser-api
```

Deploy to Railway, Fly.io, or Render. Set `AGENT_BROWSER_API_URL` in Vercel.

## Scheduled workflows (Vercel Cron)

```ts
// app/api/cron/route.ts
export async function GET() {
  const res = await fetch(`${process.env.AGENT_BROWSER_API_URL}/api/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commands: [
        { action: "launch", headless: true },
        { action: "navigate", url: "https://example.com" },
        { action: "snapshot", interactive: false, compact: true },
        { action: "close" },
      ],
    }),
  });
  return Response.json(await res.json());
}
```

```json
// vercel.json
{ "crons": [{ "path": "/api/cron", "schedule": "0 9 * * *" }] }
```

## Environment variables

| Variable | Pattern | Description |
|---|---|---|
| `AGENT_BROWSER_SNAPSHOT_ID` | Sandbox | Pre-built snapshot for fast startup |
| `AGENT_BROWSER_API_URL` | External | URL of your API server |
| `AGENT_BROWSER_API_SECRET` | External | Shared auth secret (optional) |

## Full example

See `examples/next/` in the agent-browser repo for a working Next.js app with both patterns, demo UI, Dockerfile, and snapshot creation script.
