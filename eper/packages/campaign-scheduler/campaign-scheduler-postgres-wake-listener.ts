import { createRequire } from "node:module";

const CHANNEL = "eper_campaign_execution_wake";

interface NotificationMessage {
  channel?: string;
  payload?: string;
}
interface PgClientLike {
  connect(): Promise<void>;
  query(sql: string): Promise<unknown>;
  end(): Promise<void>;
  on(event: "notification", listener: (message: NotificationMessage) => void): this;
  on(event: "error" | "end", listener: (error?: unknown) => void): this;
}
interface PgClientConstructor {
  new (options: { connectionString: string; application_name: string }): PgClientLike;
}

export interface CampaignSchedulerWakeListener {
  start(): Promise<void>;
  waitForWake(timeoutMs: number, signal?: AbortSignal): Promise<void>;
  close(): Promise<void>;
}

export interface CampaignSchedulerWakeListenerOptions {
  connectionString: string;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  onError?: (error: unknown) => void;
}

/**
 * Dedicated PostgreSQL LISTEN connection. Notifications are lossy wake hints;
 * callers must always reconcile against the durable execution queue.
 */
export function createCampaignSchedulerWakeListener(
  options: CampaignSchedulerWakeListenerOptions,
): CampaignSchedulerWakeListener {
  if (!options.connectionString.trim()) throw new Error("CAMPAIGN_WAKE_DATABASE_URL_REQUIRED");
  const reconnectDelayMs = options.reconnectDelayMs ?? 250;
  const maxReconnectDelayMs = options.maxReconnectDelayMs ?? 10_000;
  if (!Number.isInteger(reconnectDelayMs) || reconnectDelayMs < 50 || reconnectDelayMs > 30_000 ||
      !Number.isInteger(maxReconnectDelayMs) || maxReconnectDelayMs < reconnectDelayMs || maxReconnectDelayMs > 120_000) {
    throw new Error("CAMPAIGN_WAKE_RECONNECT_DELAY_INVALID");
  }

  const require = createRequire(import.meta.url);
  const pg = require("pg") as { Client: PgClientConstructor };
  const waiters = new Set<() => void>();
  let stopped = false;
  let started = false;
  let connected = false;
  let pendingWake = false;
  let connectionLoop: Promise<void> | undefined;
  let initialConnection: Promise<void> | undefined;
  let resolveInitialConnection: (() => void) | undefined;

  const notifyWaiters = () => {
    pendingWake = true;
    for (const wake of [...waiters]) wake();
  };

  const delay = (milliseconds: number) => new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    if (stopped) {
      clearTimeout(timer);
      resolve();
    }
  });

  const connectLoop = async (): Promise<void> => {
    let backoff = reconnectDelayMs;
    while (!stopped) {
      const client = new pg.Client({
        connectionString: options.connectionString,
        application_name: "eper-campaign-scheduler-wake-listener",
      });
      let disconnect: (() => void) | undefined;
      const disconnected = new Promise<void>((resolve) => { disconnect = resolve; });
      let disconnectedOnce = false;
      const markDisconnected = (error?: unknown) => {
        if (disconnectedOnce) return;
        disconnectedOnce = true;
        connected = false;
        if (error) options.onError?.(error);
        disconnect?.();
      };
      client.on("notification", (message) => {
        if (message.channel === CHANNEL) notifyWaiters();
      });
      client.on("error", (error) => markDisconnected(error));
      client.on("end", () => markDisconnected());

      try {
        await client.connect();
        await client.query("LISTEN " + CHANNEL);
        connected = true;
        backoff = reconnectDelayMs;
        resolveInitialConnection?.();
        resolveInitialConnection = undefined;
        await disconnected;
      } catch (error) {
        markDisconnected(error);
        resolveInitialConnection?.();
        resolveInitialConnection = undefined;
      } finally {
        connected = false;
        try { await client.end(); } catch (error) { options.onError?.(error); }
      }
      if (!stopped) {
        await delay(backoff);
        backoff = Math.min(maxReconnectDelayMs, backoff * 2);
      }
    }
  };

  return {
    async start(): Promise<void> {
      if (started) return initialConnection;
      started = true;
      initialConnection = new Promise<void>((resolve) => { resolveInitialConnection = resolve; });
      connectionLoop = connectLoop();
      await initialConnection;
    },

    waitForWake(timeoutMs: number, signal?: AbortSignal): Promise<void> {
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
        return Promise.reject(new Error("CAMPAIGN_WAKE_WAIT_TIMEOUT_INVALID"));
      }
      if (signal?.aborted) return Promise.resolve();
      if (pendingWake) {
        pendingWake = false;
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          waiters.delete(finish);
          signal?.removeEventListener("abort", finish);
          pendingWake = false;
          resolve();
        };
        const timer = setTimeout(finish, timeoutMs);
        waiters.add(finish);
        signal?.addEventListener("abort", finish, { once: true });
        if (pendingWake) finish();
      });
    },

    async close(): Promise<void> {
      if (stopped) return connectionLoop;
      stopped = true;
      notifyWaiters();
      resolveInitialConnection?.();
      resolveInitialConnection = undefined;
      await connectionLoop;
    },
  };
}
