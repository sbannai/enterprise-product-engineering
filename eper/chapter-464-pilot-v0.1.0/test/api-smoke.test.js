const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../src/app');

test('authenticated caller without report permission receives 403', async () => {
  const server = createServer({ resolveContext: () => ({
    authenticated: true,
    principalId: 'report-denied-user',
    tenantIds: ['TENANT-A'],
    permissions: [],
  }) });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/suppliers`);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'forbidden' });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
