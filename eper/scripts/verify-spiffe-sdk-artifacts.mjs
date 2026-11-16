import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const candidates = [
  { name: "@jeengbe/spiffe", version: "2.1.1", expectedGitHead: "f97e382f909827aed0ae5f0b8550f70438dc7f86" },
  { name: "spiffe", version: "0.5.1", expectedGitHead: "633547b255fa81e865b87c266459883bac98bbd9" }
];

const results = [];
for (const candidate of candidates) {
  const result = {
    ...candidate,
    registryMetadataFound: false,
    tarballIntegrityMatches: false,
    registrySignatureMetadataPresent: false,
    provenanceMetadataPresent: false,
    sourceCommitMatches: null,
    provenanceEnvelopeKeys: [],
    provenanceFetchStatus: null,
    provenanceIdentityVerified: false,
    provenanceSourceRevision: null,
    provenanceSubjectDigestMatches: false,
    npmAuditSignaturesExitCode: null,
    npmAuditSignaturesOutput: "",
    status: "BLOCKED",
    reasons: []
  };
  let temp;
  try {
    const encodedName = candidate.name.startsWith("@")
      ? candidate.name.replace("/", "%2f")
      : candidate.name;
    const metadataUrl = `https://registry.npmjs.org/${encodedName}/${candidate.version}`;
    const response = await fetch(metadataUrl, { headers: { accept: "application/vnd.npm.install-v1+json" } });
    if (!response.ok) throw new Error(`registry metadata HTTP ${response.status}`);
    const metadata = await response.json();
    result.registryMetadataFound = true;
    const dist = metadata.dist ?? {};
    result.registrySignatureMetadataPresent = Array.isArray(dist.signatures) && dist.signatures.length > 0;
    result.provenanceMetadataPresent = Boolean(dist.attestations?.url || dist.attestations?.integrity);
    result.sourceCommitMatches = metadata.gitHead ? metadata.gitHead === candidate.expectedGitHead : null;
    if (dist.attestations?.url) {
      try {
        const attestationResponse = await fetch(dist.attestations.url);
        result.provenanceFetchStatus = attestationResponse.status;
        if (attestationResponse.ok) {
          const envelope = await attestationResponse.json();
          result.provenanceEnvelopeKeys = Object.keys(envelope);
          result.provenanceEnvelope = envelope;
          const slsa = envelope.attestations?.find((item) => item.predicateType === "https://slsa.dev/provenance/v1");
          if (slsa?.bundle?.dsseEnvelope?.payload) {
            try {
              result.slsaStatement = JSON.parse(Buffer.from(slsa.bundle.dsseEnvelope.payload, "base64").toString("utf8"));
            } catch (error) {
              result.reasons.push(`SLSA statement decode failed: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        }
      } catch (error) {
        result.reasons.push(`provenance fetch failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!dist.integrity || !dist.tarball) throw new Error("registry metadata lacks dist.integrity or dist.tarball");

    const tarballResponse = await fetch(dist.tarball);
    if (!tarballResponse.ok) throw new Error(`tarball HTTP ${tarballResponse.status}`);
    const tarball = Buffer.from(await tarballResponse.arrayBuffer());
    const tarballSha512 = createHash("sha512").update(tarball).digest();
    const actualIntegrity = `sha512-${tarballSha512.toString("base64")}`;
    const actualSha512Hex = tarballSha512.toString("hex");
    result.tarballIntegrityMatches = actualIntegrity === dist.integrity;
    const statement = result.slsaStatement;
    if (statement) {
      const subject = statement.subject?.find((item) => item.name === `pkg:npm/${candidate.name.startsWith("@") ? "%40" + candidate.name.slice(1) : candidate.name}@${candidate.version}` || item.name === `pkg:npm/${candidate.name}@${candidate.version}`);
      const predicate = statement.predicate;
      const build = predicate?.buildDefinition;
      const source = build?.resolvedDependencies?.find((item) => item.uri?.startsWith("git+https://github.com/jeengbe/ts-packages@"));
      const revision = source?.digest?.gitCommit ?? null;
      result.provenanceSourceRevision = revision;
      result.provenanceSubjectDigestMatches = Boolean(subject?.digest?.sha512 && subject.digest.sha512 === actualSha512Hex);
      const identityMatches = statement.predicateType === "https://slsa.dev/provenance/v1"
        && build?.externalParameters?.workflow?.repository === "https://github.com/jeengbe/ts-packages"
        && build?.externalParameters?.workflow?.path === ".github/workflows/ci.yml"
        && build?.externalParameters?.workflow?.ref === "refs/heads/master"
        && revision === candidate.expectedGitHead;
      result.provenanceIdentityVerified = Boolean(identityMatches && result.provenanceSubjectDigestMatches);
      if (!result.provenanceSubjectDigestMatches) result.reasons.push("SLSA provenance subject SHA-512 does not match the downloaded npm tarball");
      if (!identityMatches) result.reasons.push("SLSA provenance source repository, workflow, ref, or revision does not match the expected immutable source");
    } else if (result.provenanceMetadataPresent) {
      result.reasons.push("SLSA provenance statement missing from registry attestation envelope");
    }
    if (!result.tarballIntegrityMatches) result.reasons.push("downloaded tarball SHA-512 does not match registry dist.integrity");
    if (!result.registrySignatureMetadataPresent) result.reasons.push("registry signature metadata absent");
    if (!result.provenanceMetadataPresent) result.reasons.push("registry provenance attestation metadata absent");
    if (result.sourceCommitMatches === false) result.reasons.push(`registry gitHead mismatch (found ${metadata.gitHead})`);
    if (result.sourceCommitMatches === null && !result.provenanceIdentityVerified) result.reasons.push("registry gitHead absent and SLSA provenance source revision not verified");

    temp = await mkdtemp(join(tmpdir(), "eper-spiffe-evidence-"));
    await writeFile(join(temp, "package.json"), JSON.stringify({ name: "eper-spiffe-artifact-evidence", version: "1.0.0", private: true }, null, 2));
    const install = spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", `${candidate.name}@${candidate.version}`], { cwd: temp, encoding: "utf8", timeout: 120000 });
    if (install.status !== 0) {
      result.reasons.push(`isolated lock resolution failed: ${(install.stderr || install.stdout).trim().slice(-1200)}`);
    } else {
      const audit = spawnSync("npm", ["audit", "signatures"], { cwd: temp, encoding: "utf8", timeout: 120000 });
      result.npmAuditSignaturesExitCode = audit.status;
      result.npmAuditSignaturesOutput = (audit.stdout + audit.stderr).trim().slice(-3000);
      if (audit.status !== 0) result.reasons.push("npm audit signatures did not pass for the isolated candidate dependency closure");
    }
    if (result.tarballIntegrityMatches && result.registrySignatureMetadataPresent && result.provenanceMetadataPresent && result.provenanceIdentityVerified && result.npmAuditSignaturesExitCode === 0 && (result.sourceCommitMatches === true || result.sourceCommitMatches === null)) {
      result.status = "VERIFIED";
    }
  } catch (error) {
    result.reasons.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (temp) await rm(temp, { recursive: true, force: true });
  }
  results.push(result);
}

const report = {
  generatedAt: new Date().toISOString(),
  purpose: "Diagnostic evidence only; does not add an EPER runtime dependency or authorize SPIRE activation.",
  npmVersion: spawnSync("npm", ["--version"], { encoding: "utf8" }).stdout.trim(),
  candidates: results
};
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/spiffe-sdk-artifact-report.json", JSON.stringify(report, null, 2) + "\n");
const summary = results.map((item) => `### ${item.name}@${item.version}: ${item.status}\n${item.reasons.length ? item.reasons.map((reason) => `- ${reason}`).join("\n") : "- Registry integrity, signature/provenance metadata, source commit and npm audit signatures checks passed."}`).join("\n\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  await writeFile(process.env.GITHUB_STEP_SUMMARY, summary + "\n", { flag: "a" });
}
