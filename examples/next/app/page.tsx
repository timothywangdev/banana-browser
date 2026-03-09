"use client";

import { useState } from "react";
import { takeScreenshot, takeSnapshot } from "./actions/browse";
import type { ScreenshotResult, SnapshotResult, Mode } from "./actions/browse";

export default function Home() {
  const [url, setUrl] = useState("https://example.com");
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<"screenshot" | "snapshot">("screenshot");
  const [mode, setMode] = useState<Mode>("external");
  const [screenshotResult, setScreenshotResult] =
    useState<ScreenshotResult | null>(null);
  const [snapshotResult, setSnapshotResult] =
    useState<SnapshotResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setScreenshotResult(null);
    setSnapshotResult(null);

    if (action === "screenshot") {
      const result = await takeScreenshot(url, mode);
      setScreenshotResult(result);
    } else {
      const result = await takeSnapshot(url, mode);
      setSnapshotResult(result);
    }
    setLoading(false);
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        agent-browser + Next.js
      </h1>
      <p style={{ color: "#666", marginBottom: 32 }}>
        Browser automation from Vercel serverless functions. Pick a mode
        and try it out.
      </p>

      <form onSubmit={handleSubmit} style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            required
            style={{
              flex: 1,
              padding: "10px 14px",
              fontSize: 15,
              border: "1px solid #ddd",
              borderRadius: 8,
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "10px 20px",
              fontSize: 15,
              fontWeight: 600,
              background: loading ? "#999" : "#000",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading ? "Running..." : "Go"}
          </button>
        </div>

        <fieldset
          style={{
            border: "1px solid #eee",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 12,
          }}
        >
          <legend style={{ fontSize: 13, fontWeight: 600, color: "#666", padding: "0 4px" }}>
            Mode
          </legend>
          <div style={{ display: "flex", gap: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="radio"
                name="mode"
                checked={mode === "external"}
                onChange={() => setMode("external")}
              />
              <span>
                <strong>External server</strong>
                <br />
                <span style={{ fontSize: 12, color: "#888" }}>
                  Calls your agent-browser API server
                </span>
              </span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="radio"
                name="mode"
                checked={mode === "sandbox"}
                onChange={() => setMode("sandbox")}
              />
              <span>
                <strong>Vercel Sandbox</strong>
                <br />
                <span style={{ fontSize: 12, color: "#888" }}>
                  Runs agent-browser in an ephemeral microVM
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <div style={{ display: "flex", gap: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input
              type="radio"
              name="action"
              checked={action === "screenshot"}
              onChange={() => setAction("screenshot")}
            />
            Screenshot
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input
              type="radio"
              name="action"
              checked={action === "snapshot"}
              onChange={() => setAction("snapshot")}
            />
            Snapshot (accessibility tree)
          </label>
        </div>
      </form>

      {screenshotResult && (
        <div>
          {screenshotResult.ok ? (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
                {screenshotResult.title}
              </h2>
              <img
                src={`data:image/png;base64,${screenshotResult.screenshot}`}
                alt={screenshotResult.title}
                style={{
                  width: "100%",
                  borderRadius: 8,
                  border: "1px solid #eee",
                }}
              />
            </>
          ) : (
            <div style={{ padding: 16, background: "#fee", borderRadius: 8, color: "#900" }}>
              {screenshotResult.error}
            </div>
          )}
        </div>
      )}

      {snapshotResult && (
        <div>
          {snapshotResult.ok ? (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
                {snapshotResult.title}
              </h2>
              <pre
                style={{
                  background: "#f5f5f5",
                  padding: 16,
                  borderRadius: 8,
                  overflow: "auto",
                  fontSize: 13,
                  lineHeight: 1.5,
                  maxHeight: 500,
                }}
              >
                {snapshotResult.snapshot}
              </pre>
            </>
          ) : (
            <div style={{ padding: 16, background: "#fee", borderRadius: 8, color: "#900" }}>
              {snapshotResult.error}
            </div>
          )}
        </div>
      )}

      <section style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid #eee" }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
          Architecture
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
              External server
            </h3>
            <p style={{ fontSize: 13, color: "#666", lineHeight: 1.6 }}>
              You run agent-browser + Chrome on a server (Docker on
              Railway/Fly/Render). Your Next.js server action calls it
              over HTTP. Best for long-running workflows and shared browser
              sessions.
            </p>
            <pre style={preStyle}>
{`Vercel          Your server
+--------+      +------------------+
| Action | ---> | API server       |
+--------+      | agent-browser    |
                | Chrome           |
                +------------------+`}
            </pre>
          </div>

          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
              Vercel Sandbox
            </h3>
            <p style={{ fontSize: 13, color: "#666", lineHeight: 1.6 }}>
              A Linux microVM spins up on demand, runs agent-browser +
              Chrome, and shuts down. No external server needed. Best for
              one-off tasks under ~60s. Use snapshots for fast startup.
            </p>
            <pre style={preStyle}>
{`Vercel
+--------+    +------------------+
| Action | -> | Sandbox (microVM)|
+--------+    | agent-browser    |
              | Chrome           |
              +------------------+`}
            </pre>
          </div>
        </div>
      </section>
    </main>
  );
}

const preStyle: React.CSSProperties = {
  background: "#f5f5f5",
  padding: 12,
  borderRadius: 8,
  fontSize: 11,
  lineHeight: 1.5,
  overflow: "auto",
  marginTop: 8,
};
