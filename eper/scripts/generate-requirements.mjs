import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDirectory, "..");
const registryPath = join(root, "packages/requirements/registry.ts");
const requirementsRoot = join(root, "requirements");

function parseBindings(source) {
  const bindings = [];
  const pattern = /\{\s*id:\s*"((?:REQ)-\d{5})"\s*,\s*brd:\s*"([^"]+)"\s*,\s*srs:\s*"([^"]+)"\s*,\s*chapter:\s*(\d+)\s*,\s*sequence:\s*(\d+)\s*,\s*pattern:\s*"(XX0[1-6])"\s*,\s*capability:\s*"([^"]+)"\s*,\s*service:\s*"([^"]+)"\s*,\s*dataContract:\s*"([^"]+)"\s*,\s*apiContract:\s*"([^"]+)"\s*,\s*eventContract:\s*"([^"]+)"\s*\}/g;
  for (const match of source.matchAll(pattern)) {
    bindings.push({ id: match[1], brd: match[2], srs: match[3], chapter: Number(match[4]), sequence: Number(match[5]), pattern: match[6], capability: match[7], service: match[8], dataContract: match[9], apiContract: match[10], eventContract: match[11] });
  }
  return bindings;
}

function render(binding) {
  return `// GENERATED FILE — do not edit by hand. Run npm run codegen from eper/.
// Requirement-specific executable binding; domain behavior is implemented by the mapped capability service.
// ${binding.brd} | ${binding.srs} | Chapter ${binding.chapter} | Pattern ${binding.pattern}

import { getRequirementBinding } from "../../packages/requirements/registry.js";
import { executeIntegratedRequirement, type CapabilityServices } from "../../packages/capability-router.js";

export const requirement = getRequirementBinding("${binding.id}");
export const traceability = {
  brd: "${binding.brd}",
  srs: "${binding.srs}",
  chapter: ${binding.chapter},
  sequence: ${binding.sequence},
  pattern: "${binding.pattern}",
  capability: "${binding.capability}",
  service: "${binding.service}",
  dataContract: "${binding.dataContract}",
  apiContract: "${binding.apiContract}",
  eventContract: "${binding.eventContract}",
} as const;

export function execute(input: unknown, services: CapabilityServices): Promise<unknown> {
  return executeIntegratedRequirement(requirement, input, services);
}
`;
}

const source = await readFile(registryPath, "utf8");
const bindings = parseBindings(source);
if (bindings.length !== 228) {
  throw new Error(`CODEGEN_REQUIREMENT_COUNT_MISMATCH: expected 228, parsed ${bindings.length}`);
}
const ids = new Set();
for (const binding of bindings) {
  if (ids.has(binding.id)) throw new Error(`CODEGEN_DUPLICATE_REQUIREMENT:${binding.id}`);
  ids.add(binding.id);
  const path = join(requirementsRoot, binding.id, "index.ts");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, render(binding), "utf8");
}
console.log(`Generated ${bindings.length} executable requirement bindings across ${new Set(bindings.map((x) => x.chapter)).size} chapters.`);
