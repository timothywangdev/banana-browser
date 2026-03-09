# agent-browser + Next.js on Vercel

Two patterns for running agent-browser from Next.js server actions on Vercel.

## Pattern 1: Vercel Sandbox (recommended for one-off tasks)

A Linux microVM spins up on demand, runs agent-browser + Chrome, returns the result, and shuts down. No external server needed.

```
Vercel serverless         Vercel Sandbox (microVM)
+------------------+      +------------------------+
| Server action    | ---> | agent-browser          |
|   Sandbox.create |      | Chrome (headless)      |
|   runCommand()   |      +------------------------+
+------------------+
```

### Setup

```bash
cd examples/next
pnpm install
vercel link        # Connect to your Vercel project
vercel env pull    # Pull OIDC token for Sandbox SDK
pnpm dev
```

### Optimize with snapshots

First run installs agent-browser + Chromium in the sandbox (~30s). Create a snapshot to make it sub-second:

```bash
npx tsx scripts/create-snapshot.ts
# Output: AGENT_BROWSER_SNAPSHOT_ID=snap_xxxxxxxxxxxx
```

Add the snapshot ID to your Vercel environment variables or `.env.local`.

## Pattern 2: External API server (recommended for long workflows)

You run agent-browser + Chrome on a server. Your Next.js server action calls it over HTTP. Best for workflows that take minutes, need persistent browser sessions, or run on a schedule.

```
Vercel serverless         Your server (Docker)
+------------------+      +------------------------+
| Server action    | ---> | API server (:3001)     |
|   fetch()        |      | agent-browser daemon   |
+------------------+      | Chrome (headless)      |
                          +------------------------+
```

### Local development

Terminal 1 -- start agent-browser + API server:

```bash
agent-browser open https://example.com  # Start daemon
cd examples/next/server
pnpm install
pnpm dev                                # API server on :3001
```

Terminal 2 -- start Next.js:

```bash
cd examples/next
pnpm install
pnpm dev                                # Next.js on :3000
```

### Deploy the API server

Build and deploy the Docker image to Railway, Fly.io, Render, or any container host:

```bash
cd examples/next
docker build -t agent-browser-api .
docker run -p 3001:3001 agent-browser-api
```

Then set `AGENT_BROWSER_API_URL` in your Vercel project environment variables:

```
AGENT_BROWSER_API_URL=https://your-agent-browser-api.fly.dev
```

## Scheduled workflows (cron)

For recurring tasks (e.g., daily price monitoring), use Vercel Cron Jobs to trigger a route handler:

```ts
// app/api/cron/monitor/route.ts
import * as ab from "@/lib/agent-browser";

export async function GET() {
  const { results } = await ab.run([
    { action: "launch", headless: true },
    { action: "navigate", url: "https://example.com/pricing" },
    { action: "snapshot", interactive: false, compact: true },
    { action: "close" },
  ]);

  // Process results, send alerts, store data...
  return Response.json({ ok: true, results });
}
```

Add to `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/monitor", "schedule": "0 9 * * *" }
  ]
}
```

## Environment variables

| Variable | Mode | Description |
|---|---|---|
| `AGENT_BROWSER_API_URL` | External | URL of your agent-browser API server |
| `AGENT_BROWSER_API_SECRET` | External | Shared secret for auth (optional) |
| `AGENT_BROWSER_SNAPSHOT_ID` | Sandbox | Pre-built snapshot ID for fast startup |

## Project structure

```
examples/next/
  app/
    page.tsx                  # Demo UI
    actions/browse.ts         # Server actions (both modes)
    api/browse/route.ts       # API route for programmatic access
  lib/
    agent-browser.ts          # External API server client
    agent-browser-sandbox.ts  # Vercel Sandbox client
  server/
    index.ts                  # HTTP proxy (external mode only)
  scripts/
    create-snapshot.ts        # Create sandbox snapshot
  Dockerfile                  # Deploy the API server
```
