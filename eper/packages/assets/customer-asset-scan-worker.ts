import { randomBytes } from "node:crypto";
import type { AuditEnvironment } from "../audit/audit-event-store.js";
import type { CustomerAssetScanChildStart } from "./customer-asset-scan-child-protocol.js";
import type { CustomerAssetScanChildOutcome } from "./customer-asset-scan-child-supervisor.js";
import type { PostgresCustomerAssetRepository } from "./postgres-customer-asset-repository.js";
import type { TrustedMalwareScanOutcome } from "./storage-malware-scan-adapter.js";

/**
 * Scanner adapters should honor AbortSignal promptly. If an adapter ignores
 * cancellation, timeout stops lease renewal and permits a replacement claim;
 * claim-generation fencing prevents the late result from mutating durable state.
 * This permits temporary provider-side overlap and is not hard process isolation.
 */
export interface CustomerAssetScanner {
  scan(input: {
    tenantId: string; applicationId: string; assetId: string; uploadSessionId: string;
    providerUploadReference: string; checksumSha256: string; sizeBytes: number; mimeType: string;
  }, requestId: string, signal: AbortSignal): Promise<TrustedMalwareScanOutcome>;
}
export interface CustomerAssetScanWorkerOptions {
  repository: PostgresCustomerAssetRepository;
  scanner?: CustomerAssetScanner;
  childRunner?: (start: CustomerAssetScanChildStart, signal: AbortSignal, timeoutMs: number) => Promise<CustomerAssetScanChildOutcome>;
  tenantId: string; applicationId: string; workerId: string; scannerServiceId: string;
  environment: AuditEnvironment; signal: AbortSignal;
  pollIntervalMs?: number; leaseMs?: number; batchSize?: number; concurrency?: number; scanTimeoutMs?: number;
  onError?: (error: unknown) => void;
  onJob?: (result: { uploadSessionId: string; outcome: "completed" | "retry" | "dead_letter" | "lease_lost" }) => void;
}
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  if (signal.aborted) return resolve();
  const timer = setTimeout(done, ms);
  function done() {
    clearTimeout(timer);
    signal.removeEventListener("abort", done);
    resolve();
  }
  signal.addEventListener("abort", done, { once: true });
});

