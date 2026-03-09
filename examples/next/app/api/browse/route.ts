import { NextRequest, NextResponse } from "next/server";
import * as ab from "@/lib/agent-browser";

/**
 * POST /api/browse
 *
 * Programmatic API route for running agent-browser commands from Vercel.
 * Forwards commands to the external agent-browser API server.
 *
 * Body: { "commands": [{ "action": "navigate", "url": "..." }, ...] }
 * Or:   { "action": "screenshot", ... }  (single command shorthand)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.commands) {
      const result = await ab.run(body.commands);
      return NextResponse.json(result);
    }

    if (body.action) {
      const result = await ab.command(body);
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "Provide 'action' or 'commands'" },
      { status: 400 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
