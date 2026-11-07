/** Provider outcomes are explicit: only a definitive rejection may terminally fail a reservation. */
export type StorageUploadProviderOutcome =
  | { kind: "succeeded"; providerUploadReference: string; url: string; method: "PUT" | "POST"; expiresAt: string; headers: Record<string, string> }
  | { kind: "rejected"; rejectionCode: string }
  | { kind: "unknown"; reason: "timeout" | "transport" | "malformed_response" | "persistence_uncertain" }
  | { kind: "not_found" }
  | { kind: "unavailable" };

export interface StorageUploadProviderCapabilities {
  /** Provider create is idempotent for the server-generated uploadSessionId. */
  idempotentCreateByUploadSessionId: boolean;
  /** Provider can authoritatively find the object using the same uploadSessionId. */
  lookupByUploadSessionId: boolean;
  /** Provider can renew a grant for one exact persisted provider reference. */
  renewByProviderReference: boolean;
}

/** Authoritative provider lookup result for a durable upload operation ID. */
export type StorageUploadLookupOutcome =
  | { kind: "found"; providerUploadReference: string }
  | { kind: "not_found" }
  | { kind: "unknown" }
  | { kind: "unavailable" };
