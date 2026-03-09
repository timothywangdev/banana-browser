"use server";

import * as external from "@/lib/agent-browser";
import * as sandbox from "@/lib/agent-browser-sandbox";

export type ScreenshotResult = {
  ok: boolean;
  screenshot?: string;
  title?: string;
  error?: string;
};

export type SnapshotResult = {
  ok: boolean;
  snapshot?: string;
  title?: string;
  error?: string;
};

export type Mode = "external" | "sandbox";

/**
 * Server action: screenshot a URL.
 *
 * mode="external" -- calls an external agent-browser API server (you host it)
 * mode="sandbox"  -- runs agent-browser inside a Vercel Sandbox (no server needed)
 */
export async function takeScreenshot(
  url: string,
  mode: Mode = "external",
): Promise<ScreenshotResult> {
  try {
    if (mode === "sandbox") {
      const { screenshot, title } = await sandbox.screenshotUrl(url);
      return { ok: true, screenshot, title };
    }

    const { screenshot, title } = await external.screenshotUrl(url, {
      waitUntil: "networkidle",
    });
    return { ok: true, screenshot, title };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Server action: snapshot a URL (accessibility tree).
 *
 * mode="external" -- calls an external agent-browser API server
 * mode="sandbox"  -- runs agent-browser inside a Vercel Sandbox
 */
export async function takeSnapshot(
  url: string,
  mode: Mode = "external",
): Promise<SnapshotResult> {
  try {
    if (mode === "sandbox") {
      const { snapshot, title } = await sandbox.snapshotUrl(url, {
        interactive: true,
        compact: true,
      });
      return { ok: true, snapshot, title };
    }

    const { snapshot, title } = await external.snapshotUrl(url, {
      interactive: true,
      compact: true,
    });
    return { ok: true, snapshot, title };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
