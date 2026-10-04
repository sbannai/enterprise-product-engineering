import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const evidenceDir = resolve(root, "reexec-evidence");
mkdirSync(evidenceDir, { recursive: true });

const pilotRoutes = [
  { chapter: 463, health: "/health", report: "/api/v1/records", recordCreate: true, requiresAuth: true },
  { chapter: 464, health: "/health", report: "/api/v1/suppliers", requiresAuth: true },
  { chapter: 465, health: "/health", report: "/report" },
  { chapter: 466, health: "/health", report: "/report" },
  { chapter: 467, health: "/health", report: "/report" },
  { chapter: 468, health: "/health", report: "/report" },
  { chapter: 469, health: "/health", report: "/report" },
  { chapter: 470, health: "/health", report: "/report" },
  { chapter: 471, health: "/health", report: "/report" },
];

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForHealth(url, child) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return response;
      lastError = new Error(`health returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`health endpoint did not become ready: ${lastError?.message ?? "unknown error"}`);
}

const results = [];
for (const pilot of pilotRoutes) {
  const packageDir = resolve(root, `chapter-${pilot.chapter}-pilot-v0.1.0`);
  const port = await freePort();
  const child = spawn(process.execPath, ["src/app.js"], {
    cwd: packageDir,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const row = {
    chapter: pilot.chapter,
    baseUrl: `http://127.0.0.1:${port}`,
    classification: "LOCAL PILOT HTTP SMOKE — NOT BUSINESS UAT",
    checks: [],
    status: "PASS",
  };

  try {
    const baseUrl = row.baseUrl;
    const health = await waitForHealth(baseUrl + pilot.health, child);
    const healthBody = await health.json();
    if (health.status !== 200 || healthBody.status !== "ok") throw new Error("health response contract failed");
    row.checks.push({ name: "health", status: "PASS", httpStatus: health.status });

    if (pilot.requiresAuth || pilot.recordCreate) {
      // The default Chapter 463 server intentionally has no trusted identity resolver.
      // Its local smoke must verify fail-closed behavior, not bypass auth with fake identity.
      const listed = await fetch(baseUrl + pilot.report, { signal: AbortSignal.timeout(3000) });
      if (listed.status !== 401) throw new Error(`unauthenticated report returned HTTP ${listed.status}, expected 401`);
      const listBody = await listed.json();
      if (listBody.error !== "authentication required") throw new Error("unauthenticated report error contract failed");
      row.checks.push({ name: "unauthenticated-report-denied", status: "PASS", httpStatus: listed.status });

      if (pilot.recordCreate) {
      const deniedCreate = await fetch(baseUrl + pilot.report, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: `UNAUTH-HTTP-${pilot.chapter}-${Date.now()}`, tenantId: "TENANT-A", name: "Should not be created" }),
        signal: AbortSignal.timeout(3000),
      });
      if (deniedCreate.status !== 401) throw new Error(`unauthenticated create returned HTTP ${deniedCreate.status}, expected 401`);
      row.checks.push({ name: "unauthenticated-create-denied", status: "PASS", httpStatus: deniedCreate.status });
      }
    } else {
      const report = await fetch(baseUrl + pilot.report, { signal: AbortSignal.timeout(3000) });
      if (report.status !== 200) throw new Error(`report endpoint returned HTTP ${report.status}`);
      const reportBody = await report.json();
      if (!reportBody || typeof reportBody !== "object") throw new Error("report response was not JSON object data");
      row.checks.push({ name: "report", status: "PASS", httpStatus: report.status });
    }

    const missing = await fetch(baseUrl + "/__uat-smoke-route-not-found", { signal: AbortSignal.timeout(3000) });
    if (missing.status !== 404) throw new Error(`unknown route returned HTTP ${missing.status}, expected 404`);
    row.checks.push({ name: "unknown-route", status: "PASS", httpStatus: missing.status });
  } catch (error) {
    row.status = "FAIL";
    row.error = error instanceof Error ? error.message : String(error);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      const timeout = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 1500);
      child.once("exit", () => { clearTimeout(timeout); resolve(); });
    });
    row.stdout = stdout;
    row.stderr = stderr;
    results.push(row);
    writeFileSync(resolve(evidenceDir, `chapter-${pilot.chapter}-http-smoke.json`), JSON.stringify(row, null, 2) + "\n");
  }
}

const summary = {
  program: "EPER-REEXEC-004",
  classification: "LOCAL PILOT HTTP SMOKE — NOT BUSINESS UAT / NOT OAUTH VALIDATION / NOT PRODUCTION EVIDENCE",
  chaptersWithHttpApps: pilotRoutes.length,
  chaptersWithoutHttpAppsInScope: 29,
  totalChecks: results.reduce((sum, row) => sum + row.checks.length, 0),
  passedChecks: results.reduce((sum, row) => sum + row.checks.filter((check) => check.status === "PASS").length, 0),
  failedChapters: results.filter((row) => row.status === "FAIL").map((row) => row.chapter),
  businessAcceptance: "NOT_EXECUTED",
  formalUatSignoff: "NOT_EXECUTED",
  results,
};
writeFileSync(resolve(evidenceDir, "pilot-http-smoke-summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({
  program: summary.program,
  classification: summary.classification,
  chaptersWithHttpApps: summary.chaptersWithHttpApps,
  chaptersWithoutHttpAppsInScope: summary.chaptersWithoutHttpAppsInScope,
  totalChecks: summary.totalChecks,
  passedChecks: summary.passedChecks,
  failedChapters: summary.failedChapters,
}, null, 2));
if (summary.failedChapters.length) process.exitCode = 1;
