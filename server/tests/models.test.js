const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { User, Company, Job, Application, Notification, EmailOutbox } = require("../src/models");

describe("Mongoose Models Validation & Schema Architecture", () => {
  describe("User Model", () => {
    it("should fail validation when required fields are missing", async () => {
      const user = new User({});
      const error = await user.validate().catch((err) => err);

      assert.ok(error, "Expected validation error for empty User");
      assert.ok(error.errors.name, "Name should be required");
      assert.ok(error.errors.email, "Email should be required");
      assert.ok(error.errors.passwordHash, "PasswordHash should be required");
    });

    it("should reject invalid email formats", async () => {
      const user = new User({
        name: "Test User",
        email: "invalid-email-address",
        passwordHash: "hashed_secret"
      });
      const error = await user.validate().catch((err) => err);

      assert.ok(error, "Expected validation error for invalid email");
      assert.ok(error.errors.email, "Email format validation should fail");
    });

    it("should reject roles outside of enum", async () => {
      const user = new User({
        name: "Test User",
        email: "test@hirehub.com",
        passwordHash: "hashed_secret",
        role: "super_hacker"
      });
      const error = await user.validate().catch((err) => err);

      assert.ok(error, "Expected validation error for invalid role");
      assert.ok(error.errors.role, "Role enum validation should fail");
    });

    it("should default role to 'job_seeker' and isActive to true", async () => {
      const user = new User({
        name: "Valid User",
        email: "valid@hirehub.com",
        passwordHash: "hashed_secret"
      });
      const error = await user.validate().catch((err) => err);

      assert.equal(error, undefined, "Valid user should pass validation");
      assert.equal(user.role, "job_seeker");
      assert.equal(user.isActive, true);
    });

    it("should trim and lowercase email", () => {
      const user = new User({
        name: "Normalized User",
        email: "  USER@HireHub.COM  ",
        passwordHash: "hashed_secret"
      });

      assert.equal(user.email, "user@hirehub.com");
    });
  });

  describe("Company Model", () => {
    it("should fail validation when required fields are missing", async () => {
      const company = new Company({});
      const error = await company.validate().catch((err) => err);

      assert.ok(error, "Expected validation error for empty Company");
      assert.ok(error.errors.companyName, "CompanyName should be required");
      assert.ok(error.errors.recruiterId, "RecruiterId should be required");
    });

    it("should validate a complete and valid company document", async () => {
      const validRecruiterId = new mongoose.Types.ObjectId();
      const company = new Company({
        companyName: "TechNova Solutions",
        description: "Enterprise Cloud and AI Solutions",
        website: "https://technova.example.com",
        industry: "Information Technology",
        location: "Bangalore",
        recruiterId: validRecruiterId
      });
      const error = await company.validate().catch((err) => err);

      assert.equal(error, undefined, "Valid company should pass validation");
      assert.equal(company.companyName, "TechNova Solutions");
      assert.equal(company.recruiterId.toString(), validRecruiterId.toString());
    });
  });

  describe("Job Model", () => {
    it("should fail validation when required fields are missing", async () => {
      const job = new Job({});
      const error = await job.validate().catch((err) => err);

      assert.ok(error, "Expected validation error for empty Job");
      assert.ok(error.errors.title, "Title should be required");
      assert.ok(error.errors.description, "Description should be required");
      assert.ok(error.errors.companyId, "CompanyId should be required");
      assert.ok(error.errors.recruiterId, "RecruiterId should be required");
      assert.ok(error.errors.location, "Location should be required");
      assert.ok(error.errors.category, "Category should be required");
    });

    it("should reject categories outside defined enum", async () => {
      const job = new Job({
        title: "Frontend Developer",
        description: "Develop Angular UI",
        companyId: new mongoose.Types.ObjectId(),
        recruiterId: new mongoose.Types.ObjectId(),
        location: "Bangalore",
        category: "InvalidCategory"
      });
      const error = await job.validate().catch((err) => err);

      assert.ok(error, "Expected validation error for invalid category");
      assert.ok(error.errors.category, "Category enum validation should fail");
    });

    it("should reject negative salaries", async () => {
      const job = new Job({
        title: "Frontend Developer",
        description: "Develop Angular UI",
        companyId: new mongoose.Types.ObjectId(),
        recruiterId: new mongoose.Types.ObjectId(),
        location: "Bangalore",
        category: "Development",
        salaryMin: -50000
      });
      const error = await job.validate().catch((err) => err);

      assert.ok(error, "Expected validation error for negative salaryMin");
      assert.ok(error.errors.salaryMin, "SalaryMin must be non-negative");
    });

    it("should pass validation with valid job fields and defaults", async () => {
      const job = new Job({
        title: "Frontend Developer",
        description: "Build clean SaaS applications using Angular.",
        requirements: ["Angular 21", "TypeScript", "SCSS"],
        companyId: new mongoose.Types.ObjectId(),
        recruiterId: new mongoose.Types.ObjectId(),
        location: "Bangalore",
        category: "Development",
        skills: ["Angular", "TypeScript"],
        salaryMin: 600000,
        salaryMax: 900000
      });
      const error = await job.validate().catch((err) => err);

      assert.equal(error, undefined, "Valid job should pass validation");
      assert.equal(job.status, "Active");
      assert.equal(job.employmentType, "Full Time");
    });

    it("should define text index and compound query indexes in schema", () => {
      const indexes = Job.schema.indexes();
      const hasTextIndex = indexes.some(
        ([fields]) => fields.title === "text" && fields.skills === "text"
      );
      const hasCategoryStatusIndex = indexes.some(
        ([fields]) => fields.category === 1 && fields.status === 1
      );

      assert.ok(hasTextIndex, "Job schema must define text search index on title & skills");
      assert.ok(hasCategoryStatusIndex, "Job schema must define compound index on category and status");
    });
  });

  describe("Application Model", () => {
    it("should fail validation when required fields are missing", async () => {
      const app = new Application({});
      const error = await app.validate().catch((err) => err);

      assert.ok(error, "Expected validation error for empty Application");
      assert.ok(error.errors.jobId, "JobId should be required");
      assert.ok(error.errors.applicantId, "ApplicantId should be required");
      assert.ok(error.errors.resumeUrl, "ResumeUrl should be required");
    });

    it("should reject application statuses outside defined enum", async () => {
      const app = new Application({
        jobId: new mongoose.Types.ObjectId(),
        applicantId: new mongoose.Types.ObjectId(),
        resumeUrl: "https://storage.hirehub.com/resumes/my-resume.pdf",
        status: "Archived"
      });
      const error = await app.validate().catch((err) => err);

      assert.ok(error, "Expected validation error for invalid application status");
      assert.ok(error.errors.status, "Status enum validation should fail");
    });

    it("should pass validation with valid fields and default status to 'Pending'", async () => {
      const app = new Application({
        jobId: new mongoose.Types.ObjectId(),
        applicantId: new mongoose.Types.ObjectId(),
        resumeUrl: "https://storage.hirehub.com/resumes/my-resume.pdf",
        coverLetter: "Excited to apply for this role!"
      });
      const error = await app.validate().catch((err) => err);

      assert.equal(error, undefined, "Valid application should pass validation");
      assert.equal(app.status, "Pending");
      assert.ok(app.appliedAt instanceof Date, "appliedAt should default to current date");
    });

    it("should define compound unique index preventing duplicate applications", () => {
      const indexes = Application.schema.indexes();
      const duplicateIndex = indexes.find(
        ([fields, options]) => fields.jobId === 1 && fields.applicantId === 1 && options?.unique === true
      );

      assert.ok(
        duplicateIndex,
        "Application schema must define compound unique index on { jobId: 1, applicantId: 1 }"
      );
    });
  });

  describe("Notification Model", () => {
    it("should fail validation when required fields are missing", async () => {
      const notif = new Notification({});
      const error = await notif.validate().catch((err) => err);

      assert.ok(error, "Expected validation error for empty Notification");
      assert.ok(error.errors.recipientId, "recipientId should be required");
      assert.ok(error.errors.type, "type should be required");
      assert.ok(error.errors.title, "title should be required");
      assert.ok(error.errors.message, "message should be required");
      assert.ok(error.errors.relatedEntityId, "relatedEntityId should be required");
    });

    it("should reject invalid notification type enum", async () => {
      const notif = new Notification({
        recipientId: new mongoose.Types.ObjectId(),
        type: "INVALID_EVENT_TYPE",
        title: "Test",
        message: "Test message",
        relatedEntityId: new mongoose.Types.ObjectId()
      });
      const error = await notif.validate().catch((err) => err);

      assert.ok(error, "Expected validation error for invalid type");
      assert.ok(error.errors.type, "type enum validation should fail");
    });

    it("should pass validation with valid notification document and defaults", async () => {
      const notif = new Notification({
        recipientId: new mongoose.Types.ObjectId(),
        type: "APPLICATION_SHORTLISTED",
        title: "Shortlisted for Node.js Engineer",
        message: "You have been shortlisted.",
        relatedEntityId: new mongoose.Types.ObjectId()
      });
      const error = await notif.validate().catch((err) => err);

      assert.equal(error, undefined, "Valid notification should pass validation");
      assert.equal(notif.isRead, false);
      assert.equal(notif.readAt, null);
      assert.equal(notif.relatedEntityType, "Application");
    });
  });

  describe("EmailOutbox Model", () => {
    it("should fail validation when required fields are missing", async () => {
      const job = new EmailOutbox({});
      const error = await job.validate().catch((err) => err);

      assert.ok(error, "Expected validation error for empty EmailOutbox");
      assert.ok(error.errors.recipientEmail, "recipientEmail should be required");
      assert.ok(error.errors.recipientId, "recipientId should be required");
      assert.ok(error.errors.template, "template should be required");
      assert.ok(error.errors.payload, "payload should be required");
    });

    it("should reject invalid status enum", async () => {
      const job = new EmailOutbox({
        recipientEmail: "test@hirehub.example",
        recipientId: new mongoose.Types.ObjectId(),
        template: "NEW_APPLICATION",
        payload: { jobTitle: "Engineer" },
        status: "UnknownStatus"
      });
      const error = await job.validate().catch((err) => err);

      assert.ok(error, "Expected validation error for invalid status");
      assert.ok(error.errors.status, "status enum validation should fail");
    });

    it("should pass validation with valid fields and defaults", async () => {
      const job = new EmailOutbox({
        recipientEmail: "TEST@HIREHUB.EXAMPLE",
        recipientId: new mongoose.Types.ObjectId(),
        template: "NEW_APPLICATION",
        payload: { jobTitle: "Engineer" }
      });
      const error = await job.validate().catch((err) => err);

      assert.equal(error, undefined, "Valid outbox job should pass validation");
      assert.equal(job.recipientEmail, "test@hirehub.example"); // Lowercased
      assert.equal(job.status, "Pending");
      assert.equal(job.attempts, 0);
      assert.equal(job.maxAttempts, 5);
      assert.ok(job.nextAttemptAt instanceof Date);
    });
  });
});
