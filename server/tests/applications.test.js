const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { app } = require("../src/server");
const { User, Company, Job, Application } = require("../src/models");
const { connectDB, disconnectDB } = require("../src/config/database");
const { generateToken } = require("../src/utils/jwt");
const { storageService } = require("../src/services/storage.service");

describe("Candidate Application Management APIs Tests (Phase 5A)", () => {
  let server;
  let baseUrl;

  let recruiter1, recruiter2, seeker1, seeker2, adminUser;
  let recruiter1Cookie, recruiter2Cookie, seeker1Cookie, seeker2Cookie, adminCookie;
  let company1;
  let activeJob, draftJob, closedJob;

  const validCsrf = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

  const getJsonHeaders = (cookie) => ({
    "Content-Type": "application/json",
    "Origin": "http://localhost:4200",
    "X-XSRF-TOKEN": validCsrf,
    "Cookie": `XSRF-TOKEN=${validCsrf}; ${cookie || ""}`
  });

  const getMultipartHeaders = (cookie) => ({
    "Origin": "http://localhost:4200",
    "X-XSRF-TOKEN": validCsrf,
    "Cookie": `XSRF-TOKEN=${validCsrf}; ${cookie || ""}`
  });

  // Sample valid PDF buffer (%PDF-1.4 magic bytes)
  const createValidPdfBuffer = (sizeInBytes = 1024) => {
    const header = Buffer.from("%PDF-1.4\n%âãÏÓ\n");
    const body = Buffer.alloc(Math.max(0, sizeInBytes - header.length), "A");
    return Buffer.concat([header, body]);
  };

  // Sample valid DOCX buffer (PK\x03\x04 magic bytes)
  const createValidDocxBuffer = () => {
    const header = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const body = Buffer.alloc(500, 0x20);
    return Buffer.concat([header, body]);
  };

  before(async () => {
    await connectDB();

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });

    // Cleanup existing test records
    const oldAppJobs = await Job.find({ title: /.*AppTestJob.*/i }).select("_id");
    await Application.deleteMany({ jobId: { $in: oldAppJobs.map(j => j._id) } });
    await User.deleteMany({ email: /.*@test-apps\.example/i });
    await Company.deleteMany({ companyName: /.*AppTestCo.*/i });
    await Job.deleteMany({ title: /.*AppTestJob.*/i });

    // Seed test users
    const passwordHash = await bcrypt.hash("Password123!", 10);

    recruiter1 = await User.create({
      name: "Rachel Recruiter",
      email: "recruiter1@test-apps.example",
      passwordHash,
      role: "recruiter",
      isActive: true
    });
    recruiter1Cookie = `hirehub_token=${generateToken({ id: recruiter1._id, role: recruiter1.role })}`;

    recruiter2 = await User.create({
      name: "Roger Recruiter",
      email: "recruiter2@test-apps.example",
      passwordHash,
      role: "recruiter",
      isActive: true
    });
    recruiter2Cookie = `hirehub_token=${generateToken({ id: recruiter2._id, role: recruiter2.role })}`;

    seeker1 = await User.create({
      name: "Sam Seeker",
      email: "seeker1@test-apps.example",
      passwordHash,
      role: "job_seeker",
      isActive: true
    });
    seeker1Cookie = `hirehub_token=${generateToken({ id: seeker1._id, role: seeker1.role })}`;

    seeker2 = await User.create({
      name: "Sara Seeker",
      email: "seeker2@test-apps.example",
      passwordHash,
      role: "job_seeker",
      isActive: true
    });
    seeker2Cookie = `hirehub_token=${generateToken({ id: seeker2._id, role: seeker2.role })}`;

    adminUser = await User.create({
      name: "Adam Admin",
      email: "admin@test-apps.example",
      passwordHash,
      role: "admin",
      isActive: true
    });
    adminCookie = `hirehub_token=${generateToken({ id: adminUser._id, role: adminUser.role })}`;

    // Seed test company
    company1 = await Company.create({
      companyName: "AppTestCo Technologies",
      recruiterId: recruiter1._id,
      industry: "Technology",
      location: "San Francisco, CA"
    });

    // Seed test jobs
    activeJob = await Job.create({
      title: "AppTestJob Senior Node Engineer",
      description: "Build robust distributed backend systems.",
      companyId: company1._id,
      recruiterId: recruiter1._id,
      location: "Remote",
      category: "Development",
      employmentType: "Full Time",
      status: "Active"
    });

    draftJob = await Job.create({
      title: "AppTestJob Draft Designer",
      description: "Internal draft position.",
      companyId: company1._id,
      recruiterId: recruiter1._id,
      location: "Remote",
      category: "Design",
      employmentType: "Full Time",
      status: "Draft"
    });

    closedJob = await Job.create({
      title: "AppTestJob Closed Marketing Lead",
      description: "Closed role.",
      companyId: company1._id,
      recruiterId: recruiter1._id,
      location: "Remote",
      category: "Marketing",
      employmentType: "Full Time",
      status: "Closed"
    });
  });

  after(async () => {
    // Clean up created records
    const oldAppJobs = await Job.find({ title: /.*AppTestJob.*/i }).select("_id");
    await Application.deleteMany({ jobId: { $in: oldAppJobs.map(j => j._id) } });
    await User.deleteMany({ email: /.*@test-apps\.example/i });
    await Company.deleteMany({ companyName: /.*AppTestCo.*/i });
    await Job.deleteMany({ title: /.*AppTestJob.*/i });

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  });

  // =========================================================================
  // 1. APPLICATION SUBMISSION (POST /api/jobs/:jobId/applications)
  // =========================================================================
  describe("POST /api/jobs/:jobId/applications", () => {
    it("should allow a job seeker to submit an application with valid PDF resume and cover letter", async () => {
      const formData = new FormData();
      formData.append("coverLetter", "I have 6 years of backend experience and would love to join your team.");
      const pdfBuffer = createValidPdfBuffer(2048);
      const blob = new Blob([pdfBuffer], { type: "application/pdf" });
      formData.append("resume", blob, "sam_seeker_resume.pdf");

      const res = await fetch(`${baseUrl}/api/jobs/${activeJob._id}/applications`, {
        method: "POST",
        headers: getMultipartHeaders(seeker1Cookie),
        body: formData
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(body.data?.application);
      assert.equal(body.data.application.jobId, activeJob._id.toString());
      assert.equal(body.data.application.applicantId, seeker1._id.toString());
      assert.equal(body.data.application.status, "Pending");
      assert.equal(body.data.application.resumeOriginalName, "sam_seeker_resume.pdf");
      assert.ok(body.data.application.resumeUrl.includes(`/api/applications/${body.data.application._id}/resume`));
      assert.equal(body.data.application.statusHistory.length, 1);
      assert.equal(body.data.application.statusHistory[0].status, "Pending");
      // Internal storage key must never be exposed
      assert.equal(body.data.application.resumeStorageKey, undefined);
    });

    it("should allow a job seeker to submit an application with DOCX file", async () => {
      const formData = new FormData();
      formData.append("coverLetter", "Sara's application with docx.");
      const docxBuffer = createValidDocxBuffer();
      const blob = new Blob([docxBuffer], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      });
      formData.append("resume", blob, "sara_resume.docx");

      const res = await fetch(`${baseUrl}/api/jobs/${activeJob._id}/applications`, {
        method: "POST",
        headers: getMultipartHeaders(seeker2Cookie),
        body: formData
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.application.resumeOriginalName, "sara_resume.docx");
    });

    it("should reject duplicate application by the same candidate for the same job with 409 Conflict", async () => {
      const formData = new FormData();
      const pdfBuffer = createValidPdfBuffer();
      formData.append("resume", new Blob([pdfBuffer], { type: "application/pdf" }), "repeat_resume.pdf");

      const res = await fetch(`${baseUrl}/api/jobs/${activeJob._id}/applications`, {
        method: "POST",
        headers: getMultipartHeaders(seeker1Cookie),
        body: formData
      });

      assert.equal(res.status, 409);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.match(body.message, /already submitted an application/i);
    });

    it("should reject application without resume file with 400 Bad Request", async () => {
      const formData = new FormData();
      formData.append("coverLetter", "Forgot my resume!");

      const res = await fetch(`${baseUrl}/api/jobs/${activeJob._id}/applications`, {
        method: "POST",
        headers: getMultipartHeaders(seeker2Cookie), // seeker2 hasn't applied to activeJob with PDF yet? Wait, seeker2 applied with DOCX above! Let's create seeker3 or another active job!
      });

      // Seeker1 and Seeker2 already applied to activeJob, so let's test missing resume against a new active job
      const anotherJob = await Job.create({
        title: "AppTestJob DevOps Lead",
        description: "Cloud infrastructure.",
        companyId: company1._id,
        recruiterId: recruiter1._id,
        location: "Remote",
        category: "Development",
        employmentType: "Full Time",
        status: "Active"
      });

      const res2 = await fetch(`${baseUrl}/api/jobs/${anotherJob._id}/applications`, {
        method: "POST",
        headers: getMultipartHeaders(seeker1Cookie),
        body: formData
      });

      assert.equal(res2.status, 400);
      const body = await res2.json();
      assert.equal(body.success, false);
      assert.match(body.message, /resume file is required/i);
    });

    it("should reject unsupported file extension with 400 Bad Request", async () => {
      const formData = new FormData();
      const textBuffer = Buffer.from("Plain text content");
      formData.append("resume", new Blob([textBuffer], { type: "text/plain" }), "resume.txt");

      const res = await fetch(`${baseUrl}/api/jobs/${activeJob._id}/applications`, {
        method: "POST",
        headers: getMultipartHeaders(seeker1Cookie),
        body: formData
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.match(body.message, /unsupported file/i);
    });

    it("should reject corrupted or forged file signature with 400 Bad Request", async () => {
      const formData = new FormData();
      // Named as .pdf, but contains plain text without %PDF- magic bytes
      const fakePdfBuffer = Buffer.from("This is not a real PDF document at all!");
      formData.append("resume", new Blob([fakePdfBuffer], { type: "application/pdf" }), "fake_resume.pdf");

      const res = await fetch(`${baseUrl}/api/jobs/${activeJob._id}/applications`, {
        method: "POST",
        headers: getMultipartHeaders(seeker1Cookie),
        body: formData
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.match(body.message, /signature mismatch/i);
    });

    it("should reject oversized resume (> 5 MB) with 400 Bad Request", async () => {
      const formData = new FormData();
      // 5.5 MB PDF
      const oversizedBuffer = createValidPdfBuffer(5.5 * 1024 * 1024);
      formData.append("resume", new Blob([oversizedBuffer], { type: "application/pdf" }), "huge_resume.pdf");

      const res = await fetch(`${baseUrl}/api/jobs/${activeJob._id}/applications`, {
        method: "POST",
        headers: getMultipartHeaders(seeker1Cookie),
        body: formData
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.match(body.message, /exceeds the maximum allowed limit/i);
    });

    it("should reject application to non-existent job with 404 Not Found", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const formData = new FormData();
      const pdfBuffer = createValidPdfBuffer();
      formData.append("resume", new Blob([pdfBuffer], { type: "application/pdf" }), "resume.pdf");

      const res = await fetch(`${baseUrl}/api/jobs/${nonExistentId}/applications`, {
        method: "POST",
        headers: getMultipartHeaders(seeker1Cookie),
        body: formData
      });

      assert.equal(res.status, 404);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.match(body.message, /job posting not found/i);
    });

    it("should reject application to Draft job with 400 Bad Request", async () => {
      const formData = new FormData();
      const pdfBuffer = createValidPdfBuffer();
      formData.append("resume", new Blob([pdfBuffer], { type: "application/pdf" }), "resume.pdf");

      const res = await fetch(`${baseUrl}/api/jobs/${draftJob._id}/applications`, {
        method: "POST",
        headers: getMultipartHeaders(seeker1Cookie),
        body: formData
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.match(body.message, /cannot apply to an inactive/i);
    });

    it("should reject application to Closed job with 400 Bad Request", async () => {
      const formData = new FormData();
      const pdfBuffer = createValidPdfBuffer();
      formData.append("resume", new Blob([pdfBuffer], { type: "application/pdf" }), "resume.pdf");

      const res = await fetch(`${baseUrl}/api/jobs/${closedJob._id}/applications`, {
        method: "POST",
        headers: getMultipartHeaders(seeker1Cookie),
        body: formData
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.match(body.message, /cannot apply to an inactive/i);
    });

    it("should reject application to Archived job with 400 Bad Request", async () => {
      const archivedJob = await Job.create({
        title: "AppTestJob Archived Position",
        description: "Archived role.",
        companyId: company1._id,
        recruiterId: recruiter1._id,
        location: "Remote",
        category: "Other",
        employmentType: "Full Time",
        status: "Archived"
      });

      const formData = new FormData();
      const pdfBuffer = createValidPdfBuffer();
      formData.append("resume", new Blob([pdfBuffer], { type: "application/pdf" }), "resume.pdf");

      const res = await fetch(`${baseUrl}/api/jobs/${archivedJob._id}/applications`, {
        method: "POST",
        headers: getMultipartHeaders(seeker1Cookie),
        body: formData
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.match(body.message, /cannot apply to an inactive/i);
    });

    it("should prevent a candidate from applying to a job where they are the recruiter with 400 Bad Request", async () => {
      const ownSeekerJob = await Job.create({
        title: "AppTestJob Self Recruiter Role",
        description: "Created with candidate as recruiterId edge case.",
        companyId: company1._id,
        recruiterId: seeker1._id,
        location: "Remote",
        category: "Development",
        employmentType: "Full Time",
        status: "Active"
      });

      const formData = new FormData();
      const pdfBuffer = createValidPdfBuffer();
      formData.append("resume", new Blob([pdfBuffer], { type: "application/pdf" }), "resume.pdf");

      const res = await fetch(`${baseUrl}/api/jobs/${ownSeekerJob._id}/applications`, {
        method: "POST",
        headers: getMultipartHeaders(seeker1Cookie),
        body: formData
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.match(body.message, /cannot apply to your own job/i);
    });

    it("should reject recruiter attempting to apply to a job with 403 Forbidden", async () => {
      const formData = new FormData();
      const pdfBuffer = createValidPdfBuffer();
      formData.append("resume", new Blob([pdfBuffer], { type: "application/pdf" }), "resume.pdf");

      const res = await fetch(`${baseUrl}/api/jobs/${activeJob._id}/applications`, {
        method: "POST",
        headers: getMultipartHeaders(recruiter1Cookie),
        body: formData
      });

      assert.equal(res.status, 403);
      const body = await res.json();
      assert.equal(body.success, false);
    });

    it("should reject unauthenticated application submission with 401 Unauthorized", async () => {
      const formData = new FormData();
      const pdfBuffer = createValidPdfBuffer();
      formData.append("resume", new Blob([pdfBuffer], { type: "application/pdf" }), "resume.pdf");

      const res = await fetch(`${baseUrl}/api/jobs/${activeJob._id}/applications`, {
        method: "POST",
        headers: getMultipartHeaders(null),
        body: formData
      });

      assert.equal(res.status, 401);
    });

    it("should block application submission when CSRF token is missing with 403 Forbidden", async () => {
      const formData = new FormData();
      const pdfBuffer = createValidPdfBuffer();
      formData.append("resume", new Blob([pdfBuffer], { type: "application/pdf" }), "resume.pdf");

      const res = await fetch(`${baseUrl}/api/jobs/${activeJob._id}/applications`, {
        method: "POST",
        headers: {
          "Origin": "http://localhost:4200",
          "Cookie": `hirehub_token=${generateToken({ id: seeker1._id, role: seeker1.role })}`
          // Missing X-XSRF-TOKEN header and cookie
        },
        body: formData
      });

      assert.equal(res.status, 403);
    });
  });

  // =========================================================================
  // 2. CANDIDATE APPLICATION HISTORY (GET /api/applications/my-applications)
  // =========================================================================
  describe("GET /api/applications/my-applications", () => {
    it("should retrieve applications belonging only to the authenticated candidate", async () => {
      const res = await fetch(`${baseUrl}/api/applications/my-applications`, {
        method: "GET",
        headers: getJsonHeaders(seeker1Cookie)
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data.applications));
      assert.equal(body.data.applications.length, 1);
      assert.equal(body.data.applications[0].applicantId, seeker1._id.toString());
      assert.ok(body.data.applications[0].jobId);
      assert.equal(body.data.applications[0].jobId.title, activeJob.title);
      assert.ok(body.data.pagination);
      assert.equal(body.data.pagination.total, 1);
    });

    it("should support status filtering on candidate applications", async () => {
      const res = await fetch(`${baseUrl}/api/applications/my-applications?status=Pending`, {
        method: "GET",
        headers: getJsonHeaders(seeker1Cookie)
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.applications.length, 1);
      assert.equal(body.data.applications[0].status, "Pending");

      const resReviewed = await fetch(`${baseUrl}/api/applications/my-applications?status=Reviewed`, {
        method: "GET",
        headers: getJsonHeaders(seeker1Cookie)
      });
      const bodyReviewed = await resReviewed.json();
      assert.equal(bodyReviewed.data.applications.length, 0);
    });

    it("should return empty list when candidate has no matching applications", async () => {
      const freshSeeker = await User.create({
        name: "Fresh Seeker",
        email: "fresh@test-apps.example",
        passwordHash: await bcrypt.hash("Password123!", 10),
        role: "job_seeker",
        isActive: true
      });
      const freshCookie = `hirehub_token=${generateToken({ id: freshSeeker._id, role: freshSeeker.role })}`;

      const res = await fetch(`${baseUrl}/api/applications/my-applications`, {
        method: "GET",
        headers: getJsonHeaders(freshCookie)
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.applications.length, 0);
      assert.equal(body.data.pagination.total, 0);
    });

    it("should reject recruiter attempting to access candidate history with 403 Forbidden", async () => {
      const res = await fetch(`${baseUrl}/api/applications/my-applications`, {
        method: "GET",
        headers: getJsonHeaders(recruiter1Cookie)
      });

      assert.equal(res.status, 403);
    });
  });

  // =========================================================================
  // 3. RECRUITER APPLICANT MANAGEMENT (GET /api/jobs/:jobId/applications)
  // =========================================================================
  describe("GET /api/jobs/:jobId/applications", () => {
    it("should allow owning recruiter to view applicants for their job with safe candidate info", async () => {
      const res = await fetch(`${baseUrl}/api/jobs/${activeJob._id}/applications`, {
        method: "GET",
        headers: getJsonHeaders(recruiter1Cookie)
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(body.data.applications.length >= 2); // seeker1 and seeker2
      const firstApp = body.data.applications[0];
      assert.ok(firstApp.applicantId);
      assert.ok(firstApp.applicantId.name);
      assert.ok(firstApp.applicantId.email);
      // Ensure passwordHash is never returned
      assert.equal(firstApp.applicantId.passwordHash, undefined);
      assert.equal(firstApp.resumeStorageKey, undefined);
    });

    it("should prevent another recruiter from viewing applicants for a job they do not own with 403 Forbidden", async () => {
      const res = await fetch(`${baseUrl}/api/jobs/${activeJob._id}/applications`, {
        method: "GET",
        headers: getJsonHeaders(recruiter2Cookie)
      });

      assert.equal(res.status, 403);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.match(body.message, /access denied/i);
    });

    it("should allow admin to view applicants for any job", async () => {
      const res = await fetch(`${baseUrl}/api/jobs/${activeJob._id}/applications`, {
        method: "GET",
        headers: getJsonHeaders(adminCookie)
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(body.data.applications.length >= 2);
    });

    it("should support status filtering on job applicants", async () => {
      const res = await fetch(`${baseUrl}/api/jobs/${activeJob._id}/applications?status=Pending`, {
        method: "GET",
        headers: getJsonHeaders(recruiter1Cookie)
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.data.applications.every(a => a.status === "Pending"));
    });
  });

  // =========================================================================
  // 4. INDIVIDUAL APPLICATION DETAILS (GET /api/applications/:applicationId)
  // =========================================================================
  describe("GET /api/applications/:applicationId", () => {
    let testApp;

    before(async () => {
      testApp = await Application.findOne({ applicantId: seeker1._id, jobId: activeJob._id });
    });

    it("should allow candidate owner to view their own application details", async () => {
      const res = await fetch(`${baseUrl}/api/applications/${testApp._id}`, {
        method: "GET",
        headers: getJsonHeaders(seeker1Cookie)
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.application._id, testApp._id.toString());
      assert.equal(body.data.application.jobId.title, activeJob.title);
      assert.equal(body.data.application.applicantId.name, seeker1.name);
    });

    it("should allow owning recruiter to view the application details", async () => {
      const res = await fetch(`${baseUrl}/api/applications/${testApp._id}`, {
        method: "GET",
        headers: getJsonHeaders(recruiter1Cookie)
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.application._id, testApp._id.toString());
    });

    it("should allow admin to view any application details", async () => {
      const res = await fetch(`${baseUrl}/api/applications/${testApp._id}`, {
        method: "GET",
        headers: getJsonHeaders(adminCookie)
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
    });

    it("should prevent an unrelated candidate from viewing another candidate's application with 403 Forbidden", async () => {
      const res = await fetch(`${baseUrl}/api/applications/${testApp._id}`, {
        method: "GET",
        headers: getJsonHeaders(seeker2Cookie)
      });

      assert.equal(res.status, 403);
    });

    it("should prevent an unrelated recruiter from viewing applications for another's job with 403 Forbidden", async () => {
      const res = await fetch(`${baseUrl}/api/applications/${testApp._id}`, {
        method: "GET",
        headers: getJsonHeaders(recruiter2Cookie)
      });

      assert.equal(res.status, 403);
    });

    it("should return 404 for non-existent application ID", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await fetch(`${baseUrl}/api/applications/${nonExistentId}`, {
        method: "GET",
        headers: getJsonHeaders(seeker1Cookie)
      });

      assert.equal(res.status, 404);
    });
  });

  // =========================================================================
  // 5. SECURE RESUME DOWNLOAD (GET /api/applications/:applicationId/resume)
  // =========================================================================
  describe("GET /api/applications/:applicationId/resume", () => {
    let testApp;

    before(async () => {
      testApp = await Application.findOne({ applicantId: seeker1._id, jobId: activeJob._id });
    });

    it("should allow candidate owner to securely download their resume file", async () => {
      const res = await fetch(`${baseUrl}/api/applications/${testApp._id}/resume`, {
        method: "GET",
        headers: getJsonHeaders(seeker1Cookie)
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "application/pdf");
      assert.match(res.headers.get("content-disposition"), /attachment;\s*filename="sam_seeker_resume.pdf"/i);
      const buffer = Buffer.from(await res.arrayBuffer());
      // Check magic bytes %PDF
      assert.equal(buffer.slice(0, 4).toString(), "%PDF");
    });

    it("should allow owning recruiter to securely download the applicant's resume", async () => {
      const res = await fetch(`${baseUrl}/api/applications/${testApp._id}/resume`, {
        method: "GET",
        headers: getJsonHeaders(recruiter1Cookie)
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "application/pdf");
    });

    it("should allow admin to download the resume", async () => {
      const res = await fetch(`${baseUrl}/api/applications/${testApp._id}/resume`, {
        method: "GET",
        headers: getJsonHeaders(adminCookie)
      });

      assert.equal(res.status, 200);
    });

    it("should prevent unrelated candidate from downloading another's resume with 403 Forbidden", async () => {
      const res = await fetch(`${baseUrl}/api/applications/${testApp._id}/resume`, {
        method: "GET",
        headers: getJsonHeaders(seeker2Cookie)
      });

      assert.equal(res.status, 403);
    });

    it("should prevent unrelated recruiter from downloading resume for another's job with 403 Forbidden", async () => {
      const res = await fetch(`${baseUrl}/api/applications/${testApp._id}/resume`, {
        method: "GET",
        headers: getJsonHeaders(recruiter2Cookie)
      });

      assert.equal(res.status, 403);
    });

    it("should reject unauthenticated resume download with 401 Unauthorized", async () => {
      const res = await fetch(`${baseUrl}/api/applications/${testApp._id}/resume`, {
        method: "GET",
        headers: getJsonHeaders(null)
      });

      assert.equal(res.status, 401);
    });

    it("should return 404 Not Found when resume file is missing from storage", async () => {
      const missingFileApp = await Application.create({
        jobId: activeJob._id,
        applicantId: new mongoose.Types.ObjectId(),
        resumeUrl: "/api/applications/temp/resume",
        resumeStorageKey: "non-existent-storage-key.pdf",
        resumeOriginalName: "missing.pdf",
        status: "Pending"
      });

      const res = await fetch(`${baseUrl}/api/applications/${missingFileApp._id}/resume`, {
        method: "GET",
        headers: getJsonHeaders(recruiter1Cookie)
      });

      assert.equal(res.status, 404);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.match(body.message, /not found or has been removed/i);
    });
  });

  // =========================================================================
  // 6. APPLICATION STATUS MANAGEMENT (PATCH /api/applications/:applicationId/status)
  // =========================================================================
  describe("PATCH /api/applications/:applicationId/status", () => {
    let testApp;

    beforeEach(async () => {
      // Find or re-create application for test consistency
      testApp = await Application.findOne({ applicantId: seeker1._id, jobId: activeJob._id });
      if (!testApp) {
        testApp = await Application.create({
          jobId: activeJob._id,
          applicantId: seeker1._id,
          resumeUrl: `/api/applications/temp/resume`,
          resumeOriginalName: "sam_resume.pdf",
          status: "Pending",
          statusHistory: [
            {
              status: "Pending",
              changedBy: seeker1._id,
              changedAt: new Date(),
              note: "Initial submission"
            }
          ]
        });
      } else {
        testApp.status = "Pending";
        testApp.statusHistory = [
          {
            status: "Pending",
            changedBy: seeker1._id,
            changedAt: new Date(),
            note: "Initial submission"
          }
        ];
        await testApp.save();
      }
    });

    it("should allow owning recruiter to advance status from Pending to Reviewed with audit history", async () => {
      const res = await fetch(`${baseUrl}/api/applications/${testApp._id}/status`, {
        method: "PATCH",
        headers: getJsonHeaders(recruiter1Cookie),
        body: JSON.stringify({
          status: "Reviewed",
          note: "Candidate profile looks promising."
        })
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.application.status, "Reviewed");
      assert.equal(body.data.application.statusHistory.length, 2);
      const latestHistory = body.data.application.statusHistory[1];
      assert.equal(latestHistory.status, "Reviewed");
      assert.equal(latestHistory.changedBy, recruiter1._id.toString());
      assert.equal(latestHistory.note, "Candidate profile looks promising.");
    });

    it("should allow stepping through lifecycle: Reviewed -> Shortlisted -> Accepted", async () => {
      // Pending -> Reviewed
      await fetch(`${baseUrl}/api/applications/${testApp._id}/status`, {
        method: "PATCH",
        headers: getJsonHeaders(recruiter1Cookie),
        body: JSON.stringify({ status: "Reviewed" })
      });

      // Reviewed -> Shortlisted
      const resShort = await fetch(`${baseUrl}/api/applications/${testApp._id}/status`, {
        method: "PATCH",
        headers: getJsonHeaders(recruiter1Cookie),
        body: JSON.stringify({ status: "Shortlisted", note: "Selected for technical interview" })
      });
      assert.equal(resShort.status, 200);
      const bodyShort = await resShort.json();
      assert.equal(bodyShort.data.application.status, "Shortlisted");

      // Shortlisted -> Accepted
      const resAccept = await fetch(`${baseUrl}/api/applications/${testApp._id}/status`, {
        method: "PATCH",
        headers: getJsonHeaders(recruiter1Cookie),
        body: JSON.stringify({ status: "Accepted", note: "Offer extended and accepted!" })
      });
      assert.equal(resAccept.status, 200);
      const bodyAccept = await resAccept.json();
      assert.equal(bodyAccept.data.application.status, "Accepted");
      assert.equal(bodyAccept.data.application.statusHistory.length, 4);
    });

    it("should reject invalid status transition for recruiters (e.g. Accepted -> Pending) with 400 Bad Request", async () => {
      // Set to Accepted (terminal)
      testApp.status = "Accepted";
      await testApp.save();

      const res = await fetch(`${baseUrl}/api/applications/${testApp._id}/status`, {
        method: "PATCH",
        headers: getJsonHeaders(recruiter1Cookie),
        body: JSON.stringify({ status: "Pending" })
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.match(body.message, /invalid status transition/i);
    });

    it("should allow admin to override a terminal status transition", async () => {
      testApp.status = "Rejected";
      await testApp.save();

      const res = await fetch(`${baseUrl}/api/applications/${testApp._id}/status`, {
        method: "PATCH",
        headers: getJsonHeaders(adminCookie),
        body: JSON.stringify({
          status: "Reviewed",
          note: "Admin reopened application upon appeal."
        })
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.application.status, "Reviewed");
    });

    it("should avoid duplicate status history entries when same status is submitted", async () => {
      const res = await fetch(`${baseUrl}/api/applications/${testApp._id}/status`, {
        method: "PATCH",
        headers: getJsonHeaders(recruiter1Cookie),
        body: JSON.stringify({ status: "Pending" })
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.application.statusHistory.length, 1);
    });

    it("should reject invalid status values with 400 Bad Request", async () => {
      const res = await fetch(`${baseUrl}/api/applications/${testApp._id}/status`, {
        method: "PATCH",
        headers: getJsonHeaders(recruiter1Cookie),
        body: JSON.stringify({ status: "SuperHiredXYZ" })
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.match(body.message, /invalid status/i);
    });

    it("should prevent unrelated recruiter from changing application status with 403 Forbidden", async () => {
      const res = await fetch(`${baseUrl}/api/applications/${testApp._id}/status`, {
        method: "PATCH",
        headers: getJsonHeaders(recruiter2Cookie),
        body: JSON.stringify({ status: "Reviewed" })
      });

      assert.equal(res.status, 403);
    });

    it("should prevent candidate from changing their own application status with 403 Forbidden", async () => {
      const res = await fetch(`${baseUrl}/api/applications/${testApp._id}/status`, {
        method: "PATCH",
        headers: getJsonHeaders(seeker1Cookie),
        body: JSON.stringify({ status: "Accepted" })
      });

      assert.equal(res.status, 403);
    });
  });
});
