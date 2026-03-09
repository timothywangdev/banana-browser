# agent-browser Environments

A demo of agent-browser running in a Vercel Sandbox. Enter a URL and take a screenshot or accessibility snapshot.

## How It Works

The app runs agent-browser + Chrome inside an ephemeral Vercel Sandbox microVM. A Linux VM spins up on demand, executes agent-browser commands, and shuts down. No binary size limits, no Chromium bundling complexity.

## Getting Started

```bash
cd examples/environments
pnpm install
pnpm dev
```

## Sandbox Snapshots

Without optimization, each Sandbox run installs agent-browser + Chromium from scratch (~30s). A **sandbox snapshot** is a saved VM image with everything pre-installed -- the sandbox boots from the image instead of installing, bringing startup down to sub-second. (This is unrelated to agent-browser's *accessibility snapshot* feature, which dumps a page's accessibility tree.)

Create a sandbox snapshot by running the helper script once:

```bash
npx tsx scripts/create-snapshot.ts
# Output: AGENT_BROWSER_SNAPSHOT_ID=snap_xxxxxxxxxxxx
```

Add the ID to your Vercel project environment variables or `.env.local`. Recommended for production.

## Environment Variables

| Variable | Description |
|---|---|
| `AGENT_BROWSER_SNAPSHOT_ID` | Sandbox snapshot ID for sub-second startup (see above) |
| `KV_REST_API_URL` | Upstash Redis URL for rate limiting (optional) |
| `KV_REST_API_TOKEN` | Upstash Redis token for rate limiting (optional) |
| `RATE_LIMIT_PER_MINUTE` | Max requests per minute per IP (default: 10) |
| `RATE_LIMIT_PER_DAY` | Max requests per day per IP (default: 100) |

## Project Structure

```
examples/environments/
  app/
    page.tsx                  # Demo UI
    actions/browse.ts         # Server actions
    api/browse/route.ts       # API route for programmatic access
  lib/
    agent-browser-sandbox.ts  # Vercel Sandbox client
    constants.ts              # Allowed URLs
    rate-limit.ts             # Upstash rate limiting
  scripts/
    create-snapshot.ts        # Create sandbox snapshot
```
