/**
 * Node.js Daemon vs Rust Native Daemon benchmark.
 *
 * Compares the published npm version (Node.js daemon, from main) against
 * the Rust-only build from ctate/native-2, running real agent-browser
 * commands inside a Vercel Sandbox.
 *
 * Captures:
 *   - Command latency (per-scenario, with warmup + measured iterations)
 *   - Cold start time (first launch to daemon ready)
 *   - Daemon memory (RSS, peak RSS via /proc)
 *   - Daemon CPU time (user + system)
 *   - Process tree (daemon + children)
 *   - Binary size on disk
 *
 * Usage:
 *   pnpm bench                        # default: 5 iterations, 1 warmup
 *   pnpm bench -- --iterations 10     # override iterations
 *   pnpm bench -- --warmup 2          # override warmup count
 *   pnpm bench -- --json              # write results.json
 *   pnpm bench -- --branch my-branch  # override native branch (default: ctate/native-2)
 *   pnpm bench -- --vcpus 8           # sandbox vCPUs (default: 8, higher = faster Rust build)
 */

import { Sandbox } from "@vercel/sandbox";
import { readFileSync, writeFileSync } from "fs";
import { scenarios, type Scenario } from "./scenarios.js";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

function loadEnv() {
  try {
    const content = readFileSync(".env", "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq);
      let val = trimmed.slice(eq + 1);
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {}
}
loadEnv();

const credentials = {
  token: process.env.SANDBOX_VERCEL_TOKEN!,
  teamId: process.env.SANDBOX_VERCEL_TEAM_ID!,
  projectId: process.env.SANDBOX_VERCEL_PROJECT_ID!,
};

if (!credentials.token || !credentials.teamId || !credentials.projectId) {
  console.error(
    "Missing credentials. Set SANDBOX_VERCEL_TOKEN, SANDBOX_VERCEL_TEAM_ID, SANDBOX_VERCEL_PROJECT_ID in .env",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  let iterations = 5;
  let warmup = 1;
  let json = false;
  let branch = "ctate/native-2";
  let vcpus = 8;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--iterations" && args[i + 1]) {
      iterations = parseInt(args[++i], 10);
    } else if (args[i] === "--warmup" && args[i + 1]) {
      warmup = parseInt(args[++i], 10);
    } else if (args[i] === "--json") {
      json = true;
    } else if (args[i] === "--branch" && args[i + 1]) {
      branch = args[++i];
    } else if (args[i] === "--vcpus" && args[i + 1]) {
      vcpus = parseInt(args[++i], 10);
    }
  }

  return { iterations, warmup, json, branch, vcpus };
}

const config = parseArgs();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 30 * 60 * 1000;
const REPO_URL = "https://github.com/vercel-labs/agent-browser.git";

const CHROMIUM_SYSTEM_DEPS = [
  "nss",
  "nspr",
  "libxkbcommon",
  "atk",
  "at-spi2-atk",
  "at-spi2-core",
  "libXcomposite",
  "libXdamage",
  "libXrandr",
  "libXfixes",
  "libXcursor",
  "libXi",
  "libXtst",
  "libXScrnSaver",
  "libXext",
  "mesa-libgbm",
  "libdrm",
  "mesa-libGL",
  "mesa-libEGL",
  "cups-libs",
  "alsa-lib",
  "pango",
  "cairo",
  "gtk3",
  "dbus-libs",
];

// ---------------------------------------------------------------------------
// Sandbox helpers
// ---------------------------------------------------------------------------

type SandboxInstance = InstanceType<typeof Sandbox>;

async function run(
  sandbox: SandboxInstance,
  cmd: string,
  args: string[],
): Promise<string> {
  const result = await sandbox.runCommand(cmd, args);
  const stdout = await result.stdout();
  const stderr = await result.stderr();
  if (result.exitCode !== 0) {
    throw new Error(
      `Command failed (exit ${result.exitCode}): ${cmd} ${args.join(" ")}\n${stderr || stdout}`,
    );
  }
  return stdout;
}

async function shell(sandbox: SandboxInstance, script: string): Promise<string> {
  return run(sandbox, "sh", ["-c", script]);
}

async function shellSafe(sandbox: SandboxInstance, script: string): Promise<string> {
  const result = await sandbox.runCommand("sh", ["-c", script]);
  return (await result.stdout()).trim();
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

interface Stats {
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  samples: number[];
}

function computeStats(samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    avgMs: Math.round(sum / sorted.length),
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    p50Ms: sorted[Math.floor(sorted.length / 2)],
    samples: sorted,
  };
}

// ---------------------------------------------------------------------------
// Metrics collection
// ---------------------------------------------------------------------------

interface ProcessMetrics {
  pid: number;
  rssKb: number;
  vszKb: number;
  cpuPercent: number;
  memPercent: number;
  cpuTimeSec: number;
  command: string;
}

interface DaemonMetrics {
  coldStartMs: number;
  binarySizeBytes: number;
  distributionSizeBytes: number;
  daemonProcesses: ProcessMetrics[];
  totalRssKb: number;
  totalVszKb: number;
  peakRssKb: number;
  totalCpuTimeSec: number;
}

async function findDaemonPids(
  sandbox: SandboxInstance,
  _session: string,
): Promise<number[]> {
  // The daemon process name is "agent-browser" but session/daemon flags are
  // env vars, not command-line args, so we can't grep them from `ps`.
  // Instead, find all agent-browser processes that look like long-running daemons
  // (not short-lived CLI invocations -- those exit immediately).
  const raw = await shellSafe(
    sandbox,
    `pgrep -x agent-browser 2>/dev/null || true`,
  );
  if (!raw) {
    // Fallback: broader match on process name
    const fallback = await shellSafe(
      sandbox,
      `pgrep -f 'agent-browser' 2>/dev/null | head -5 || true`,
    );
    if (!fallback) return [];
    return fallback.split("\n").map(Number).filter(Boolean);
  }
  return raw.split("\n").map(Number).filter(Boolean);
}

async function collectProcessMetrics(
  sandbox: SandboxInstance,
  pid: number,
): Promise<ProcessMetrics | null> {
  const raw = await shellSafe(
    sandbox,
    `ps -p ${pid} -o pid=,rss=,vsz=,%cpu=,%mem=,cputime=,comm= 2>/dev/null || true`,
  );
  if (!raw) return null;

  const parts = raw.trim().split(/\s+/);
  if (parts.length < 7) return null;

  // Parse cputime "HH:MM:SS" or "MM:SS" to seconds
  const timeParts = parts[5].split(":").map(Number);
  let cpuTimeSec = 0;
  if (timeParts.length === 3) {
    cpuTimeSec = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
  } else if (timeParts.length === 2) {
    cpuTimeSec = timeParts[0] * 60 + timeParts[1];
  }

  return {
    pid: Number(parts[0]),
    rssKb: Number(parts[1]),
    vszKb: Number(parts[2]),
    cpuPercent: Number(parts[3]),
    memPercent: Number(parts[4]),
    cpuTimeSec,
    command: parts.slice(6).join(" "),
  };
}

async function getPeakRssKb(
  sandbox: SandboxInstance,
  pid: number,
): Promise<number> {
  const raw = await shellSafe(
    sandbox,
    `cat /proc/${pid}/status 2>/dev/null | grep VmHWM | awk '{print $2}' || echo 0`,
  );
  return Number(raw) || 0;
}

async function getChildPids(
  sandbox: SandboxInstance,
  pid: number,
): Promise<number[]> {
  const raw = await shellSafe(
    sandbox,
    `pgrep -P ${pid} 2>/dev/null || true`,
  );
  if (!raw) return [];
  return raw.split("\n").map(Number).filter(Boolean);
}

async function getAllDescendantPids(
  sandbox: SandboxInstance,
  pid: number,
): Promise<number[]> {
  const all: number[] = [];
  const queue = [pid];
  while (queue.length > 0) {
    const current = queue.shift()!;
    all.push(current);
    const children = await getChildPids(sandbox, current);
    queue.push(...children);
  }
  return all;
}

async function collectDaemonMetrics(
  sandbox: SandboxInstance,
  session: string,
  coldStartMs: number,
  binarySizeBytes: number,
  distributionSizeBytes: number,
): Promise<DaemonMetrics> {
  // Find daemon PIDs -- the agent-browser process itself
  const daemonPids = await findDaemonPids(sandbox, session);

  // Also find the full process tree (daemon + Chrome children)
  let allPids: number[] = [];
  for (const pid of daemonPids) {
    const descendants = await getAllDescendantPids(sandbox, pid);
    allPids.push(...descendants);
  }
  allPids = [...new Set(allPids)];

  // If no daemon PIDs found via pgrep, fall back to grabbing all
  // agent-browser and chrome processes for metrics
  if (allPids.length === 0) {
    const fallback = await shellSafe(
      sandbox,
      `ps -eo pid,comm | grep -E 'agent-browser|chrome' | grep -v grep | awk '{print $1}' || true`,
    );
    if (fallback) {
      allPids = fallback.split("\n").map(Number).filter(Boolean);
    }
  }

  const processes: ProcessMetrics[] = [];
  let peakRssKb = 0;

  for (const pid of allPids) {
    const metrics = await collectProcessMetrics(sandbox, pid);
    if (metrics) {
      processes.push(metrics);
      const peak = await getPeakRssKb(sandbox, pid);
      peakRssKb = Math.max(peakRssKb, peak);
    }
  }

  const totalRssKb = processes.reduce((sum, p) => sum + p.rssKb, 0);
  const totalVszKb = processes.reduce((sum, p) => sum + p.vszKb, 0);
  const totalCpuTimeSec = processes.reduce((sum, p) => sum + p.cpuTimeSec, 0);

  return {
    coldStartMs,
    binarySizeBytes,
    distributionSizeBytes,
    daemonProcesses: processes,
    totalRssKb,
    totalVszKb,
    peakRssKb,
    totalCpuTimeSec,
  };
}

async function getBinarySize(
  sandbox: SandboxInstance,
): Promise<number> {
  // Follow symlinks to get the real binary/script size
  const raw = await shellSafe(
    sandbox,
    `stat -L -c %s "$(readlink -f "$(which agent-browser)")" 2>/dev/null || echo 0`,
  );
  return Number(raw) || 0;
}

async function getDistributionSize(
  sandbox: SandboxInstance,
  mode: DaemonMode,
): Promise<number> {
  if (mode === "node") {
    // Total size of the npm package + Playwright browser
    const npmPkg = await shellSafe(
      sandbox,
      `du -sb "$(npm root -g)/agent-browser" 2>/dev/null | awk '{print $1}' || echo 0`,
    );
    const pwBrowser = await shellSafe(
      sandbox,
      `du -sb "$HOME/.cache/ms-playwright" 2>/dev/null | awk '{print $1}' || echo 0`,
    );
    return (Number(npmPkg) || 0) + (Number(pwBrowser) || 0);
  } else {
    // Rust binary + Chrome for Testing
    const binary = await shellSafe(
      sandbox,
      `stat -L -c %s "$(readlink -f "$(which agent-browser)")" 2>/dev/null || echo 0`,
    );
    const chrome = await shellSafe(
      sandbox,
      `du -sb "$HOME/.cache/agent-browser" 2>/dev/null | awk '{print $1}' || echo 0`,
    );
    return (Number(binary) || 0) + (Number(chrome) || 0);
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatKb(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

// ---------------------------------------------------------------------------
// Scenario runner
// ---------------------------------------------------------------------------

type DaemonMode = "node" | "native";

function daemonEnv(mode: DaemonMode): Record<string, string> {
  return { AGENT_BROWSER_SESSION: `bench-${mode}` };
}

async function agentBrowser(
  sandbox: SandboxInstance,
  args: string[],
  mode: DaemonMode,
): Promise<void> {
  const result = await sandbox.runCommand({
    cmd: "agent-browser",
    args,
    env: daemonEnv(mode),
  });
  if (result.exitCode !== 0) {
    const stderr = await result.stderr();
    const stdout = await result.stdout();
    throw new Error(
      `agent-browser ${args.join(" ")} failed (exit ${result.exitCode}): ${stderr || stdout}`,
    );
  }
}

async function timedAgentBrowser(
  sandbox: SandboxInstance,
  args: string[],
  mode: DaemonMode,
): Promise<number> {
  const start = Date.now();
  const result = await sandbox.runCommand({
    cmd: "agent-browser",
    args,
    env: daemonEnv(mode),
  });
  const elapsed = Date.now() - start;
  if (result.exitCode !== 0) {
    const stderr = await result.stderr();
    const stdout = await result.stdout();
    throw new Error(
      `agent-browser ${args.join(" ")} failed (exit ${result.exitCode}): ${stderr || stdout}`,
    );
  }
  return elapsed;
}

interface ScenarioResult {
  name: string;
  description: string;
  stats: Stats;
  error?: string;
}

async function runScenario(
  sandbox: SandboxInstance,
  scenario: Scenario,
  mode: DaemonMode,
  iterations: number,
  warmup: number,
): Promise<ScenarioResult> {
  try {
    if (scenario.setup) {
      for (const cmd of scenario.setup) {
        await agentBrowser(sandbox, cmd, mode);
      }
    }

    for (let w = 0; w < warmup; w++) {
      for (const cmd of scenario.commands) {
        await agentBrowser(sandbox, cmd, mode);
      }
    }

    const samples: number[] = [];
    for (let i = 0; i < iterations; i++) {
      let totalMs = 0;
      for (const cmd of scenario.commands) {
        totalMs += await timedAgentBrowser(sandbox, cmd, mode);
      }
      samples.push(totalMs);
    }

    if (scenario.teardown) {
      for (const cmd of scenario.teardown) {
        await agentBrowser(sandbox, cmd, mode);
      }
    }

    return {
      name: scenario.name,
      description: scenario.description,
      stats: computeStats(samples),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      name: scenario.name,
      description: scenario.description,
      stats: { avgMs: -1, minMs: -1, maxMs: -1, p50Ms: -1, samples: [] },
      error: message,
    };
  }
}

// ---------------------------------------------------------------------------
// Benchmark phases
// ---------------------------------------------------------------------------

interface DaemonResults {
  mode: DaemonMode;
  label: string;
  scenarios: ScenarioResult[];
  metrics: DaemonMetrics;
}

async function benchmarkDaemon(
  sandbox: SandboxInstance,
  mode: DaemonMode,
  label: string,
): Promise<DaemonResults> {
  console.log(`\n--- ${label} ---`);

  // Measure sizes before launch
  const binarySizeBytes = await getBinarySize(sandbox);
  const distributionSizeBytes = await getDistributionSize(sandbox, mode);

  // Cold start: time the first launch (daemon spawn + browser launch)
  const coldStartBegin = Date.now();
  await agentBrowser(sandbox, ["open", "about:blank"], mode);
  const coldStartMs = Date.now() - coldStartBegin;
  console.log(`  Cold start: ${coldStartMs}ms`);
  console.log(`  Binary size: ${formatBytes(binarySizeBytes)}`);
  console.log(`  Distribution size: ${formatBytes(distributionSizeBytes)}`);

  // Run all scenarios
  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    process.stdout.write(`  ${scenario.name} `);
    const result = await runScenario(
      sandbox,
      scenario,
      mode,
      config.iterations,
      config.warmup,
    );
    if (result.error) {
      console.log(`FAILED: ${result.error.slice(0, 120)}`);
    } else {
      const dots = ".".repeat(Math.max(1, 30 - scenario.name.length));
      console.log(
        `${dots} ${result.stats.avgMs}ms avg (p50: ${result.stats.p50Ms}ms, min: ${result.stats.minMs}ms, max: ${result.stats.maxMs}ms)`,
      );
    }
    results.push(result);
  }

  // Collect system metrics after scenarios (daemon is still running)
  const session = `bench-${mode}`;
  const metrics = await collectDaemonMetrics(
    sandbox,
    session,
    coldStartMs,
    binarySizeBytes,
    distributionSizeBytes,
  );

  // Also grab a full process snapshot for context
  const psOutput = await shellSafe(
    sandbox,
    `ps aux --sort=-rss | head -20`,
  );
  console.log(`\n  Process snapshot (top by RSS):`);
  for (const line of psOutput.split("\n").slice(0, 10)) {
    console.log(`    ${line}`);
  }

  console.log(`\n  Daemon metrics:`);
  console.log(`    RSS: ${formatKb(metrics.totalRssKb)} (peak: ${formatKb(metrics.peakRssKb)})`);
  console.log(`    VSZ: ${formatKb(metrics.totalVszKb)}`);
  console.log(`    CPU time: ${metrics.totalCpuTimeSec.toFixed(1)}s`);
  console.log(`    Daemon processes: ${metrics.daemonProcesses.length}`);
  for (const p of metrics.daemonProcesses) {
    console.log(`      PID ${p.pid}: ${p.command} (RSS: ${formatKb(p.rssKb)}, CPU: ${p.cpuPercent}%)`);
  }

  await agentBrowser(sandbox, ["close"], mode);
  console.log(`  Browser closed.`);

  return { mode, label, scenarios: results, metrics };
}

// ---------------------------------------------------------------------------
// Install helpers
// ---------------------------------------------------------------------------

async function installChromiumDeps(sandbox: SandboxInstance) {
  console.log("Installing Chromium system dependencies...");
  await shell(
    sandbox,
    `sudo dnf clean all 2>&1 && sudo dnf install -y --skip-broken ${CHROMIUM_SYSTEM_DEPS.join(" ")} 2>&1 && sudo ldconfig 2>&1`,
  );
}

async function installNodeDaemon(sandbox: SandboxInstance) {
  console.log("Installing agent-browser from npm (Node.js daemon)...");
  await run(sandbox, "npm", ["install", "-g", "agent-browser"]);
  await run(sandbox, "npx", ["agent-browser", "install"]);
  const version = await shell(sandbox, "agent-browser --version 2>&1 || true");
  console.log(`  version: ${version.trim()}`);
}

async function installNativeDaemon(sandbox: SandboxInstance, branch: string) {
  console.log(`\nBuilding native daemon from ${branch}...`);

  console.log("  Installing build tools and Rust toolchain...");
  const rustStart = Date.now();
  await shell(
    sandbox,
    "sudo dnf install -y gcc gcc-c++ make perl-core openssl-devel 2>&1",
  );
  await shell(
    sandbox,
    "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y 2>&1",
  );
  console.log(`  Rust + build tools installed (${Math.round((Date.now() - rustStart) / 1000)}s)`);

  console.log(`  Cloning repo (branch: ${branch})...`);
  const cloneStart = Date.now();
  await shell(
    sandbox,
    `git clone --depth 1 --branch ${branch} ${REPO_URL} /tmp/agent-browser 2>&1`,
  );
  console.log(`  Cloned (${Math.round((Date.now() - cloneStart) / 1000)}s)`);

  console.log("  Building release binary (cargo build --release)...");
  const buildStart = Date.now();
  await shell(
    sandbox,
    "source $HOME/.cargo/env && cd /tmp/agent-browser/cli && cargo build --release 2>&1",
  );
  console.log(`  Built (${Math.round((Date.now() - buildStart) / 1000)}s)`);

  const npmBinPath = (await shell(sandbox, "which agent-browser")).trim();
  console.log(`  Replacing ${npmBinPath} with native build...`);
  await shell(
    sandbox,
    `sudo cp /tmp/agent-browser/cli/target/release/agent-browser ${npmBinPath}`,
  );

  const version = await shell(sandbox, "agent-browser --version 2>&1 || true");
  console.log(`  version: ${version.trim()}`);
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function printResults(node: DaemonResults, native: DaemonResults) {
  console.log("\n\n========== COMMAND LATENCY ==========\n");

  const header =
    "Scenario".padEnd(20) + "| Node (ms) | Rust (ms) | Speedup";
  const sep = "-".repeat(20) + "|-----------|-----------|--------";
  console.log(header);
  console.log(sep);

  for (let i = 0; i < node.scenarios.length; i++) {
    const n = node.scenarios[i];
    const r = native.scenarios[i];
    const name = n.name.padEnd(20);

    if (n.error || r.error) {
      const nodeVal = n.error
        ? "FAILED".padStart(9)
        : String(n.stats.avgMs).padStart(9);
      const rustVal = r.error
        ? "FAILED".padStart(9)
        : String(r.stats.avgMs).padStart(9);
      console.log(`${name}| ${nodeVal} | ${rustVal} |    --`);
      continue;
    }

    const nodeMs = String(n.stats.avgMs).padStart(9);
    const rustMs = String(r.stats.avgMs).padStart(9);
    const speedup =
      r.stats.avgMs > 0
        ? (n.stats.avgMs / r.stats.avgMs).toFixed(2) + "x"
        : "--";
    console.log(`${name}| ${nodeMs} | ${rustMs} | ${speedup.padStart(6)}`);
  }

  console.log("\n\n========== SYSTEM METRICS ==========\n");

  const nm = node.metrics;
  const rm = native.metrics;

  function ratio(a: number, b: number): string {
    if (b <= 0) return "--";
    return (a / b).toFixed(2) + "x";
  }

  const metricRows: [string, string, string, string][] = [
    [
      "Cold start",
      `${nm.coldStartMs}ms`,
      `${rm.coldStartMs}ms`,
      ratio(nm.coldStartMs, rm.coldStartMs),
    ],
    [
      "Binary size",
      formatBytes(nm.binarySizeBytes),
      formatBytes(rm.binarySizeBytes),
      ratio(nm.binarySizeBytes, rm.binarySizeBytes),
    ],
    [
      "Distribution size",
      formatBytes(nm.distributionSizeBytes),
      formatBytes(rm.distributionSizeBytes),
      ratio(nm.distributionSizeBytes, rm.distributionSizeBytes),
    ],
    [
      "Total RSS",
      formatKb(nm.totalRssKb),
      formatKb(rm.totalRssKb),
      ratio(nm.totalRssKb, rm.totalRssKb),
    ],
    [
      "Peak RSS",
      formatKb(nm.peakRssKb),
      formatKb(rm.peakRssKb),
      ratio(nm.peakRssKb, rm.peakRssKb),
    ],
    [
      "CPU time",
      `${nm.totalCpuTimeSec.toFixed(1)}s`,
      `${rm.totalCpuTimeSec.toFixed(1)}s`,
      ratio(nm.totalCpuTimeSec, rm.totalCpuTimeSec),
    ],
    [
      "Processes",
      String(nm.daemonProcesses.length),
      String(rm.daemonProcesses.length),
      "--",
    ],
  ];

  const mHeader =
    "Metric".padEnd(20) + "| Node".padEnd(14) + "| Rust".padEnd(14) + "| Ratio";
  const mSep = "-".repeat(20) + "|" + "-".repeat(13) + "|" + "-".repeat(13) + "|--------";
  console.log(mHeader);
  console.log(mSep);
  for (const [metric, nodeVal, rustVal, ratio] of metricRows) {
    console.log(
      `${metric.padEnd(20)}| ${nodeVal.padEnd(12)}| ${rustVal.padEnd(12)}| ${ratio}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("agent-browser Daemon Benchmark (Node.js vs Rust Native)");
  console.log(`Branch: ${config.branch}`);
  console.log(`Iterations: ${config.iterations} (+ ${config.warmup} warmup)`);
  console.log(`vCPUs: ${config.vcpus}\n`);

  console.log("Creating sandbox...");
  const sandbox = await Sandbox.create({
    ...credentials,
    timeout: TIMEOUT_MS,
    runtime: "node22",
    networkPolicy: "allow-all" as const,
    resources: { vcpus: config.vcpus },
  });
  console.log(`Sandbox: ${sandbox.sandboxId}`);

  try {
    await installChromiumDeps(sandbox);

    // Phase 1: Node.js daemon (from published npm package)
    await installNodeDaemon(sandbox);
    const nodeResults = await benchmarkDaemon(
      sandbox,
      "node",
      "Node.js Daemon (npm)",
    );

    // Phase 2: Rust native daemon (built from branch)
    await installNativeDaemon(sandbox, config.branch);
    const nativeResults = await benchmarkDaemon(
      sandbox,
      "native",
      `Rust Native Daemon (${config.branch})`,
    );

    printResults(nodeResults, nativeResults);

    if (config.json) {
      const output = {
        timestamp: new Date().toISOString(),
        branch: config.branch,
        vcpus: config.vcpus,
        iterations: config.iterations,
        warmup: config.warmup,
        node: {
          scenarios: nodeResults.scenarios.map((s) => ({
            name: s.name,
            description: s.description,
            ...s.stats,
            error: s.error,
          })),
          metrics: nodeResults.metrics,
        },
        native: {
          scenarios: nativeResults.scenarios.map((s) => ({
            name: s.name,
            description: s.description,
            ...s.stats,
            error: s.error,
          })),
          metrics: nativeResults.metrics,
        },
      };
      writeFileSync("results.json", JSON.stringify(output, null, 2));
      console.log("\nResults written to results.json");
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nFatal error: ${message}`);
    process.exit(1);
  } finally {
    try {
      await sandbox.stop();
      console.log("\nSandbox stopped.");
    } catch {
      console.warn("Warning: failed to stop sandbox.");
    }
  }
}

main();
