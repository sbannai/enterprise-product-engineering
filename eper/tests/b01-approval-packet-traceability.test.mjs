import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packet = readFileSync(
  new URL("../uat/B01_APPROVAL_PACKET.md", import.meta.url),
  "utf8",
);

const requirementRows = [...packet.matchAll(
  /^\| \x60(REQ-(\\d{3})(\\d{2}))\x60 \/ \x60(SRS-FR-(\\d+))\x60 \|.*\| (PENDING) \|$/gm,
)];

test("B01 approval packet maps all 48 requirements to SRS references", () => {
  assert.equal(requirementRows.length, 48);

  const requirementIds = new Set();
  for (const match of requirementRows) {
    const [, requirementId, chapterText, sequenceText, srsId, srsNumberText] = match;
    const chapter = Number(chapterText);
    const sequence = Number(sequenceText);
    const srsNumber = Number(srsNumberText);
    const expectedSrsNumber = 2323 + (chapter - 463) * 6 + (sequence - 1);

    assert.ok(chapter >= 463 && chapter <= 470, requirementId);
    assert.ok(sequence >= 1 && sequence <= 6, requirementId);
    assert.equal(srsId, `SRS-FR-${expectedSrsNumber}`, requirementId);
    assert.ok(!requirementIds.has(requirementId), `duplicate ${requirementId}`);
    requirementIds.add(requirementId);
  }

  assert.equal(requirementIds.size, 48);
});

test("traceability completion does not imply business approval", () => {
  assert.match(packet, /Status:\*\* For accountable-owner decision; no approvals or execution implied/);
  for (const [, requirementId] of requirementRows) {
    const escapedId = requirementId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const row = packet.split("\n").find((line) => line.includes(`\x60${requirementId}\x60`));
    assert.ok(row, requirementId);
    assert.match(row, /\| PENDING \|$/, requirementId);
    assert.match(row, new RegExp(escapedId));
  }
});
