import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

/** Resolve only an existing JavaScript file physically contained in the deployed dispatcher directory. */
export async function resolveWorkflowOutboxDispatcherRealPath(
  candidatePath: string,
  cwd = process.cwd(),
): Promise<string> {
  let root: string;
  let candidate: string;
  try {
    root = await realpath(resolve(cwd, "dist/apps/worker/dispatchers"));
    candidate = await realpath(candidatePath);
  } catch {
    throw new Error("WORKFLOW_OUTBOX_DISPATCHER_MODULE_NOT_FOUND");
  }
  const relativePath = relative(root, candidate);
  if (!relativePath || relativePath === "." || relativePath === ".." ||
      relativePath.startsWith(".." + sep) || isAbsolute(relativePath) ||
      !candidate.endsWith(".js")) {
    throw new Error("WORKFLOW_OUTBOX_DISPATCHER_MODULE_PATH_INVALID");
  }
  const metadata = await stat(candidate);
  if (!metadata.isFile()) {
    throw new Error("WORKFLOW_OUTBOX_DISPATCHER_MODULE_NOT_FILE");
  }
  return candidate;
}