/** Polls the durable outbox; each result remains fenced by the current DB lease. */
export async function runCustomerAssetScanWorker(options: CustomerAssetScanWorkerOptions): Promise<void> {
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const leaseMs = options.leaseMs ?? 60_000;
  const batchSize = options.batchSize ?? 10;
  const concurrency = options.concurrency ?? 2;
  const scanTimeoutMs = options.scanTimeoutMs ?? 120_000;
  if (!!options.scanner === !!options.childRunner) throw new Error("EPER_CUSTOMER_ASSET_SCAN_EXECUTOR_INVALID");
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 100 || pollIntervalMs > 60_000 ||
      !Number.isInteger(leaseMs) || leaseMs < 5_000 || leaseMs > 900_000 ||
      !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50 ||
      !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10 ||
      !Number.isInteger(scanTimeoutMs) || scanTimeoutMs < 1_000 || scanTimeoutMs > 900_000) {
    throw new Error("EPER_CUSTOMER_ASSET_WORKER_OPTIONS_INVALID");
  }
  while (!options.signal.aborted) {
    try {
      const jobs = await options.repository.claimScanJobs({
        tenantId: options.tenantId, applicationId: options.applicationId,
        workerId: options.workerId, scannerServiceId: options.scannerServiceId,
        environment: options.environment, limit: Math.min(batchSize, concurrency), leaseMs,
      });
      for (let offset = 0; offset < jobs.length && !options.signal.aborted; offset += concurrency) {
        const batch = jobs.slice(offset, offset + concurrency);
        await Promise.all(batch.map(async (job) => {
          let leaseLost = false;
          let renewing = false;
          let renewalInFlight: Promise<void> | undefined;
          const renewTimer = setInterval(() => {
            if (renewing || leaseLost || options.signal.aborted) return;
            renewing = true;
            renewalInFlight = (async () => {
              try {
                const renewed = await options.repository.renewScanJobLease({
                  tenantId: options.tenantId, applicationId: options.applicationId,
                  uploadSessionId: job.uploadSessionId, workerId: options.workerId, leaseMs,
                  claimGeneration: job.claimGeneration,
                });
                if (!renewed) leaseLost = true;
              } catch (error) {
                leaseLost = true;
                options.onError?.(error);
              } finally {
                renewing = false;
                renewalInFlight = undefined;
              }
            })();
          }, Math.max(1_000, Math.floor(leaseMs / 3)));
          try {
            const session = await options.repository.getUploadSessionForScanning(
              options.tenantId, options.applicationId, job.uploadSessionId, options.workerId, job.claimGeneration,
            );
            if (!session) { leaseLost = true; options.onJob?.({ uploadSessionId: job.uploadSessionId, outcome: "lease_lost" }); return; }
            let outcome: TrustedMalwareScanOutcome;
            const scanController = new AbortController();
            const abortScanOnShutdown = () => scanController.abort();
            if (options.signal.aborted) scanController.abort();
            else options.signal.addEventListener("abort", abortScanOnShutdown, { once: true });
            let scanTimer: ReturnType<typeof setTimeout> | undefined;
            try {
              // Child supervision owns its hard deadline and does not settle until the
              // OS process emits close. Never race it against the parent's cooperative
              // timeout: that could release the claim while a killed child is still exiting.
              if (options.childRunner) {
                const start: CustomerAssetScanChildStart = {
                  version: 3, type: "start", jobToken: randomBytes(32).toString("hex"),
                  claimGeneration: job.claimGeneration, requestId: job.correlationId,
                  workerId: options.workerId, scannerServiceId: options.scannerServiceId,
                  input: {
                    tenantId: options.tenantId, applicationId: options.applicationId,
                    assetId: session.assetId, checksumSha256: session.checksumSha256,
                    sizeBytes: session.sizeBytes, mimeType: session.mimeType,
                  },
                };
                const child = await options.childRunner(start, scanController.signal, scanTimeoutMs);
                outcome = child.kind === "result"
                  ? { scanStatus: child.value.scanStatus, scannerServiceId: child.value.scannerServiceId }
                  : { scanStatus: "error", scannerServiceId: options.scannerServiceId };
              } else {
                // Legacy in-process scanners use cooperative cancellation only.
                // Production bootstrap rejects this path until child isolation is enabled.
                const scanPromise = Promise.resolve().then(() => options.scanner!.scan({
                  tenantId: options.tenantId, applicationId: options.applicationId,
                  assetId: session.assetId, uploadSessionId: job.uploadSessionId,
                  providerUploadReference: session.providerUploadReference,
                  checksumSha256: session.checksumSha256, sizeBytes: session.sizeBytes, mimeType: session.mimeType,
                }, job.correlationId, scanController.signal));
                const timeout = new Promise<never>((_, reject) => {
                  scanTimer = setTimeout(() => {
                    // Stop renewing this claim immediately; generation fencing rejects late writes.
                    leaseLost = true;
                    clearInterval(renewTimer);
                    scanController.abort();
                    reject(new Error("EPER_CUSTOMER_ASSET_SCAN_TIMEOUT"));
                  }, scanTimeoutMs);
                });
                try {
                  outcome = await Promise.race([scanPromise, timeout]);
                } catch (error) {
                  // The legacy provider promise may ignore cancellation; do not await it.
                  throw error;
                }
              }
            } catch (error) {
              options.onError?.(error);
              outcome = { scanStatus: "error", scannerServiceId: options.scannerServiceId };
            } finally {
              if (scanTimer) clearTimeout(scanTimer);
              options.signal.removeEventListener("abort", abortScanOnShutdown);
            }
            if (leaseLost || options.signal.aborted) {
              options.onJob?.({ uploadSessionId: job.uploadSessionId, outcome: "lease_lost" }); return;
            }
            if (outcome.scannerServiceId !== options.scannerServiceId ||
                !["clean", "infected", "error"].includes(outcome.scanStatus)) {
              outcome = { scanStatus: "error", scannerServiceId: options.scannerServiceId };
            }
            if (outcome.scanStatus === "error") {
              const attempt = Math.max(1, Math.min(session.attempt, 5));
              const retryAfterMs = Math.min(3_600_000, 15_000 * (2 ** (attempt - 1)));
              const retry = await options.repository.retryScanJob({
                tenantId: options.tenantId, applicationId: options.applicationId,
                uploadSessionId: job.uploadSessionId, workerId: options.workerId,
                claimGeneration: job.claimGeneration, errorCode: "SCANNER_PROVIDER_ERROR", retryAfterMs,
              });
              if (retry === "pending") {
                options.onJob?.({ uploadSessionId: job.uploadSessionId, outcome: "retry" }); return;
              }
              if (retry === "lease_lost") {
                options.onJob?.({ uploadSessionId: job.uploadSessionId, outcome: "lease_lost" }); return;
              }
            }
            await options.repository.recordScanResult({
              tenantId: options.tenantId, applicationId: options.applicationId,
              scannerServiceId: options.scannerServiceId, workerId: options.workerId,
              environment: options.environment, correlationId: job.correlationId,
              uploadSessionId: job.uploadSessionId, scanStatus: outcome.scanStatus,
              claimGeneration: job.claimGeneration,
            });
            options.onJob?.({ uploadSessionId: job.uploadSessionId,
              outcome: outcome.scanStatus === "error" ? "dead_letter" : "completed" });
          } catch (error) {
            options.onError?.(error);
          } finally {
            clearInterval(renewTimer);
            // Do not let a lease-renewal query outlive this job's lifecycle.
            await renewalInFlight;
          }
        }));
      }
      if (jobs.length === 0 && !options.signal.aborted) await sleep(pollIntervalMs, options.signal);
    } catch (error) {
      options.onError?.(error);
      if (!options.signal.aborted) await sleep(pollIntervalMs, options.signal);
    }
  }
}
