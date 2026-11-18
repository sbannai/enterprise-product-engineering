// Node 20 custom reporter for durable, per-test execution diagnostics.
// Keep TAP as the authoritative pass/fail output. This adds a timestamped
// event stream without changing test discovery, order, or concurrency.
export default async function* qaProgressReporter(source) {
  for await (const event of source) {
    const data = event?.data ?? {};
    const record = {
      timestamp: new Date().toISOString(),
      event: event?.type ?? "unknown",
      file: typeof data.file === "string" ? data.file : null,
      name: typeof data.name === "string" ? data.name : null,
      nesting: Number.isInteger(data.nesting) ? data.nesting : null,
      duration_ms: Number.isFinite(data.details?.duration_ms)
        ? data.details.duration_ms
        : Number.isFinite(data.duration_ms) ? data.duration_ms : null,
      error_code: data.details?.error?.code ?? data.error?.code ?? null,
    };
    yield `${JSON.stringify(record)}\n`;
  }
}
