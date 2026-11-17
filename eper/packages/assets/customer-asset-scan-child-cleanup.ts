export type CustomerAssetScanChildCleanup = () => void | Promise<void>;
export type CustomerAssetScanChildCleanupRegistrar = (cleanup: CustomerAssetScanChildCleanup) => void;

/**
 * Tracks resources as soon as they are acquired. Cleanup is LIFO, idempotent,
 * and best-effort. Registrations made after close starts are disposed
 * immediately, which contains resources acquired by factories that settle late
 * after their caller has timed out.
 */
export function createCustomerAssetScanChildCleanupRegistry(): {
  register: CustomerAssetScanChildCleanupRegistrar;
  close: () => Promise<unknown[]>;
} {
  const cleanups: CustomerAssetScanChildCleanup[] = [];
  const pending = new Set<Promise<void>>();
  const errors: unknown[] = [];
  let closing = false;
  let closePromise: Promise<unknown[]> | undefined;

  function run(cleanup: CustomerAssetScanChildCleanup): void {
    const task = Promise.resolve()
      .then(cleanup)
      .then(() => undefined, (error: unknown) => {
        errors.push(error);
      });
    pending.add(task);
    void task.then(() => pending.delete(task));
  }

  return {
    register(cleanup) {
      if (typeof cleanup !== "function") {
        throw new Error("CUSTOMER_ASSET_SCAN_CHILD_CLEANUP_REGISTRATION_INVALID");
      }
      if (closing) {
        // Do not append to a stack that may already have been drained. Execute
        // late disposers immediately and contain rejection in run().
        run(cleanup);
        return;
      }
      cleanups.push(cleanup);
    },
    close() {
      if (closePromise) return closePromise;
      closing = true;
      closePromise = (async () => {
        // Drain LIFO acquisitions and any late registrations that arrive while
        // an earlier disposer is still settling.
        while (cleanups.length || pending.size) {
          while (cleanups.length) run(cleanups.pop()!);
          if (pending.size) await Promise.all([...pending]);
        }
        return errors;
      })();
      return closePromise;
    },
  };
}
