export const PROVIDER_OPERATION_WAKE_CHANNEL = "eper_provider_operation_wakeup";
const PROVIDER_OPERATION_WAKE_PAYLOAD = "wake";

export interface PostgresNotificationMessage {
  channel: string;
  payload?: string;
}

export interface PostgresNotificationClient {
  connect(): Promise<void>;
  query(sql: string, values?: unknown[]): Promise<unknown>;
  end(): Promise<void>;
  on(event: "notification", listener: (message: PostgresNotificationMessage) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
}

export type PostgresNotificationClientFactory = () => PostgresNotificationClient;

type Waiter = {
  resolve(value: "notified" | "timeout"): void;
  reject(error: Error): void;
  cleanup(): void;
};

/**
 * Dedicated PostgreSQL LISTEN connection for provider queue wake-ups.
 * The notification payload is a fixed non-sensitive constant; workers must
 * always discover and authorize work through their tenant/application-scoped DB queries.
 */
export class PostgresProviderQueueWakeSource {
  private client: PostgresNotificationClient | null = null;
  private connecting: Promise<void> | null = null;
  private waiter: Waiter | null = null;
  private pendingWake = false;
  private closed = false;

  constructor(private readonly createClient: PostgresNotificationClientFactory) {
    if (typeof createClient !== "function") throw new Error("PROVIDER_QUEUE_LISTENER_FACTORY_REQUIRED");
  }

  async start(): Promise<void> {
    await this.ensureConnected();
  }

  async wait(timeoutMs: number, signal: AbortSignal): Promise<"notified" | "timeout"> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
      throw new Error("PROVIDER_QUEUE_LISTENER_TIMEOUT_INVALID");
    }
    if (this.closed) throw new Error("PROVIDER_QUEUE_LISTENER_CLOSED");
    if (signal.aborted) return "timeout";
    await this.ensureConnected();
    if (this.pendingWake) {
      this.pendingWake = false;
      return "notified";
    }
    if (this.waiter) throw new Error("PROVIDER_QUEUE_LISTENER_WAIT_ALREADY_ACTIVE");

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (value: "notified" | "timeout") => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        if (this.waiter === waiter) this.waiter = null;
        resolve(value);
      };
      const onAbort = () => finish("timeout");
      const timer = setTimeout(() => finish("timeout"), timeoutMs);
      const waiter: Waiter = {
        resolve: finish,
        reject: (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
          if (this.waiter === waiter) this.waiter = null;
          reject(error);
        },
        cleanup: () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
        },
      };
      this.waiter = waiter;
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
      if (this.pendingWake && !settled) {
        this.pendingWake = false;
        finish("notified");
      }
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.waiter?.resolve("timeout");
    this.waiter = null;
    const client = this.client;
    this.client = null;
    if (client) await client.end();
  }

  private async ensureConnected(): Promise<void> {
    if (this.closed) throw new Error("PROVIDER_QUEUE_LISTENER_CLOSED");
    if (this.client) return;
    if (this.connecting) return this.connecting;

    const client = this.createClient();
    const onNotification = (message: PostgresNotificationMessage) => {
      if (message.channel !== PROVIDER_OPERATION_WAKE_CHANNEL
        || message.payload !== PROVIDER_OPERATION_WAKE_PAYLOAD) return;
      if (this.waiter) this.waiter.resolve("notified");
      else this.pendingWake = true;
    };
    const onError = (error: Error) => {
      if (this.client === client) this.client = null;
      this.waiter?.reject(new Error("PROVIDER_QUEUE_LISTENER_CONNECTION_LOST"));
      void client.end().catch(() => undefined);
      void error;
    };
    client.on("notification", onNotification);
    client.on("error", onError);

    this.connecting = (async () => {
      try {
        await client.connect();
        await client.query("LISTEN " + PROVIDER_OPERATION_WAKE_CHANNEL);
        if (this.closed) {
          await client.end();
          return;
        }
        this.client = client;
      } catch {
        await client.end().catch(() => undefined);
        throw new Error("PROVIDER_QUEUE_LISTENER_CONNECT_FAILED");
      }
    })();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }
}
