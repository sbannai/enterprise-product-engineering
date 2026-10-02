import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const evidenceDir = resolve(root, "reexec-evidence");
mkdirSync(evidenceDir, { recursive: true });

const chapters = Array.from({ length: 38 }, (_, i) => 463 + i);
const runStartedAt = new Date().toISOString();
const chapterResults = [];
const requirementResults = [];

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

for (const chapter of chapters) {
  const packageDir = resolve(root, `chapter-${chapter}-pilot-v0.1.0`);
  const testFile = resolve(packageDir, `test/chapter${chapter}.test.js`);
  let source = "";
  try { source = readFileSync(testFile, "utf8"); } catch {}

  const execution = spawnSync("npm", ["test", "--", "--test-reporter=tap"], {
    cwd: packageDir,
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, CI: "true" },
  });
  const stdout = execution.stdout ?? "";
  const stderr = execution.stderr ?? "";
  const combined = stdout + (stderr ? "\n[stderr]\n" + stderr : "");
  writeFileSync(resolve(evidenceDir, `chapter-${chapter}-test.log`), combined);

  const testCases = [...stdout.matchAll(/^(ok|not ok) \\d+ - (.+)$/gm)].map((match) => ({
    passed: match[1] === "ok",
    title: match[2].trim(),
  }));
  const testResultsByRequirement = new Map();
  for (const testCase of testCases) {
    for (const match of testCase.title.matchAll(new RegExp(`REQ-${chapter}(\\\\d{2})\\\\b`, "g"))) {
      const id = `REQ-${chapter}${match[1]}`;
      if (!testResultsByRequirement.has(id)) testResultsByRequirement.set(id, []);
      testResultsByRequirement.get(id).push(testCase.passed);
    }
  }
  const requirementIdsInTitles = new Set(testResultsByRequirement.keys());
  const testTitles = testCases.map((testCase) => testCase.title);
  const sourceRequirementIds = new Set(
    [...source.matchAll(new RegExp(`REQ-${chapter}(\\d{2})\\b`, "g"))].map((m) => `REQ-${chapter}${m[1]}`)
  );
  const suitePass = execution.status === 0 && !execution.error;
  const testsMatch = stdout.match(/^# tests (\d+)$/m);
  const passMatch = stdout.match(/^# pass (\d+)$/m);
  const failMatch = stdout.match(/^# fail (\d+)$/m);
  const suite = {
    chapter,
    package: `chapter-${chapter}-pilot-v0.1.0`,
    testFilePresent: Boolean(source),
    exitCode: execution.status,
    timedOut: execution.error?.code === "ETIMEDOUT",
    status: suitePass ? "PASS" : "FAIL",
    tests: Number(testsMatch?.[1] ?? testTitles.length),
    passed: Number(passMatch?.[1] ?? (suitePass ? testTitles.length : 0)),
    failed: Number(failMatch?.[1] ?? (suitePass ? 0 : 1)),
    requirementIdsInTestTitles: [...requirementIdsInTitles].sort(),
    requirementIdsInTestSource: [...sourceRequirementIds].sort(),
  };
  chapterResults.push(suite);

  for (let sequence = 1; sequence <= 6; sequence++) {
    const id = `REQ-${chapter}${String(sequence).padStart(2, "0")}`;
    const testNamed = requirementIdsInTitles.has(id);
    const testReferenced = sourceRequirementIds.has(id);
    let status;
    const observedResults = testResultsByRequirement.get(id) ?? [];
    if (!source) status = "NO_TEST_FILE";
    else if (!testReferenced) status = "REQUIREMENT_TEST_MAPPING_GAP";
    else if (observedResults.length === 0) status = "REQUIREMENT_TEST_NOT_OBSERVED";
    else if (observedResults.some((passed) => !passed)) status = "REQUIREMENT_TEST_FAIL";
    else status = "AUTOMATED_PILOT_TEST_PASS_NOT_BUSINESS_UAT";
    requirementResults.push({
      requirementId: id,
      chapter,
      sequence,
      testFile: source ? `test/chapter${chapter}.test.js` : "",
      testNamedInExecutionOutput: testNamed,
      testReferencedInSource: testReferenced,
      chapterSuiteStatus: suite.status,
      status,
    });
  }
}

const summary = {
  program: "EPER-REEXEC-003",
  classification: "AUTOMATED CHAPTER PILOT TEST MATRIX — NOT BUSINESS UAT / NOT ACCEPTANCE / NOT PRODUCTION EVIDENCE",
  repository: process.env.GITHUB_REPOSITORY ?? "sbannai/enterprise-product-engineering",
  commit: process.env.GITHUB_SHA ?? "LOCAL_OR_UNSET",
  runId: process.env.GITHUB_RUN_ID ?? "LOCAL_OR_UNSET",
  runnerOs: process.env.RUNNER_OS ?? process.platform,
  nodeVersion: process.version,
  runStartedAt,
  runCompletedAt: new Date().toISOString(),
  scope: { chapters: 38, requirements: 228 },
  chapterSummary: {
    pass: chapterResults.filter((r) => r.status === "PASS").length,
    fail: chapterResults.filter((r) => r.status === "FAIL").length,
    totalTests: chapterResults.reduce((sum, r) => sum + r.tests, 0),
    passedTests: chapterResults.reduce((sum, r) => sum + r.passed, 0),
    failedTests: chapterResults.reduce((sum, r) => sum + r.failed, 0),
  },
  requirementSummary: Object.fromEntries(
    [...new Set(requirementResults.map((r) => r.status))].map((status) => [status, requirementResults.filter((r) => r.status === status).length])
  ),
  businessAcceptance: "NOT_EXECUTED",
  formalUatSignoff: "NOT_EXECUTED",
  chapterResults,
  requirementResults,
};

writeFileSync(resolve(evidenceDir, "chapter-pilot-matrix.json"), JSON.stringify(summary, null, 2) + "\n");
const headers = ["requirementId", "chapter", "sequence", "testFile", "testNamedInExecutionOutput", "testReferencedInSource", "chapterSuiteStatus", "status"];
const csv = [headers.join(","), ...requirementResults.map((row) => headers.map((h) => csvCell(row[h])).join(","))].join("\n") + "\n";
writeFileSync(resolve(evidenceDir, "requirement-test-matrix.csv"), csv);
writeFileSync(resolve(evidenceDir, "chapter-summary.csv"), [
  "chapter,package,status,tests,passed,failed,testFilePresent",
  ...chapterResults.map((r) => [r.chapter, r.package, r.status, r.tests, r.passed, r.failed, r.testFilePresent].map(csvCell).join(",")),
].join("\n") + "\n");

console.log(JSON.stringify({
  program: summary.program,
  classification: summary.classification,
  chapters: summary.scope.chapters,
  requirements: summary.scope.requirements,
  chapterSummary: summary.chapterSummary,
  requirementSummary: summary.requirementSummary,
  evidenceDir: "eper/reexec-evidence",
}, null, 2));

if (chapterResults.some((r) => r.status !== "PASS")) process.exitCode = 1;
