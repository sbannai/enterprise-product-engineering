test("local capability API returns 400 for malformed percent-encoding in requirement ID", async () => {
  const keys = ["EPER_LOCAL_CAPABILITY_API", "EPER_LOCAL_CAPABILITY_TOKEN", "EPER_LOCAL_TENANT_ID", "EPER_LOCAL_PRINCIPAL_ID"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_LOCAL_CAPABILITY_API: "true",
    EPER_LOCAL_CAPABILITY_TOKEN: "local-test-token-0123456789-0123456789",
    EPER_LOCAL_TENANT_ID: "test-tenant",
    EPER_LOCAL_PRINCIPAL_ID: "test-operator",
  });
  try {
    const response = await fetch(`${await startServer()}/internal/requirements/%E0%A4%A/execute`, {
      method: "POST",
      headers: {
        authorization: "Bearer local-test-token-0123456789-0123456789",
        "content-type": "application/json",
      },
      body: JSON.stringify({ payload: { operation: "validate", input: {} } }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_requirement_id_encoding" });
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
