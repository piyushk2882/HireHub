const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { app } = require("../src/server");
const { User, Company, Job } = require("../src/models");
const { connectDB, disconnectDB } = require("../src/config/database");
const { generateToken } = require("../src/utils/jwt");

describe("Company Management APIs Tests", () => {
  let server;
  let baseUrl;

  let recruiter1, recruiter2, jobSeeker, adminUser;
  let recruiter1Cookie, recruiter2Cookie, seekerCookie, adminCookie;
  let company1, company2;

  const validCsrf = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
  const getHeaders = (cookie) => ({
    "Content-Type": "application/json",
    "Origin": "http://localhost:4200",
    "X-XSRF-TOKEN": validCsrf,
    "Cookie": `XSRF-TOKEN=${validCsrf}; ${cookie || ""}`
  });

  before(async () => {
    await connectDB();

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });

    // Clean up test collections
    await User.deleteMany({ email: /.*@test-company\.example/i });
    await Company.deleteMany({ companyName: /.*CoSuiteCo.*/i });
    await Job.deleteMany({ title: /.*CoSuiteJob.*/i });

    // Seed test users
    const passwordHash = await bcrypt.hash("Password123!", 10);

    recruiter1 = await User.create({
      name: "Recruiter One",
      email: "recruiter1@test-company.example",
      passwordHash,
      role: "recruiter",
      isActive: true
    });
    recruiter1Cookie = `hirehub_token=${generateToken({ id: recruiter1._id, role: recruiter1.role })}`;

    recruiter2 = await User.create({
      name: "Recruiter Two",
      email: "recruiter2@test-company.example",
      passwordHash,
      role: "recruiter",
      isActive: true
    });
    recruiter2Cookie = `hirehub_token=${generateToken({ id: recruiter2._id, role: recruiter2.role })}`;

    jobSeeker = await User.create({
      name: "Seeker User",
      email: "seeker@test-company.example",
      passwordHash,
      role: "job_seeker",
      isActive: true
    });
    seekerCookie = `hirehub_token=${generateToken({ id: jobSeeker._id, role: jobSeeker.role })}`;

    adminUser = await User.create({
      name: "Admin User",
      email: "admin@test-company.example",
      passwordHash,
      role: "admin",
      isActive: true
    });
    adminCookie = `hirehub_token=${generateToken({ id: adminUser._id, role: adminUser.role })}`;
  });

  after(async () => {
    await User.deleteMany({ email: /.*@test-company\.example/i });
    await Company.deleteMany({ companyName: /.*CoSuiteCo.*/i });
    await Job.deleteMany({ title: /.*CoSuiteJob.*/i });
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  });

  describe("POST /api/companies (Create Company)", () => {
    it("should allow a recruiter to create a company profile", async () => {
      const res = await fetch(`${baseUrl}/api/companies`, {
        method: "POST",
        headers: getHeaders(recruiter1Cookie),
        body: JSON.stringify({
          companyName: "Acme CoSuiteCo",
          description: "Leading tech company in SaaS",
          website: "https://acme.test",
          industry: "Technology",
          location: "Bangalore, India",
          logo: "https://acme.test/logo.png"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 201);
      assert.equal(data.success, true);
      assert.equal(data.data.company.companyName, "Acme CoSuiteCo");
      assert.equal(data.data.company.recruiterId, recruiter1._id.toString());
      company1 = data.data.company;
    });

    it("should reject company creation when companyName is missing", async () => {
      const res = await fetch(`${baseUrl}/api/companies`, {
        method: "POST",
        headers: getHeaders(recruiter2Cookie),
        body: JSON.stringify({
          description: "Missing name"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.ok(data.message.includes("Company name is required"));
    });

    it("should reject unauthenticated company creation with 401", async () => {
      const res = await fetch(`${baseUrl}/api/companies`, {
        method: "POST",
        headers: getHeaders(null),
        body: JSON.stringify({
          companyName: "Anon CoSuiteCo"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.success, false);
    });

    it("should reject company creation by job seekers with 403 Forbidden", async () => {
      const res = await fetch(`${baseUrl}/api/companies`, {
        method: "POST",
        headers: getHeaders(seekerCookie),
        body: JSON.stringify({
          companyName: "Seeker FakeCo"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 403);
      assert.equal(data.success, false);
    });

    it("should prevent a recruiter from creating multiple company profiles with 409 Conflict", async () => {
      const res = await fetch(`${baseUrl}/api/companies`, {
        method: "POST",
        headers: getHeaders(recruiter1Cookie),
        body: JSON.stringify({
          companyName: "Second CoSuiteCo",
          industry: "Finance"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 409);
      assert.equal(data.success, false);
      assert.ok(data.message.includes("already created a company profile"));
    });

    it("should allow a second recruiter to create their own company profile", async () => {
      const res = await fetch(`${baseUrl}/api/companies`, {
        method: "POST",
        headers: getHeaders(recruiter2Cookie),
        body: JSON.stringify({
          companyName: "Beta CoSuiteCo",
          industry: "Healthcare",
          location: "Mumbai, India"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 201);
      assert.equal(data.data.company.companyName, "Beta CoSuiteCo");
      company2 = data.data.company;
    });
  });

  describe("GET /api/companies (Public Directory)", () => {
    it("should return a paginated list of companies without authentication", async () => {
      const res = await fetch(`${baseUrl}/api/companies`);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.ok(Array.isArray(data.data.companies));
      assert.ok(data.data.companies.length >= 2);
      assert.ok(data.data.pagination);
      assert.equal(data.data.pagination.page, 1);
      assert.ok(data.data.pagination.total >= 2);
    });

    it("should support search by companyName", async () => {
      const res = await fetch(`${baseUrl}/api/companies?search=Acme`);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.data.companies.length, 1);
      assert.equal(data.data.companies[0].companyName, "Acme CoSuiteCo");
    });

    it("should support filtering by industry", async () => {
      const res = await fetch(`${baseUrl}/api/companies?industry=Healthcare`);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.data.companies.length, 1);
      assert.equal(data.data.companies[0].companyName, "Beta CoSuiteCo");
    });

    it("should support filtering by location", async () => {
      const res = await fetch(`${baseUrl}/api/companies?location=Bangalore`);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.data.companies[0].companyName, "Acme CoSuiteCo");
    });
  });

  describe("GET /api/companies/:id", () => {
    it("should retrieve company details by ID", async () => {
      const res = await fetch(`${baseUrl}/api/companies/${company1._id}`);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.company.companyName, "Acme CoSuiteCo");
    });

    it("should reject invalid ObjectId format with 400", async () => {
      const res = await fetch(`${baseUrl}/api/companies/invalid_id_123`);
      const data = await res.json();

      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.ok(data.message.includes("Invalid company ID format"));
    });

    it("should return 404 for non-existent company ID", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await fetch(`${baseUrl}/api/companies/${fakeId}`);
      const data = await res.json();

      assert.equal(res.status, 404);
      assert.equal(data.success, false);
      assert.ok(data.message.includes("not found"));
    });
  });

  describe("PUT /api/companies/:id (Update Company)", () => {
    it("should allow a recruiter to update their own company profile", async () => {
      const res = await fetch(`${baseUrl}/api/companies/${company1._id}`, {
        method: "PUT",
        headers: getHeaders(recruiter1Cookie),
        body: JSON.stringify({
          description: "Updated Acme description",
          website: "https://acme-updated.test"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.company.description, "Updated Acme description");
      assert.equal(data.data.company.website, "https://acme-updated.test");
    });

    it("should prevent a recruiter from updating another recruiter's company with 403", async () => {
      const res = await fetch(`${baseUrl}/api/companies/${company1._id}`, {
        method: "PUT",
        headers: getHeaders(recruiter2Cookie),
        body: JSON.stringify({
          companyName: "Hijacked TestCo"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 403);
      assert.equal(data.success, false);
      assert.ok(data.message.includes("Access denied"));
    });

    it("should prevent recruiter from changing recruiterId in body", async () => {
      const res = await fetch(`${baseUrl}/api/companies/${company1._id}`, {
        method: "PUT",
        headers: getHeaders(recruiter1Cookie),
        body: JSON.stringify({
          recruiterId: recruiter2._id.toString()
        })
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.data.company.recruiterId, recruiter1._id.toString(), "recruiterId must NOT change");
    });

    it("should allow admin to update any company profile", async () => {
      const res = await fetch(`${baseUrl}/api/companies/${company1._id}`, {
        method: "PUT",
        headers: getHeaders(adminCookie),
        body: JSON.stringify({
          description: "Admin verified description"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.data.company.description, "Admin verified description");
    });
  });

  describe("DELETE /api/companies/:id (Delete Company)", () => {
    it("should prevent non-admin from deleting a company with 403", async () => {
      const res = await fetch(`${baseUrl}/api/companies/${company1._id}`, {
        method: "DELETE",
        headers: getHeaders(recruiter1Cookie)
      });

      const data = await res.json();
      assert.equal(res.status, 403);
      assert.equal(data.success, false);
    });

    it("should prevent company deletion when associated jobs exist with 409 Conflict", async () => {
      // Create a job associated with company2
      await Job.create({
        title: "TestJob Senior Engineer",
        description: "Develop services",
        companyId: company2._id,
        recruiterId: recruiter2._id,
        location: "Mumbai",
        category: "Development",
        status: "Active"
      });

      const res = await fetch(`${baseUrl}/api/companies/${company2._id}`, {
        method: "DELETE",
        headers: getHeaders(adminCookie)
      });

      const data = await res.json();
      assert.equal(res.status, 409);
      assert.equal(data.success, false);
      assert.ok(data.message.includes("associated job posting"));
    });

    it("should allow admin to delete a company when no jobs are associated", async () => {
      // Delete the company1 which has no jobs
      const res = await fetch(`${baseUrl}/api/companies/${company1._id}`, {
        method: "DELETE",
        headers: getHeaders(adminCookie)
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.ok(data.message.includes("deleted successfully"));

      const check = await Company.findById(company1._id);
      assert.equal(check, null);
    });
  });
});
