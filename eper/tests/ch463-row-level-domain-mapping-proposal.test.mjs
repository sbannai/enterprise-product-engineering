import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const proposalPath = new URL("../uat/B01_CH463_ROW_LEVEL_DOMAIN_MAPPING_PROPOSAL.md", import.meta.url);

test("Chapter 463 row-level mapping proposal preserves all six IDs and remains explicitly unapproved", async () => {
  const proposal = await readFile(proposalPath, "utf8");
  const requirements = [
    ["REQ-46301", "SRS-FR-2323", "TRC-46301"],
    ["REQ-46302", "SRS-FR-2324", "TRC-46302"],
    ["REQ-46303", "SRS-FR-2325", "TRC-46303"],
    ["REQ-46304", "SRS-FR-2326", "TRC-46304"],
    ["REQ-46305", "SRS-FR-2327", "TRC-46305"],
    ["REQ-46306", "SRS-FR-2328", "TRC-46306"],
  ];

  assert.match(proposal, /REVIEW PROPOSAL — NOT APPROVED/);
  assert.match(proposal, /Source status: \*\*In Development\*\*/);
  assert.match(proposal, /228 requirements; 38 chapters/i);
  assert.match(proposal, /EPER_UAT_API_ENABLED=false/);
  assert.match(proposal, /no chargeable AWS resources/i);
  for (const ids of requirements) {
    for (const id of ids) assert.ok(proposal.includes(id), `Proposal is missing retained ID ${id}`);
  }
  for (const decision of ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9"]) {
    assert.ok(proposal.includes(decision), `Proposal is missing decision dependency ${decision}`);
  }
  assert.match(proposal, /ACCEPT/);
  assert.match(proposal, /AMEND/);
  assert.match(proposal, /REJECT \/ CLARIFICATION REQUIRED/);
  assert.match(proposal, /Business UAT remains \*\*HOLD \/ NOT AUTHORIZED \/ NOT EXECUTED\*\*/);
});
