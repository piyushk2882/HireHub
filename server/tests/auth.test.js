const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { execSync } = require("node:child_process");
const path = require("node:path");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { app } = require("../src/server");
const { User } = require("../src/models");
const { connectDB, disconnectDB } = require("../src/config/database");
const { generateToken, getJwtSecret } = require("../src/utils/jwt");
const { requireAuth, authorizeRoles } = require("../src/middleware/auth.middleware");

describe("Authentication Security Hardening & Authorization Tests", () => {
  let server;
  let baseUrl;
  let testSeekerUser;
  let testRecruiterUser;
  let testInactiveUser;

  const validCsrf = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  const defaultHeaders = {
    "Content-Type": "application/json",
    "Origin": "http://localhost:4200",
    "X-XSRF-TOKEN": validCsrf,
    "Cookie": `XSRF-TOKEN=${validCsrf}`
  };

  // Add dummy protected test endpoints to test authorizeRoles with cookie auth
  app.get("/api/test-protected/seeker", requireAuth, authorizeRoles("job_seeker"), (req, res) => {
    res.json({ success: true, message: "Seeker zone", user: req.user });
  });

  app.get("/api/test-protected/recruiter", requireAuth, authorizeRoles("recruiter"), (req, res) => {
    res.json({ success: true, message: "Recruiter zone", user: req.user });
  });

  app.get("/api/test-protected/admin", requireAuth, authorizeRoles("admin"), (req, res) => {
    res.json({ success: true, message: "Admin zone", user: req.user });
  });

  before(async () => {
    // Connect to database for auth tests
    await connectDB();

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });

    // Clean up any old test users
    await User.deleteMany({ email: /.*@test-hirehub\.example/i });
  });

  after(async () => {
    // Clean up test data
    await User.deleteMany({ email: /.*@test-hirehub\.example/i });
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  });

  describe("POST /api/auth/register", () => {
    it("should register a job seeker, set HttpOnly cookie, and NOT return raw JWT in JSON", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: defaultHeaders,
        body: JSON.stringify({
          name: "Alice Seeker",
          email: "alice@test-hirehub.example",
          password: "SecurePassword123!",
          role: "job_seeker"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 201);
      assert.equal(data.success, true);
      assert.equal(data.message, "Registration successful");
      assert.ok(data.data.user);
      assert.equal(data.data.user.email, "alice@test-hirehub.example");
      assert.equal(data.data.user.role, "job_seeker");
      assert.equal(data.data.user.passwordHash, undefined, "passwordHash must never be returned");
      assert.equal(data.data.token, undefined, "Raw JWT token must NOT be returned in JSON response");

      // Verify Set-Cookie header exists and sets HttpOnly cookie
      const setCookie = res.headers.get("set-cookie");
      assert.ok(setCookie, "Set-Cookie header should be present");
      assert.ok(setCookie.includes("hirehub_token"), "Should set hirehub_token cookie");
      assert.ok(setCookie.toLowerCase().includes("httponly"), "Cookie must be HttpOnly");

      // Verify password was hashed in MongoDB
      const dbUser = await User.findOne({ email: "alice@test-hirehub.example" });
      assert.ok(dbUser);
      assert.notEqual(dbUser.passwordHash, "SecurePassword123!", "Plaintext password must not be stored");
      assert.ok(await bcrypt.compare("SecurePassword123!", dbUser.passwordHash), "Password hash must match");
      testSeekerUser = dbUser;
    });

    it("should successfully register a recruiter without exposing token", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: defaultHeaders,
        body: JSON.stringify({
          name: "Bob Recruiter",
          email: "bob@test-hirehub.example",
          password: "RecruiterPass2026!",
          role: "recruiter"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 201);
      assert.equal(data.data.user.role, "recruiter");
      assert.equal(data.data.token, undefined, "Token must not be returned in JSON");
      testRecruiterUser = await User.findOne({ email: "bob@test-hirehub.example" });
    });

    it("should reject duplicate email addresses with 409 Conflict", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: defaultHeaders,
        body: JSON.stringify({
          name: "Alice Duplicate",
          email: "ALICE@test-hirehub.example",
          password: "SecurePassword123!",
          role: "job_seeker"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 409);
      assert.equal(data.success, false);
      assert.ok(data.message.includes("already exists"));
    });

    it("should reject public admin registration with 403 Forbidden", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: defaultHeaders,
        body: JSON.stringify({
          name: "Eve Admin",
          email: "eve@test-hirehub.example",
          password: "SuperSecretPassword123!",
          role: "admin"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 403);
      assert.equal(data.success, false);
      assert.ok(data.message.includes("administrator is not permitted"));
    });

    it("should reject missing required fields with 400 Bad Request", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: defaultHeaders,
        body: JSON.stringify({
          email: "missing_fields@test-hirehub.example"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.success, false);
    });

    it("should reject passwords shorter than 8 characters", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: defaultHeaders,
        body: JSON.stringify({
          name: "Short Pass",
          email: "short@test-hirehub.example",
          password: "short",
          role: "job_seeker"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 400);
      assert.ok(data.message.includes("8 characters"));
    });

    it("should reject invalid email format", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: defaultHeaders,
        body: JSON.stringify({
          name: "Invalid Email",
          email: "notanemail",
          password: "ValidPassword123!",
          role: "job_seeker"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 400);
      assert.ok(data.message.includes("valid email address"));
    });
  });

  describe("POST /api/auth/login", () => {
    it("should successfully log in, set HttpOnly cookie, and NOT return raw JWT in JSON", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: defaultHeaders,
        body: JSON.stringify({
          email: "alice@test-hirehub.example",
          password: "SecurePassword123!"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.message, "Login successful");
      assert.equal(data.data.token, undefined, "JWT token must not be returned in JSON response");
      assert.equal(data.data.user.email, "alice@test-hirehub.example");
      assert.equal(data.data.user.passwordHash, undefined, "passwordHash must never be exposed");

      // Verify Set-Cookie header
      const setCookie = res.headers.get("set-cookie");
      assert.ok(setCookie);
      assert.ok(setCookie.includes("hirehub_token"));
      assert.ok(setCookie.toLowerCase().includes("httponly"));
    });

    it("should reject incorrect password with 401 and generic message", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: defaultHeaders,
        body: JSON.stringify({
          email: "alice@test-hirehub.example",
          password: "WrongPassword999!"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.equal(data.message, "Invalid email or password.");
    });

    it("should reject non-existent user with 401 and generic message", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: defaultHeaders,
        body: JSON.stringify({
          email: "nonexistent@test-hirehub.example",
          password: "SomePassword123!"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.equal(data.message, "Invalid email or password.");
    });

    it("should reject missing email or password", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: defaultHeaders,
        body: JSON.stringify({ email: "alice@test-hirehub.example" })
      });

      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.success, false);
    });

    it("should reject deactivated/inactive user account", async () => {
      testInactiveUser = await User.create({
        name: "Inactive User",
        email: "inactive@test-hirehub.example",
        passwordHash: await bcrypt.hash("Password123!", 10),
        role: "job_seeker",
        isActive: false
      });

      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: defaultHeaders,
        body: JSON.stringify({
          email: "inactive@test-hirehub.example",
          password: "Password123!"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.success, false);
    });
  });

  describe("Cookie-Only Authentication & Session Restoration (GET /api/auth/me)", () => {
    it("should authenticate and restore session when valid hirehub_token cookie is provided", async () => {
      const token = generateToken({ id: testSeekerUser._id, role: testSeekerUser.role });

      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Cookie: `hirehub_token=${token}`
        }
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.user.email, "alice@test-hirehub.example");
      assert.equal(data.data.user.role, "job_seeker");
      assert.equal(data.data.user.passwordHash, undefined);
    });

    it("should fail authentication without a valid cookie", async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`);
      const data = await res.json();

      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.ok(data.message.includes("Authentication required"));
    });

    it("should fail authentication when invalid or forged cookie is provided", async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Cookie: "hirehub_token=forged_invalid_jwt_cookie"
        }
      });
      const data = await res.json();

      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.ok(data.message.includes("Invalid authentication token"));
    });

    it("should fail authentication with expired cookie", async () => {
      const secret = getJwtSecret();
      const expiredToken = jwt.sign(
        { id: testSeekerUser._id, role: testSeekerUser.role },
        secret,
        { expiresIn: "0s" }
      );

      await new Promise((r) => setTimeout(r, 15));

      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Cookie: `hirehub_token=${expiredToken}`
        }
      });
      const data = await res.json();

      assert.equal(res.status, 401);
      assert.ok(data.message.includes("expired"));
    });

    it("should reject request if user account is deactivated", async () => {
      const token = generateToken({ id: testInactiveUser._id, role: testInactiveUser.role });

      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Cookie: `hirehub_token=${token}`
        }
      });
      const data = await res.json();

      assert.equal(res.status, 403);
      assert.ok(data.message.includes("deactivated"));
    });
  });

  describe("Role-Based Authorization using Cookie Authentication", () => {
    it("should allow job_seeker to access seeker protected route via cookie", async () => {
      const token = generateToken({ id: testSeekerUser._id, role: testSeekerUser.role });

      const res = await fetch(`${baseUrl}/api/test-protected/seeker`, {
        headers: { Cookie: `hirehub_token=${token}` }
      });
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.message, "Seeker zone");
    });

    it("should reject job_seeker attempting to access recruiter route with 403", async () => {
      const token = generateToken({ id: testSeekerUser._id, role: testSeekerUser.role });

      const res = await fetch(`${baseUrl}/api/test-protected/recruiter`, {
        headers: { Cookie: `hirehub_token=${token}` }
      });
      const data = await res.json();

      assert.equal(res.status, 403);
      assert.equal(data.success, false);
      assert.ok(data.message.includes("permission"));
    });

    it("should reject job_seeker attempting to access admin route with 403", async () => {
      const token = generateToken({ id: testSeekerUser._id, role: testSeekerUser.role });

      const res = await fetch(`${baseUrl}/api/test-protected/admin`, {
        headers: { Cookie: `hirehub_token=${token}` }
      });
      const data = await res.json();

      assert.equal(res.status, 403);
      assert.equal(data.success, false);
    });

    it("should allow recruiter to access recruiter route via cookie", async () => {
      const token = generateToken({ id: testRecruiterUser._id, role: testRecruiterUser.role });

      const res = await fetch(`${baseUrl}/api/test-protected/recruiter`, {
        headers: { Cookie: `hirehub_token=${token}` }
      });
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.message, "Recruiter zone");
    });

    it("should reject recruiter attempting to access admin route with 403", async () => {
      const token = generateToken({ id: testRecruiterUser._id, role: testRecruiterUser.role });

      const res = await fetch(`${baseUrl}/api/test-protected/admin`, {
        headers: { Cookie: `hirehub_token=${token}` }
      });
      const data = await res.json();

      assert.equal(res.status, 403);
      assert.equal(data.success, false);
    });
  });

  describe("CSRF Protection", () => {
    it("should provide XSRF-TOKEN cookie on GET requests", async () => {
      const res = await fetch(`${baseUrl}/api/auth/csrf-token`);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.ok(data.csrfToken);

      const setCookie = res.headers.get("set-cookie");
      assert.ok(setCookie && setCookie.includes("XSRF-TOKEN"));
    });

    it("should block state-changing POST requests when CSRF token is missing", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": "http://localhost:4200"
          // Missing X-XSRF-TOKEN and Cookie: XSRF-TOKEN
        },
        body: JSON.stringify({
          email: "alice@test-hirehub.example",
          password: "SecurePassword123!"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 403);
      assert.equal(data.success, false);
      assert.ok(data.message.includes("CSRF verification failed"));
    });

    it("should block state-changing POST requests when CSRF token mismatches cookie", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": "http://localhost:4200",
          "X-XSRF-TOKEN": "token_from_attacker_evil_12345678901234567890",
          "Cookie": "XSRF-TOKEN=legitimate_token_abc_12345678901234567890"
        },
        body: JSON.stringify({
          email: "alice@test-hirehub.example",
          password: "SecurePassword123!"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 403);
      assert.equal(data.success, false);
      assert.ok(data.message.includes("CSRF verification failed"));
    });

    it("should allow state-changing POST requests when CSRF token matches cookie", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: defaultHeaders,
        body: JSON.stringify({
          email: "alice@test-hirehub.example",
          password: "SecurePassword123!"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
    });
  });

  describe("CORS Restrictions", () => {
    it("should reject state-changing requests from unauthorized origins", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": "http://malicious-website.com",
          "X-XSRF-TOKEN": validCsrf,
          "Cookie": `XSRF-TOKEN=${validCsrf}`
        },
        body: JSON.stringify({
          email: "alice@test-hirehub.example",
          password: "SecurePassword123!"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 403);
      assert.equal(data.success, false);
      assert.ok(data.message.includes("blocked") || data.message.includes("CORS"));
    });
  });

  describe("POST /api/auth/logout", () => {
    it("should clear the auth cookie and return success", async () => {
      const res = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: defaultHeaders
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.message, "Logged out successfully");

      const setCookie = res.headers.get("set-cookie");
      assert.ok(setCookie, "Logout must send Set-Cookie header to clear cookie");
      assert.ok(
        setCookie.includes("hirehub_token=;") ||
        setCookie.includes("Max-Age=0") ||
        setCookie.includes("Expires="),
        "Cookie must be cleared with 0 max-age or expiration"
      );
    });
  });

  describe("Admin Account Provisioning CLI Script", () => {
    const adminEmail = "sysadmin@test-hirehub.example";
    const adminPassword = "SuperAdminPassword2026!";

    it("should provision the first administrator using the secure CLI script", () => {
      const scriptPath = path.join(__dirname, "../src/scripts/provisionAdmin.js");
      const cmd = `node "${scriptPath}" --name "Super Admin" --email "${adminEmail}" --password "${adminPassword}"`;

      const output = execSync(cmd, { env: process.env }).toString();
      assert.ok(output.includes("Administrator account provisioned successfully"));
    });

    it("should verify the provisioned admin exists in database with hashed password", async () => {
      const admin = await User.findOne({ email: adminEmail });
      assert.ok(admin);
      assert.equal(admin.role, "admin");
      assert.notEqual(admin.passwordHash, adminPassword);
      assert.ok(await bcrypt.compare(adminPassword, admin.passwordHash));
    });

    it("should safely handle duplicate admin provisioning attempts without corrupting state", () => {
      const scriptPath = path.join(__dirname, "../src/scripts/provisionAdmin.js");
      const cmd = `node "${scriptPath}" --name "Super Admin" --email "${adminEmail}" --password "${adminPassword}"`;

      const output = execSync(cmd, { env: process.env }).toString();
      assert.ok(output.includes("already exists"));
    });
  });
});
