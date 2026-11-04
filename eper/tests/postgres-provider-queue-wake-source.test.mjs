import test from "node:test";
import assert from "node:assert/strict";
import { PostgresProviderQueueWakeSource, PROVIDER_OPERATION_WAKE_CHANNEL } from "../dist/packages/integrations/postgres-provider-queue-wake-source.js";

class FakeClient {
  listeners = { notification: [], error: [] };
  queries = [];
  ended = 0;
  async connect() {}
  async query(sql) { this.queries.push(sql); }
  async end() { this.ended++; }
  on(event, listener) { this.listeners[event].push(listener); }
  notify(channel, payload) { for (const fn of this.listeners.notification) fn({ channel, payload }); }
  fail(error = new Error("connection lost")) { for (const fn of this.listeners.error) fn(error); }
}

test("listener subscribes before host scans and buffers a generic wake", async () => {
  const client = new FakeClient();
  const source = new PostgresProviderQueueWakeSource(() => client);
  await source.start();
  assert.deepEqual(client.queries, ["LISTEN " + PROVIDER_OPERATION_WAKE_CHANNEL]);
  client.notify(PROVIDER_OPERATION_WAKE_CHANNEL, "wake");
  assert.equal(await source.wait(100, new AbortController().signal), "notified");
  await source.close();
  assert.equal(client.ended, 1);
});

test("listener ignores unexpected channels and payloads", async () => {
  const client = new FakeClient();
  const source = new PostgresProviderQueueWakeSource(() => client);
  await source.start();
  client.notify("other_channel", "wake");
  client.notify(PROVIDER_OPERATION_WAKE_CHANNEL, "tenant=secret");
  const controller = new AbortController();
  const waiting = source.wait(5, controller.signal);
  assert.equal(await waiting, "timeout");
  await source.close();
});

test("listener reconnects after connection loss on the next wait", async () => {
  const clients = [new FakeClient(), new FakeClient()];
  let index = 0;
  const source = new PostgresProviderQueueWakeSource(() => clients[index++]);
  await source.start();
  clients[0].fail();
  const result = await source.wait(100, new AbortController().signal);
  assert.equal(result, "timeout");
  assert.deepEqual(clients[1].queries, ["LISTEN " + PROVIDER_OPERATION_WAKE_CHANNEL]);
  await source.close();
});
