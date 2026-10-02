const test = require('node:test');
const assert = require('node:assert/strict');
const { server } = require('../src/app');

let baseUrl;

test('HTTP API smoke: health endpoint responds from a real listening server', async (t) => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('HTTP API smoke: record creation validates input and returns created resource', async () => {
  const response = await fetch(`${baseUrl}/api/v1/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'UAT-HTTP-463-001', tenantId: 'TENANT-A', name: 'UAT API Record' }),
  });
  assert.equal(response.status, 201);
  const record = await response.json();
  assert.equal(record.id, 'UAT-HTTP-463-001');
  assert.equal(record.tenantId, 'TENANT-A');
  assert.equal(record.version, 1);
});

test('HTTP API smoke: invalid record is rejected with a client error', async () => {
  const response = await fetch(`${baseUrl}/api/v1/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'UAT-HTTP-463-INVALID', tenantId: 'TENANT-A', name: 'x' }),
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /at least 3 characters/);
});

test('HTTP API smoke: records can be retrieved through the reporting endpoint', async () => {
  const response = await fetch(`${baseUrl}/api/v1/records`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(Array.isArray(body.items));
  assert.ok(body.items.some((record) => record.id === 'UAT-HTTP-463-001'));
});
