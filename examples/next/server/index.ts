import * as http from "node:http";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";

const PORT = parseInt(process.env.PORT || "3001", 10);
const SESSION = process.env.AGENT_BROWSER_SESSION || "default";

function getSocketDir(): string {
  if (process.env.AGENT_BROWSER_SOCKET_DIR)
    return process.env.AGENT_BROWSER_SOCKET_DIR;
  if (process.env.XDG_RUNTIME_DIR)
    return path.join(process.env.XDG_RUNTIME_DIR, "agent-browser");
  const home = os.homedir();
  return home
    ? path.join(home, ".agent-browser")
    : path.join(os.tmpdir(), "agent-browser");
}

function getSocketPath(session: string): string {
  return path.join(getSocketDir(), `${session}.sock`);
}

function sendCommand(
  session: string,
  cmd: Record<string, unknown>,
  timeoutMs = 60_000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const socketPath = getSocketPath(session);
    if (!fs.existsSync(socketPath)) {
      reject(new Error(`Daemon socket not found at ${socketPath}. Is agent-browser running?`));
      return;
    }

    const client = net.createConnection({ path: socketPath }, () => {
      client.write(JSON.stringify(cmd) + "\n");
    });

    let data = "";
    client.on("data", (chunk) => {
      data += chunk.toString();
      const idx = data.indexOf("\n");
      if (idx !== -1) {
        const line = data.slice(0, idx);
        client.destroy();
        try {
          resolve(JSON.parse(line));
        } catch {
          reject(new Error(`Invalid JSON from daemon: ${line}`));
        }
      }
    });

    client.on("error", (err) => reject(err));
    client.on("timeout", () => {
      client.destroy();
      reject(new Error("Socket timeout"));
    });
    client.setTimeout(timeoutMs);
  });
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function cors(res: http.ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

let commandCounter = 0;

const server = http.createServer(async (req, res) => {
  cors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    const socketPath = getSocketPath(SESSION);
    const daemonUp = fs.existsSync(socketPath);
    json(res, 200, { ok: true, daemon: daemonUp, session: SESSION });
    return;
  }

  if (req.method === "POST" && req.url === "/api/command") {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body.action) {
        json(res, 400, { error: "Missing 'action' field" });
        return;
      }
      const id = body.id || `cmd-${++commandCounter}`;
      const cmd = { ...body, id };
      const result = await sendCommand(SESSION, cmd);
      json(res, 200, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 502, { error: message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/run") {
    try {
      const body = JSON.parse(await readBody(req));
      const commands: Record<string, unknown>[] = body.commands;
      if (!Array.isArray(commands) || commands.length === 0) {
        json(res, 400, { error: "Expected 'commands' array" });
        return;
      }
      const results: Record<string, unknown>[] = [];
      for (const cmd of commands) {
        const id = (cmd.id as string) || `cmd-${++commandCounter}`;
        const result = await sendCommand(SESSION, { ...cmd, id });
        results.push(result);
        if (!(result as { success?: boolean }).success) break;
      }
      json(res, 200, { results });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 502, { error: message });
    }
    return;
  }

  json(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`agent-browser API server listening on http://localhost:${PORT}`);
  console.log(`Session: ${SESSION}`);
  console.log(`Socket: ${getSocketPath(SESSION)}`);
});
