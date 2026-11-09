const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeMongoUri, getDBStatus } = require("../src/config/database");

describe("Database Configuration & Security Tests", () => {
  it("should sanitize mongo URI and never expose username or password", () => {
    const rawUri = "mongodb+srv://adminUser:SuperSecretPassword123@hirehub-cluster.mongodb.net/hirehub?retryWrites=true&w=majority";
    const sanitized = sanitizeMongoUri(rawUri);

    assert.equal(sanitized.includes("SuperSecretPassword123"), false, "Password must not be exposed");
    assert.equal(sanitized.includes("adminUser"), false, "Username must not be exposed");
    assert.ok(sanitized.includes("***:***"), "Should replace credentials with masked placeholder");
  });

  it("should safely handle null or empty URIs in sanitizer", () => {
    assert.equal(sanitizeMongoUri(null), "unknown");
    assert.equal(sanitizeMongoUri(""), "unknown");
    assert.equal(sanitizeMongoUri(undefined), "unknown");
  });

  it("should return safe database status without internal credentials", () => {
    const status = getDBStatus();

    assert.ok(typeof status.configured === "boolean", "Configured should be boolean");
    assert.ok(typeof status.status === "string", "Status should be string");
    assert.ok(typeof status.readyState === "number", "ReadyState should be number");
    assert.equal(status.password, undefined, "Password must never be part of status object");
    assert.equal(status.uri, undefined, "URI must never be part of status object");
  });
});

