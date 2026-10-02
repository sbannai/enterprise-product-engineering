import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const evidenceDir = resolve(repoRoot, "eper/uat-evidence/B01");
mkdirSync(evidenceDir, { recursive: true });

const startedAt = new Date().toISOString();
const chapters = Array.from({ length: 8 }, (_, index) => 463 + index);
const suites = [];
const requirements = [];

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

for (const chapter of chapters) {
  const packageDir = resolve(repoRoot, `eper/chapter-${chapter}-pilot-v0.1.0`);
  const testPath = resolve(packageDir, `test/chapter${chapter}.test.js`);
  let source = "";
  try { source = readFileSync(testPath, "utf8"); } catch {}
  const result = spawnSync("npm", ["test", "--", "--test-reporter=tap"], {
    cwd: packageDir,
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, CI: "true" },
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const combined = stdout + (stderr ? "\n[stderr]\n" + stderr : "");
  writeFileSync(resolve(evidenceDir, `chapter-${chapter}-test.log`), combined);

  const parsed = [...stdout.matchAll(/^(ok|not ok) (\d+) - (.+)$/gm)].map(match => ({
    passed: match[1] === "ok",
    title: match[3].trim(),
  }));
  const byRequirement = new Map();
  for (const test of parsed) {
    for (const match of test.title.matchAll(new RegExp(`REQ-${chapter}(\\d{2})\\b`, "g"))) {
      const id = `REQ-${chapter}${match[1]}`;
      if (!byRequirement.has(id)) byRequirement.set(id, []);
      byRequirement.get(id).push(test.passed);
    }
  }
  const exitCode = result.status;
  const suitePassed = exitCode === 0 && !result.error;
  const summary = {
    chapter,
    package: `chapter-${chapter}-pilot-v0.1.0`,
    testFilePresent: Boolean(source),
    exitCode,
    status: suitePassed ? "PASS" : "FAIL",
    testCount: Number(stdout.match(/^# tests (\d+)$/m)?.[1] ?? parsed.length),
    passed: Number(stdout.match(/^# pass (\d+)$/m)?.[1] ?? (suitePassed ? parsed.length : 0)),
    failed: Number(stdout.match(/^# fail (\d+)$/m)?.[1] ?? (suitePassed ? 0 : 1)),
  };
  suites.push(summary);
  for (let sequence = 1; sequence <= 6; sequence++) {
    const id = `REQ-${chapter}${String(sequence).padStart(2, "0")}`;
    const sourceHasId = new RegExp(`REQ-${chapter}${String(sequence).padStart(2, "0")}\\b`).test(source);
    const observed = byRequirement.get(id) ?? [];
    let status = "REQUIREMENT_TEST_NOT_OBSERVED";
    if (!source) status = "NO_TEST_FILE";
    else if (!sourceHasId) status = "REQUIREMENT_TEST_MAPPING_GAP";
    else if (observed.length === 0) status = "REQUIREMENT_TEST_NOT_OBSERVED";
    else if (observed.some(passed => !passed)) status = "REQUIREMENT_TEST_FAIL";
    else status = "AUTOMATED_PILOT_TEST_PASS_NOT_BUSINESS_UAT";
    requirements.push({ requirementId: id, chapter, srsPattern: `XX${String(sequence).padStart(2, "0")}`, status, observedTestCount: observed.length });
  }
}

const readiness = [
  { criterion: "Business owner nominated", status: "PLANNING_INPUT_PRESENT_NOT_FORMAL_APPROVAL", detail: "Sudheendra was supplied as business owner in chat; formal authorization record not present in this run." },
  { criterion: "Execution environment type", status: "PLANNING_INPUT_PRESENT", detail: "Linux supplied; actual UAT base URL, tenant and deployed build are not recorded." },
  { criterion: "Approved test data", status: "BLOCKED", detail: "Candidate test data was generated earlier, but an approved data-set reference is not recorded in the capture register." },
  { criterion: "OAuth access", status: "BLOCKED", detail: "OAuth was selected as the method; issuer/client configuration, authorized test identity, live login verification and session reference are not recorded." },
  { criterion: "Tester/role assignment", status: "BLOCKED", detail: "A named tester and role-account mapping need to be confirmed in the controlled UAT session record." },
  { criterion: "Audit/reporting access", status: "BLOCKED", detail: "Access to target-environment audit events and business reports has not been evidenced." },
  { criterion: "Production-like deployed build", status: "BLOCKED", detail: "Available chapter pilots are implementation candidates with in-memory storage and simulated security context, not a verified deployed business UAT target." }
];

const overall = {
  program: "EPER-B01-TECHNICAL-PREFLIGHT",
  classification: "AUTOMATED PILOT TEST EXECUTION — NOT BUSINESS UAT / NOT ACCEPTANCE / NOT PRODUCTION EVIDENCE",
  repository: process.env.GITHUB_REPOSITORY ?? "sbannai/enterprise-product-engineering",
  commit: process.env.GITHUB_SHA ?? "LOCAL_OR_UNSET",
  runId: process.env.GITHUB_RUN_ID ?? "LOCAL_OR_UNSET",
  runnerOs: process.env.RUNNER_OS ?? process.platform,
  nodeVersion: process.version,
  startedAt,
  completedAt: new Date().toISOString(),
  scope: { batch: "B01", chapters: "463-470", requirements: 48 },
  suiteSummary: {
    passed: suites.filter(x => x.status === "PASS").length,
    failed: suites.filter(x => x.status === "FAIL").length,
    tests: suites.reduce((sum, x) => sum + x.testCount, 0),
    passedTests: suites.reduce((sum, x) => sum + x.passed, 0),
    failedTests: suites.reduce((sum, x) => sum + x.failed, 0)
  },
  requirementSummary: Object.fromEntries([...new Set(requirements.map(x => x.status))].map(status => [status, requirements.filter(x => x.status === status).length])),
  businessUatStatus: "NOT_EXECUTED",
  businessAcceptance: "NOT_EXECUTED",
  formalUatSignoff: "NOT_EXECUTED",
  readiness,
  suites,
  requirements
};
writeFileSync(resolve(evidenceDir, "B01-technical-preflight.json"), JSON.stringify(overall, null, 2) + "\n");
const headers = ["requirementId", "chapter", "srsPattern", "status", "observedTestCount"];
writeFileSync(resolve(evidenceDir, "B01-48-requirement-results.csv"), [
  headers.join(","),
  ...requirements.map(row => headers.map(key => csvCell(row[key])).join(","))
].join("\n") + "\n");
writeFileSync(resolve(evidenceDir, "B01-UAT-ENTRY-READINESS.csv"), [
  "criterion,status,detail",
  ...readiness.map(row => [row.criterion,row.status,row.detail].map(csvCell).join(","))
].join("\n") + "\n");
console.log(JSON.stringify({
  batch: "B01",
  scope: "Chapters 463-470 / 48 requirements",
  suiteSummary: overall.suiteSummary,
  requirementSummary: overall.requirementSummary,
  businessUatStatus: overall.businessUatStatus,
  readinessBlocked: readiness.filter(x => x.status === "BLOCKED").length,
  evidenceDirectory: "eper/uat-evidence/B01"
}, null, 2));
if (overall.suiteSummary.failed > 0) process.exitCode = 1;
