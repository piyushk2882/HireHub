const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { app } = require("../src/server");

describe("API Health & Routing Integration Tests", () => {
  let server;
  let baseUrl;

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("GET / should return root welcome text", async () => {
    const res = await fetch(`${baseUrl}/`);
    const text = await res.text();

    assert.equal(res.status, 200);
    assert.equal(text, "Welcome to HireHub Backend!");
  });

  it("GET /api/health should respond with valid health contract", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const data = await res.json();

    assert.ok(data.message, "Should have message field");
    assert.ok(data.timestamp, "Should have timestamp field");
    assert.ok(data.services, "Should have services field");
    assert.equal(data.services.api, "healthy", "API service should be healthy");
    assert.ok(data.services.database, "Database service info should be included");
    assert.ok(typeof data.services.database.status === "string", "DB status should be string");

    // Must never leak secrets or passwords in API response
    const jsonStr = JSON.stringify(data);
    assert.equal(jsonStr.includes("mongodb+srv"), false, "Must not leak connection URI");
    assert.equal(jsonStr.includes("password"), false, "Must not leak password");
  });
});

