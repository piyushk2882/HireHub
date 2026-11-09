const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { connectDB, getDBStatus } = require("../src/config/database");
const { app } = require("../src/server");

describe("Database Connection Failure & 503 Readiness Handling", () => {
  it("should handle unreachable MongoDB URI gracefully and return 503 from /api/health", async () => {
    const originalUri = process.env.MONGODB_URI;

    // Set invalid/unreachable URI with short timeout
    process.env.MONGODB_URI = "mongodb://127.0.0.1:27099/unreachable_hirehub?serverSelectionTimeoutMS=500";

    const result = await connectDB();
    assert.equal(result, null, "connectDB should return null gracefully on connection failure");

    const status = getDBStatus();
    assert.equal(status.configured, true, "Database should be flagged as configured");
    assert.equal(status.isConnected, false, "Database isConnected should be false");

    // Test API response under unavailable DB condition
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    const data = await res.json();

    assert.equal(res.status, 503, "Expected 503 Service Unavailable when DB is down");
    assert.equal(data.success, false);
    assert.ok(data.message.includes("Database connection unavailable"));
    assert.equal(data.services.api, "healthy");
    assert.equal(data.services.database.status, "disconnected");

    // Clean up
    await new Promise((resolve) => server.close(resolve));
    process.env.MONGODB_URI = originalUri;
  });
});

