import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const token = "x".repeat(40);
let server;
let baseUrl;
const originalEnabled = process.env.EPER_REQUIREMENTS_API_ENABLED;
const originalToken = process.env.EPER_REQUIREMENTS_API_TOKEN;

before(async () => {
  process.env.EPER_REQUIREMENTS_API_ENABLED = "true";
  process.env.EPER_REQUIREMENTS_API_TOKEN = token;
  server = createAppServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server?.listening) {
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    );
  }
  if (originalEnabled === undefined) delete process.env.EPER_REQUIREMENTS_API_ENABLED;
  else process.env.EPER_REQUIREMENTS_API_ENABLED = originalEnabled;
  if (originalToken === undefined) delete process.env.EPER_REQUIREMENTS_API_TOKEN;
  else process.env.EPER_REQUIREMENTS_API_TOKEN = originalToken;
});

const headers = (value = token) => ({ authorization: `Bearer ${value}` });

test("list endpoint exposes the canonical 228-row registry with stable pagination", async () => {
  const response = await fetch(`${baseUrl}/v1/requirements?limit=3&offset=2`, { headers: headers() });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.apiVersion, "1.0.0");
  assert.equal(body.source, "requirement-registry");
  assert.equal(body.total, 228);
  assert.equal(body.limit, 3);
  assert.equal(body.offset, 2);
  assert.equal(body.requirements.length, 3);
  assert.deepEqual(body.requirements.map((row) => [row.chapter, row.sequence]), [[463, 3], [463, 4], [463, 5]]);
  assert.equal(body.requirements[0].id, "REQ-46303");
});

test("list endpoint filters by chapter, capability, pattern, SRS, and text query", async () => {
  const chapterResponse = await fetch(`${baseUrl}/v1/requirements?chapter=463`, { headers: headers() });
  const chapterBody = await chapterResponse.json();
  assert.equal(chapterResponse.status, 200);
  assert.equal(chapterBody.total, 6);
  assert.ok(chapterBody.requirements.every((row) => row.chapter === 463));

  const filteredResponse = await fetch(`${baseUrl}/v1/requirements?chapter=463&pattern=XX03&capability=business-validation`, { headers: headers() });
  const filteredBody = await filteredResponse.json();
  assert.equal(filteredResponse.status, 200);
  assert.equal(filteredBody.total, 1);
  assert.equal(filteredBody.requirements[0].id, "REQ-46303");

  const searchResponse = await fetch(`${baseUrl}/v1/requirements?q=SRS-FR-2325`, { headers: headers() });
  const searchBody = await searchResponse.json();
  assert.equal(searchResponse.status, 200);
  assert.equal(searchBody.total, 1);
  assert.equal(searchBody.requirements[0].id, "REQ-46303");
});

test("detail endpoint returns the exact registry binding and 404 for an unknown ID", async () => {
  const response = await fetch(`${baseUrl}/v1/requirements/REQ-46301`, { headers: headers() });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.requirement.id, "REQ-46301");
  assert.equal(body.requirement.brd, "BRD-001-REQ-46301");
  assert.equal(body.requirement.chapter, 463);
  assert.equal(body.requirement.apiContract, "API:capability-resource");

  const missing = await fetch(`${baseUrl}/v1/requirements/REQ-99999`, { headers: headers() });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error, "requirement_not_found");
});

test("registry endpoint requires bearer authentication and validates query parameters", async () => {
  assert.equal((await fetch(`${baseUrl}/v1/requirements`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/v1/requirements`, { headers: headers("wrong") })).status, 401);
  const lowercaseScheme = await fetch(`${baseUrl}/v1/requirements?limit=1`, {
    headers: { authorization: `bearer ${token}` },
  });
  assert.equal(lowercaseScheme.status, 200);

  for (const path of [
    "/v1/requirements?limit=101",
    "/v1/requirements?limit=0",
    "/v1/requirements?offset=-1",
    "/v1/requirements?chapter=0",
    "/v1/requirements?pattern=XX99",
    `/v1/requirements?q=${"x".repeat(201)}`,
  ]) {
    assert.equal((await fetch(baseUrl + path, { headers: headers() })).status, 400, path);
  }
});

test("registry API is GET-only and can be disabled by configuration", async () => {
  const writeAttempt = await fetch(`${baseUrl}/v1/requirements`, {
    method: "POST",
    headers: { ...headers(), "content-type": "application/json" },
    body: JSON.stringify({ id: "REQ-99999" }),
  });
  assert.equal(writeAttempt.status, 404);

  process.env.EPER_REQUIREMENTS_API_ENABLED = "false";
  const disabled = await fetch(`${baseUrl}/v1/requirements`, { headers: headers() });
  assert.equal(disabled.status, 404);
  process.env.EPER_REQUIREMENTS_API_ENABLED = "true";
});
