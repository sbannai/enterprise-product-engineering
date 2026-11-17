export type CustomerAssetScanChildCleanup = () => void | Promise<void>;
export type CustomerAssetScanChildCleanupRegistrar = (cleanup: CustomerAssetScanChildCleanup) => void;

/**
 * Tracks resources as soon as they are acquired. Cleanup is LIFO, idempotent,
 * and best-effort: one failing disposer never prevents later disposers.
 */
export function createCustomerAssetScanChildCleanupRegistry(): {
  register: CustomerAssetScanChildCleanupRegistrar;
  close: () => Promise<unknown[]>;
} {
  const cleanups: CustomerAssetScanChildCleanup[] = [];
  let closing: Promise<unknown[]> | undefined;

  return {
    register(cleanup) {
      if (typeof cleanup !== "function" || closing) {
        throw new Error("CUSTOMER_ASSET_SCAN_CHILD_CLEANUP_REGISTRATION_INVALID");
      }
      cleanups.push(cleanup);
    },
    close() {
      if (closing) return closing;
      closing = (async () => {
        const errors: unknown[] = [];
        while (cleanups.length) {
          const cleanup = cleanups.pop()!;
          try {
            await cleanup();
          } catch (error) {
            errors.push(error);
          }
        }
        return errors;
      })();
      return closing;
    },
  };
}
