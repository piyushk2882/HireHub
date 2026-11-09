require("dotenv").config();
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { EmailOutbox } = require("../src/models");
const { connectDB, disconnectDB } = require("../src/config/database");
const {
  setTransporter,
  buildEmailContent,
  deliverEmail
} = require("../src/services/email.service");
const {
  claimNextJob,
  processNextJob,
  processBatch,
  calculateBackoffMs,
  STALE_JOB_THRESHOLD_MS
} = require("../src/workers/email.worker");

describe("Email Worker & Queue Resilience Tests (Phase 6A)", () => {
  let mockSentEmails = [];
  let shouldTransporterFail = false;
  let testRecipientId;

  // Mock transporter for testing without live SMTP
  const mockTransporter = {
    sendMail: async (mailOptions) => {
      if (shouldTransporterFail) {
        throw new Error("Simulated SMTP Connection Timeout (ECONNREFUSED)");
      }
      mockSentEmails.push(mailOptions);
      return { messageId: `<mock-${Date.now()}@hirehub.test>` };
    }
  };

  before(async () => {
    await connectDB();
    setTransporter(mockTransporter);
    testRecipientId = new mongoose.Types.ObjectId();

    await EmailOutbox.deleteMany({});
  });

  after(async () => {
    setTransporter(null);
    await EmailOutbox.deleteMany({});
    await disconnectDB();
  });

  beforeEach(async () => {
    mockSentEmails = [];
    shouldTransporterFail = false;
    await EmailOutbox.deleteMany({});
  });

  describe("Template Generation & HTML Sanitization", () => {
    it("should safely sanitize untrusted user input in templates to prevent HTML injection", () => {
      const maliciousPayload = {
        candidateName: '<script>alert("xss")</script>',
        jobTitle: 'Senior Dev <img src=x onerror=alert(1)> & "Lead"',
        companyName: "Acme <b>Corp</b>",
        note: "Note with <script> and &"
      };

      const result = buildEmailContent("APPLICATION_REVIEWED", maliciousPayload);

      assert.ok(result.subject.includes('Senior Dev <img src=x onerror=alert(1)> & "Lead"'));
      // HTML must be escaped
      assert.ok(!result.html.includes("<script>alert"));
      assert.ok(result.html.includes("&lt;script&gt;alert"));
      assert.ok(!result.html.includes("<img src=x"));
      assert.ok(result.html.includes("&lt;img src=x"));
      assert.ok(result.html.includes("Acme &lt;b&gt;Corp&lt;/b&gt;"));
      // Plain text preserves message readable without tags
      assert.ok(result.text.includes("Senior Dev"));
    });

    it("should throw for unsupported template type", () => {
      assert.throws(() => {
        buildEmailContent("UNKNOWN_TEMPLATE", {});
      }, /Unsupported email template/);
    });
  });

  describe("Queue Processing & Delivery", () => {
    beforeEach(async () => {
      mockSentEmails = [];
      shouldTransporterFail = false;
      await EmailOutbox.deleteMany({});
    });

    it("should process a pending outbox job and mark it Sent", async () => {
      const job = await EmailOutbox.create({
        recipientEmail: "candidate1@test-worker.example",
        recipientId: testRecipientId,
        template: "APPLICATION_SHORTLISTED",
        payload: {
          candidateName: "John Doe",
          jobTitle: "Backend Engineer",
          companyName: "TechCorp"
        },
        status: "Pending",
        attempts: 0
      });

      const result = await processNextJob("test-worker-1");

      assert.ok(result);
      assert.equal(result.success, true);
      assert.equal(mockSentEmails.length, 1);
      assert.equal(mockSentEmails[0].to, "candidate1@test-worker.example");
      assert.ok(mockSentEmails[0].subject.includes("Shortlisted"));

      const updated = await EmailOutbox.findById(job._id);
      assert.equal(updated.status, "Sent");
      assert.equal(updated.attempts, 1);
      assert.ok(updated.sentAt);
      assert.equal(updated.lockedAt, null);
      assert.equal(updated.lockedBy, null);
      assert.equal(updated.lastError, null);
    });

    it("should return null when no pending jobs are available", async () => {
      const result = await processNextJob("test-worker-1");
      assert.equal(result, null);
    });

    it("should process multiple jobs in batch mode", async () => {
      for (let i = 1; i <= 3; i++) {
        await EmailOutbox.create({
          recipientEmail: `user${i}@test-worker.example`,
          recipientId: testRecipientId,
          template: "APPLICATION_REVIEWED",
          payload: {
            candidateName: `User ${i}`,
            jobTitle: "Software Engineer",
            companyName: "TechCorp"
          },
          status: "Pending"
        });
      }

      const results = await processBatch(5, "test-worker-batch");
      assert.equal(results.length, 3);
      assert.equal(mockSentEmails.length, 3);

      const pendingCount = await EmailOutbox.countDocuments({
        recipientEmail: /.*@test-worker\.example/i,
        status: "Pending"
      });
      assert.equal(pendingCount, 0);

      const sentCount = await EmailOutbox.countDocuments({
        recipientEmail: /.*@test-worker\.example/i,
        status: "Sent"
      });
      assert.equal(sentCount, 3);
    });
  });

  describe("Retry Logic & Exponential Backoff", () => {
    beforeEach(async () => {
      mockSentEmails = [];
      shouldTransporterFail = false;
      await EmailOutbox.deleteMany({});
    });

    it("should calculate correct exponential backoff delays", () => {
      assert.equal(calculateBackoffMs(1), 5000); // 5s * 2^0 = 5s
      assert.equal(calculateBackoffMs(2), 10000); // 5s * 2^1 = 10s
      assert.equal(calculateBackoffMs(3), 20000); // 5s * 2^2 = 20s
      assert.equal(calculateBackoffMs(4), 40000); // 5s * 2^3 = 40s
      // Capped at 1 hour (3600000 ms)
      assert.equal(calculateBackoffMs(20), 3600000);
    });

    it("should reschedule failed job with backoff when under maxAttempts", async () => {
      shouldTransporterFail = true;

      const job = await EmailOutbox.create({
        recipientEmail: "retry@test-worker.example",
        recipientId: testRecipientId,
        template: "APPLICATION_REJECTED",
        payload: {
          candidateName: "Jane Doe",
          jobTitle: "Designer",
          companyName: "CreativeLab"
        },
        status: "Pending",
        attempts: 0,
        maxAttempts: 3
      });

      const beforeAttempt = Date.now();
      const result = await processNextJob("test-worker-retry");

      assert.ok(result);
      assert.equal(result.success, false);

      const updated = await EmailOutbox.findById(job._id);
      assert.equal(updated.status, "Pending");
      assert.equal(updated.attempts, 1);
      assert.ok(updated.nextAttemptAt.getTime() >= beforeAttempt + 4900);
      assert.ok(updated.lastError.includes("ECONNREFUSED"));
      assert.equal(updated.lockedAt, null);
      assert.equal(updated.lockedBy, null);
    });

    it("should permanently mark job as Failed when maxAttempts is reached", async () => {
      shouldTransporterFail = true;

      const job = await EmailOutbox.create({
        recipientEmail: "final-fail@test-worker.example",
        recipientId: testRecipientId,
        template: "APPLICATION_ACCEPTED",
        payload: {
          candidateName: "Bob",
          jobTitle: "Developer",
          companyName: "TechCorp"
        },
        status: "Pending",
        attempts: 2, // Next attempt will be #3 = maxAttempts
        maxAttempts: 3
      });

      const result = await processNextJob("test-worker-final-fail");

      assert.ok(result);
      assert.equal(result.success, false);

      const updated = await EmailOutbox.findById(job._id);
      assert.equal(updated.status, "Failed");
      assert.equal(updated.attempts, 3);
      assert.ok(updated.lastError.includes("ECONNREFUSED"));
      assert.equal(updated.lockedAt, null);
      assert.equal(updated.lockedBy, null);
    });
  });

  describe("Concurrency Control & Atomic Locking", () => {
    beforeEach(async () => {
      mockSentEmails = [];
      shouldTransporterFail = false;
      await EmailOutbox.deleteMany({});
    });

    it("should prevent duplicate processing across concurrent workers", async () => {
      await EmailOutbox.create({
        recipientEmail: "concurrent@test-worker.example",
        recipientId: testRecipientId,
        template: "NEW_APPLICATION",
        payload: {
          jobTitle: "DevOps Engineer",
          companyName: "CloudNet",
          applicantName: "Sam"
        },
        status: "Pending",
        attempts: 0
      });

      // Claim job simultaneously from two different workers
      const [claim1, claim2] = await Promise.all([
        claimNextJob("worker-alpha"),
        claimNextJob("worker-beta")
      ]);

      // Exactly ONE worker must acquire the job; the other receives null
      const acquiredCount = [claim1, claim2].filter(Boolean).length;
      assert.equal(acquiredCount, 1, "Only one worker should atomically claim the job");

      const acquiredJob = claim1 || claim2;
      assert.equal(acquiredJob.status, "Processing");
      assert.ok(acquiredJob.lockedBy === "worker-alpha" || acquiredJob.lockedBy === "worker-beta");
    });

    it("should recover stale Processing jobs older than threshold", async () => {
      const staleTime = new Date(Date.now() - STALE_JOB_THRESHOLD_MS - 60000); // 6 minutes ago

      const staleJob = await EmailOutbox.create({
        recipientEmail: "stale@test-worker.example",
        recipientId: testRecipientId,
        template: "APPLICATION_SHORTLISTED",
        payload: {
          candidateName: "Stale Worker Job",
          jobTitle: "Lead Architect",
          companyName: "TechCorp"
        },
        status: "Processing",
        attempts: 1,
        lockedAt: staleTime,
        lockedBy: "dead-worker-pid-9999"
      });

      // A live worker should reclaim this stale job
      const reclaimed = await claimNextJob("living-worker-1");
      assert.ok(reclaimed);
      assert.equal(reclaimed._id.toString(), staleJob._id.toString());
      assert.equal(reclaimed.lockedBy, "living-worker-1");
      assert.equal(reclaimed.attempts, 2); // Incremented
    });
  });
});

