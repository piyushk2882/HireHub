const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { app } = require("../src/server");
const { User, Company, Job, Application } = require("../src/models");
const { connectDB, disconnectDB } = require("../src/config/database");
const { generateToken } = require("../src/utils/jwt");

describe("Job Management APIs Tests", () => {
  let server;
  let baseUrl;

  let recruiter1, recruiter2, jobSeeker, adminUser;
  let recruiter1Cookie, recruiter2Cookie, seekerCookie, adminCookie;
  let company1, company2;
  let job1, jobDraft, jobClosed, job2;

  const validCsrf = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
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
    const oldJobs = await Job.find({ title: /.*JobTestTitle.*/i }).select("_id");
    await Application.deleteMany({ jobId: { $in: oldJobs.map(j => j._id) } });
    await User.deleteMany({ email: /.*@test-jobs\.example/i });
    await Company.deleteMany({ companyName: /.*JobTestCo.*/i });
    await Job.deleteMany({ title: /.*JobTestTitle.*/i });

    // Seed test users
    const passwordHash = await bcrypt.hash("Password123!", 10);

    recruiter1 = await User.create({
      name: "Alice Recruiter",
      email: "recruiter1@test-jobs.example",
      passwordHash,
      role: "recruiter",
      isActive: true
    });
    recruiter1Cookie = `hirehub_token=${generateToken({ id: recruiter1._id, role: recruiter1.role })}`;

    recruiter2 = await User.create({
      name: "Bob Recruiter",
      email: "recruiter2@test-jobs.example",
      passwordHash,
      role: "recruiter",
      isActive: true
    });
    recruiter2Cookie = `hirehub_token=${generateToken({ id: recruiter2._id, role: recruiter2.role })}`;

    jobSeeker = await User.create({
      name: "Charlie Seeker",
      email: "seeker@test-jobs.example",
      passwordHash,
      role: "job_seeker",
      isActive: true
    });
    seekerCookie = `hirehub_token=${generateToken({ id: jobSeeker._id, role: jobSeeker.role })}`;

    adminUser = await User.create({
      name: "Diana Admin",
      email: "admin@test-jobs.example",
      passwordHash,
      role: "admin",
      isActive: true
    });
    adminCookie = `hirehub_token=${generateToken({ id: adminUser._id, role: adminUser.role })}`;

    // Seed companies
    company1 = await Company.create({
      companyName: "Google JobTestCo",
      description: "Search and cloud tech",
      website: "https://google.test",
      industry: "Technology",
      location: "Mountain View, CA",
      recruiterId: recruiter1._id
    });

    company2 = await Company.create({
      companyName: "Microsoft JobTestCo",
      description: "Operating systems and software",
      website: "https://microsoft.test",
      industry: "Technology",
      location: "Redmond, WA",
      recruiterId: recruiter2._id
    });
  });

  after(async () => {
    const testJobIds = await Job.find({ title: /.*JobTestTitle.*/i }).select("_id");
    await Application.deleteMany({ jobId: { $in: testJobIds.map(j => j._id) } });
    await User.deleteMany({ email: /.*@test-jobs\.example/i });
    await Company.deleteMany({ companyName: /.*JobTestCo.*/i });
    await Job.deleteMany({ title: /.*JobTestTitle.*/i });
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  });

  describe("POST /api/jobs (Create Job Posting)", () => {
    it("should allow a recruiter to create an active job posting for their own company", async () => {
      const res = await fetch(`${baseUrl}/api/jobs`, {
        method: "POST",
        headers: getHeaders(recruiter1Cookie),
        body: JSON.stringify({
          title: "JobTestTitle Senior Fullstack Engineer",
          description: "Build robust backend microservices and modern frontend UIs.",
          requirements: ["5+ years Node.js", "TypeScript", "MongoDB"],
          responsibilities: ["Design APIs", "Review code"],
          companyId: company1._id.toString(),
          location: "Mountain View, CA",
          employmentType: "Full Time",
          experienceLevel: "Senior",
          salaryMin: 140000,
          salaryMax: 190000,
          category: "Development",
          skills: ["Node.js", "Angular", "MongoDB"],
          status: "Active"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 201);
      assert.equal(data.success, true);
      assert.equal(data.data.job.title, "JobTestTitle Senior Fullstack Engineer");
      assert.equal(data.data.job.recruiterId.toString(), recruiter1._id.toString());
      assert.equal(data.data.job.companyId._id.toString(), company1._id.toString());
      job1 = data.data.job;
    });

    it("should reject unauthenticated job creation with 401", async () => {
      const res = await fetch(`${baseUrl}/api/jobs`, {
        method: "POST",
        headers: getHeaders(null),
        body: JSON.stringify({
          title: "JobTestTitle Hacker",
          description: "Anon",
          companyId: company1._id.toString(),
          location: "Remote",
          category: "Development"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.success, false);
    });

    it("should reject job creation by a job seeker with 403 Forbidden", async () => {
      const res = await fetch(`${baseUrl}/api/jobs`, {
        method: "POST",
        headers: getHeaders(seekerCookie),
        body: JSON.stringify({
          title: "JobTestTitle Seeker Fake Job",
          description: "Not allowed",
          companyId: company1._id.toString(),
          location: "Remote",
          category: "Development"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 403);
      assert.equal(data.success, false);
    });

    it("should prevent a recruiter from creating jobs for another company with 403", async () => {
      // Recruiter 1 attempts to create a job for Recruiter 2's company (company2)
      const res = await fetch(`${baseUrl}/api/jobs`, {
        method: "POST",
        headers: getHeaders(recruiter1Cookie),
        body: JSON.stringify({
          title: "JobTestTitle Fraud Job",
          description: "Unauthorized company job",
          companyId: company2._id.toString(),
          location: "Redmond",
          category: "Development"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 403);
      assert.equal(data.success, false);
      assert.ok(data.message.includes("own company"));
    });

    it("should validate that salaryMin cannot exceed salaryMax", async () => {
      const res = await fetch(`${baseUrl}/api/jobs`, {
        method: "POST",
        headers: getHeaders(recruiter1Cookie),
        body: JSON.stringify({
          title: "JobTestTitle Invalid Salary",
          description: "Invalid salary bounds",
          companyId: company1._id.toString(),
          location: "Remote",
          category: "Development",
          salaryMin: 200000,
          salaryMax: 100000
        })
      });

      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.ok(data.message.includes("Minimum salary cannot be greater than maximum salary"));
    });

    it("should seed draft and closed jobs for testing visibility rules", async () => {
      // Seed Draft job
      const draftRes = await fetch(`${baseUrl}/api/jobs`, {
        method: "POST",
        headers: getHeaders(recruiter1Cookie),
        body: JSON.stringify({
          title: "JobTestTitle Internal Draft",
          description: "Unpublished draft job",
          companyId: company1._id.toString(),
          location: "Mountain View, CA",
          category: "Development",
          status: "Draft"
        })
      });
      const draftData = await draftRes.json();
      assert.equal(draftRes.status, 201);
      jobDraft = draftData.data.job;

      // Seed Closed job
      const closedRes = await fetch(`${baseUrl}/api/jobs`, {
        method: "POST",
        headers: getHeaders(recruiter1Cookie),
        body: JSON.stringify({
          title: "JobTestTitle Filled Position",
          description: "Closed role",
          companyId: company1._id.toString(),
          location: "Mountain View, CA",
          category: "Marketing",
          status: "Closed"
        })
      });
      const closedData = await closedRes.json();
      assert.equal(closedRes.status, 201);
      jobClosed = closedData.data.job;

      // Seed job for Recruiter 2
      const job2Res = await fetch(`${baseUrl}/api/jobs`, {
        method: "POST",
        headers: getHeaders(recruiter2Cookie),
        body: JSON.stringify({
          title: "JobTestTitle UX UI Designer",
          description: "Design Figma components and design systems",
          companyId: company2._id.toString(),
          location: "Redmond, WA",
          employmentType: "Contract",
          experienceLevel: "Mid",
          salaryMin: 90000,
          salaryMax: 120000,
          category: "Design",
          skills: ["Figma", "UI/UX", "Design Systems"],
          status: "Active"
        })
      });
      const job2Data = await job2Res.json();
      assert.equal(job2Res.status, 201);
      job2 = job2Data.data.job;
    });
  });

  describe("GET /api/jobs (Public Job Search & Filters)", () => {
    it("should return only published 'Active' jobs by default without exposing Drafts or Closed", async () => {
      const res = await fetch(`${baseUrl}/api/jobs`);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.ok(data.data.jobs.length >= 2);
      assert.ok(data.data.pagination);

      // Verify no draft or closed jobs exist in public list
      const statuses = data.data.jobs.map((j) => j.status);
      assert.ok(statuses.every((s) => s === "Active"), "All publicly returned jobs must be Active");
    });

    it("should search jobs by title keyword", async () => {
      const res = await fetch(`${baseUrl}/api/jobs?search=Fullstack`);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.ok(data.data.jobs.some((j) => j.title.includes("Fullstack")));
    });

    it("should search jobs by skill tag", async () => {
      const res = await fetch(`${baseUrl}/api/jobs?search=Figma`);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.ok(data.data.jobs.some((j) => j.skills.includes("Figma")));
    });

    it("should search jobs by matching company name", async () => {
      const res = await fetch(`${baseUrl}/api/jobs?search=Microsoft`);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.ok(data.data.jobs.some((j) => j.companyId.companyName.includes("Microsoft")));
    });

    it("should filter jobs by category", async () => {
      const res = await fetch(`${baseUrl}/api/jobs?category=Design`);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.ok(data.data.jobs.every((j) => j.category === "Design"));
    });

    it("should filter jobs by location", async () => {
      const res = await fetch(`${baseUrl}/api/jobs?location=Redmond`);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.ok(data.data.jobs.every((j) => j.location.includes("Redmond")));
    });

    it("should filter jobs by employmentType and experienceLevel", async () => {
      const res = await fetch(`${baseUrl}/api/jobs?employmentType=Contract&experienceLevel=Mid`);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.ok(data.data.jobs.every((j) => j.employmentType === "Contract" && j.experienceLevel === "Mid"));
    });

    it("should filter jobs by salary range", async () => {
      const res = await fetch(`${baseUrl}/api/jobs?minSalary=130000`);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.ok(data.data.jobs.some((j) => j.salaryMax >= 130000));
    });

    it("should support sorting options (salary_desc, oldest)", async () => {
      const res = await fetch(`${baseUrl}/api/jobs?sort=salary_desc`);
      const data = await res.json();

      assert.equal(res.status, 200);
      const salaries = data.data.jobs.map((j) => j.salaryMax || 0);
      for (let i = 0; i < salaries.length - 1; i++) {
        assert.ok(salaries[i] >= salaries[i + 1], "Jobs should be sorted in descending salary order");
      }
    });

    it("should return valid pagination metadata", async () => {
      const res = await fetch(`${baseUrl}/api/jobs?page=1&limit=1`);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.data.jobs.length, 1);
      assert.equal(data.data.pagination.page, 1);
      assert.equal(data.data.pagination.limit, 1);
      assert.ok(data.data.pagination.totalPages >= 2);
      assert.equal(data.data.pagination.hasNextPage, true);
      assert.equal(data.data.pagination.hasPrevPage, false);
    });
  });

  describe("GET /api/jobs/:id (Job Details)", () => {
    it("should retrieve single published job details with populated company", async () => {
      const res = await fetch(`${baseUrl}/api/jobs/${job1._id}`);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.job.title, "JobTestTitle Senior Fullstack Engineer");
      assert.ok(data.data.job.companyId.companyName);
      assert.equal(data.data.job.companyId.companyName, "Google JobTestCo");
    });

    it("should hide draft jobs from unauthenticated public visitors with 404", async () => {
      const res = await fetch(`${baseUrl}/api/jobs/${jobDraft._id}`);
      const data = await res.json();

      assert.equal(res.status, 404);
      assert.equal(data.success, false);
      assert.ok(data.message.includes("not publicly available"));
    });

    it("should reject invalid ObjectId format with 400", async () => {
      const res = await fetch(`${baseUrl}/api/jobs/invalid_id_format`);
      const data = await res.json();

      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.ok(data.message.includes("Invalid job ID format"));
    });

    it("should return 404 for non-existent job ID", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await fetch(`${baseUrl}/api/jobs/${fakeId}`);
      const data = await res.json();

      assert.equal(res.status, 404);
      assert.equal(data.success, false);
      assert.ok(data.message.includes("not found"));
    });
  });

  describe("GET /api/jobs/my-jobs (Recruiter Job Management Listing)", () => {
    it("should allow a recruiter to view all their own jobs including Drafts and Closed", async () => {
      const res = await fetch(`${baseUrl}/api/jobs/my-jobs`, {
        headers: getHeaders(recruiter1Cookie)
      });
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      // Recruiter 1 has 3 jobs (Active, Draft, Closed)
      assert.equal(data.data.jobs.length, 3);
      const statuses = data.data.jobs.map((j) => j.status);
      assert.ok(statuses.includes("Active"));
      assert.ok(statuses.includes("Draft"));
      assert.ok(statuses.includes("Closed"));
    });

    it("should allow status filtering on my-jobs", async () => {
      const res = await fetch(`${baseUrl}/api/jobs/my-jobs?status=Draft`, {
        headers: getHeaders(recruiter1Cookie)
      });
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.data.jobs.length, 1);
      assert.equal(data.data.jobs[0].status, "Draft");
    });

    it("should allow admin to view all jobs or filter by recruiter", async () => {
      const res = await fetch(`${baseUrl}/api/jobs/my-jobs?recruiterId=${recruiter2._id}`, {
        headers: getHeaders(adminCookie)
      });
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.data.jobs.length, 1);
      assert.equal(data.data.jobs[0].title, "JobTestTitle UX UI Designer");
    });
  });

  describe("PUT /api/jobs/:id (Update Job Posting)", () => {
    it("should allow owner recruiter to update job fields", async () => {
      const res = await fetch(`${baseUrl}/api/jobs/${job1._id}`, {
        method: "PUT",
        headers: getHeaders(recruiter1Cookie),
        body: JSON.stringify({
          title: "JobTestTitle Lead Fullstack Architect",
          salaryMax: 210000,
          experienceLevel: "Lead"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.job.title, "JobTestTitle Lead Fullstack Architect");
      assert.equal(data.data.job.salaryMax, 210000);
      assert.equal(data.data.job.experienceLevel, "Lead");
    });

    it("should prevent another recruiter from updating someone else's job with 403", async () => {
      const res = await fetch(`${baseUrl}/api/jobs/${job1._id}`, {
        method: "PUT",
        headers: getHeaders(recruiter2Cookie),
        body: JSON.stringify({
          title: "JobTestTitle Hijacked"
        })
      });

      const data = await res.json();
      assert.equal(res.status, 403);
      assert.equal(data.success, false);
      assert.ok(data.message.includes("Access denied"));
    });

    it("should prevent recruiter from changing recruiterId in body", async () => {
      const res = await fetch(`${baseUrl}/api/jobs/${job1._id}`, {
        method: "PUT",
        headers: getHeaders(recruiter1Cookie),
        body: JSON.stringify({
          recruiterId: recruiter2._id.toString()
        })
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.data.job.recruiterId.toString(), recruiter1._id.toString(), "recruiterId must NOT be changed");
    });
  });

  describe("PATCH /api/jobs/:id/status (Update Job Status)", () => {
    it("should allow owner recruiter to publish a draft job", async () => {
      const res = await fetch(`${baseUrl}/api/jobs/${jobDraft._id}/status`, {
        method: "PATCH",
        headers: getHeaders(recruiter1Cookie),
        body: JSON.stringify({ status: "Active" })
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.job.status, "Active");
    });

    it("should reject invalid status transition with 400", async () => {
      const res = await fetch(`${baseUrl}/api/jobs/${jobDraft._id}/status`, {
        method: "PATCH",
        headers: getHeaders(recruiter1Cookie),
        body: JSON.stringify({ status: "InvalidStatusXYZ" })
      });

      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.ok(data.message.includes("Status must be one of"));
    });
  });

  describe("DELETE /api/jobs/:id (Safe Deletion & Archival)", () => {
    it("should safely archive a job when candidate applications exist", async () => {
      // Create an application for job2
      await Application.create({
        jobId: job2._id,
        applicantId: jobSeeker._id,
        resumeUrl: "https://hirehub.test/resumes/charlie.pdf",
        coverLetter: "I would love to join the team as UX Designer."
      });

      // Recruiter 2 attempts to delete job2
      const res = await fetch(`${baseUrl}/api/jobs/${job2._id}`, {
        method: "DELETE",
        headers: getHeaders(recruiter2Cookie)
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.action, "archived");
      assert.ok(data.message.includes("safely archived"));

      // Verify the job still exists in MongoDB with Archived status
      const archivedJob = await Job.findById(job2._id);
      assert.ok(archivedJob);
      assert.equal(archivedJob.status, "Archived");

      // Verify candidate application was NOT deleted
      const appCount = await Application.countDocuments({ jobId: job2._id });
      assert.equal(appCount, 1);
    });

    it("should permanently delete a job when zero applications exist", async () => {
      // jobDraft has 0 applications
      const res = await fetch(`${baseUrl}/api/jobs/${jobDraft._id}`, {
        method: "DELETE",
        headers: getHeaders(recruiter1Cookie)
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.action, "deleted");
      assert.ok(data.message.includes("permanently deleted"));

      // Verify removed from database
      const deletedJob = await Job.findById(jobDraft._id);
      assert.equal(deletedJob, null);
    });

    it("should prevent a recruiter from deleting another recruiter's job with 403", async () => {
      const res = await fetch(`${baseUrl}/api/jobs/${job1._id}`, {
        method: "DELETE",
        headers: getHeaders(recruiter2Cookie)
      });

      const data = await res.json();
      assert.equal(res.status, 403);
      assert.equal(data.success, false);
    });
  });
});

