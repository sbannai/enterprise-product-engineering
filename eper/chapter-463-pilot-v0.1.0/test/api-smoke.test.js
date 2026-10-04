const test = require('node:test');
const assert = require('node:assert/strict');
const { server: unauthenticatedServer, createServer } = require('../src/app');

const testContext = {
  authenticated: true,
  principalId: 'test-user',
  tenantIds: ['TENANT-A'],
  permissions: ['record:create', 'record:read', 'report:read'],
};
const server = createServer({ resolveContext: () => testContext });
let baseUrl;
let unauthenticatedBaseUrl;

async function listen(target) {
  await new Promise((resolve, reject) => {
    target.once('error', reject);
    target.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${target.address().port}`;
}
async function close(target) {
  if (target.listening) {
    await new Promise((resolve, reject) => target.close((error) => error ? reject(error) : resolve()));
  }
}

test.before(async () => {
  baseUrl = await listen(server);
  unauthenticatedBaseUrl = await listen(unauthenticatedServer);
});
test.after(async () => {
  await Promise.all([close(server), close(unauthenticatedServer)]);
});

test('health endpoint responds without an identity provider', async () => {
  const response = await fetch(`${unauthenticatedBaseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('default API denies GET and POST when no trusted identity resolver is configured', async () => {
  const getResponse = await fetch(`${unauthenticatedBaseUrl}/api/v1/records`);
  assert.equal(getResponse.status, 401);
  assert.deepEqual(await getResponse.json(), { error: 'authentication required' });
  const postResponse = await fetch(`${unauthenticatedBaseUrl}/api/v1/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'UNAUTH-463-001', tenantId: 'TENANT-A', name: 'Should not be created' }),
  });
  assert.equal(postResponse.status, 401);
  assert.deepEqual(await postResponse.json(), { error: 'authentication required' });
});

test('injected test identity can create a valid record', async () => {
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

test('invalid record is rejected with a client error', async () => {
  const response = await fetch(`${baseUrl}/api/v1/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'UAT-HTTP-463-INVALID', tenantId: 'TENANT-A', name: 'x' }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /at least 3 characters/);
});

test('records can be retrieved through the reporting endpoint', async () => {
  const response = await fetch(`${baseUrl}/api/v1/records`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(Array.isArray(body.items));
  assert.ok(body.items.some((record) => record.id === 'UAT-HTTP-463-001'));
});

test('authenticated caller without report permission receives 403', async () => {
  const deniedServer = createServer({ resolveContext: () => ({
    authenticated: true,
    principalId: 'report-denied-user',
    tenantIds: ['TENANT-A'],
    permissions: ['record:read'],
  }) });
  const deniedUrl = await listen(deniedServer);
  try {
    const response = await fetch(`${deniedUrl}/api/v1/records`);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'forbidden' });
  } finally {
    await close(deniedServer);
  }
});
