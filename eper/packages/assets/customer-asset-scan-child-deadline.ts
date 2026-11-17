/** Race child initialization or execution against the child's absolute abort deadline. */
export function awaitCustomerAssetScanChildDeadline<T>(
  operation: Promise<T> | T,
  abort: Promise<never>,
  signal: AbortSignal,
  disposeLate?: (value: T) => void,
): Promise<T> {
  const pending = Promise.resolve(operation);
  if (disposeLate) {
    void pending.then((value) => {
      if (signal.aborted) disposeLate(value);
    }).catch(() => undefined);
  } else {
    // A timed-out import/factory may reject after the caller has moved on.
    void pending.catch(() => undefined);
  }
  return Promise.race([pending, abort]);
}
