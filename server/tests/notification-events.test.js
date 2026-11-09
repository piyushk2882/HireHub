require("dotenv").config();
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { User, Company, Job, Application, Notification, EmailOutbox } = require("../src/models");
const { connectDB, disconnectDB } = require("../src/config/database");
const notificationService = require("../src/services/notification.service");
const { emitStatusChangeNotification } = require("../src/controllers/application.controller");

describe("Notification Events & Workflow Integration Tests (Phase 6A)", () => {
  let recruiterUser;
  let candidateUser;
  let companyDoc;
  let jobDoc;

  before(async () => {
    await connectDB();

    // Clean up test data
    await Notification.deleteMany({ title: /.*Integration Test.*/i });
    await EmailOutbox.deleteMany({ recipientEmail: /.*@test-events\.example/i });
    await Application.deleteMany({ coverLetter: /.*Integration Test Cover.*/i });
    await Job.deleteMany({ title: /.*Integration Test Job.*/i });
    await Company.deleteMany({ companyName: /.*Integration Test Co.*/i });
    await User.deleteMany({ email: /.*@test-events\.example/i });

    const passwordHash = await bcrypt.hash("Password123!", 10);

    recruiterUser = await User.create({
      name: "Event Recruiter",
      email: "recruiter@test-events.example",
      passwordHash,
      role: "recruiter",
      isActive: true,
      notificationPreferences: {
        emailNotificationsEnabled: true,
        applicationStatusEmails: true,
        recruiterNewApplicationEmails: true
      }
    });

    candidateUser = await User.create({
      name: "Event Candidate",
      email: "candidate@test-events.example",
      passwordHash,
      role: "job_seeker",
      isActive: true,
      notificationPreferences: {
        emailNotificationsEnabled: true,
        applicationStatusEmails: true,
        recruiterNewApplicationEmails: true
      }
    });

    companyDoc = await Company.create({
      companyName: "Integration Test Co",
      description: "Company for notification event testing",
      recruiterId: recruiterUser._id
    });

    jobDoc = await Job.create({
      title: "Integration Test Job",
      description: "Test job description",
      requirements: ["Node.js", "Express"],
      location: "Remote",
      employmentType: "Full Time",
      experienceLevel: "Mid",
      category: "Development",
      recruiterId: recruiterUser._id,
      companyId: companyDoc._id,
      status: "Active"
    });
  });

  after(async () => {
    await Notification.deleteMany({
      recipientId: { $in: [recruiterUser._id, candidateUser._id] }
    });
    await EmailOutbox.deleteMany({
      recipientId: { $in: [recruiterUser._id, candidateUser._id] }
    });
    await Application.deleteMany({
      $or: [{ applicantId: candidateUser._id }, { jobId: jobDoc._id }]
    });
    await Job.deleteMany({ recruiterId: recruiterUser._id });
    await Company.deleteMany({ recruiterId: recruiterUser._id });
    await User.deleteMany({ email: /.*@test-events\.example/i });
    await disconnectDB();
  });

  beforeEach(async () => {
    await Application.deleteMany({
      $or: [{ applicantId: candidateUser._id }, { jobId: jobDoc._id }]
    });
    await Notification.deleteMany({
      recipientId: { $in: [recruiterUser._id, candidateUser._id] }
    });
    await EmailOutbox.deleteMany({
      recipientId: { $in: [recruiterUser._id, candidateUser._id] }
    });
  });

  it("should create recruiter in-app notification and outbox email on new application", async () => {
    const application = await Application.create({
      jobId: jobDoc._id,
      applicantId: candidateUser._id,
      resumeUrl: "/api/applications/dummy/resume",
      coverLetter: "Integration Test Cover Letter",
      status: "Pending"
    });

    await notificationService.notifyNewApplication({
      application,
      job: jobDoc,
      applicantId: candidateUser._id
    });

    // 1. Verify in-app notification for recruiter
    const notifs = await Notification.find({ recipientId: recruiterUser._id });
    assert.equal(notifs.length, 1);
    assert.equal(notifs[0].type, "NEW_APPLICATION");
    assert.ok(notifs[0].title.includes("Integration Test Job"));
    assert.ok(notifs[0].message.includes("Event Candidate"));
    assert.equal(notifs[0].relatedEntityType, "Application");
    assert.equal(notifs[0].relatedEntityId.toString(), application._id.toString());
    assert.equal(notifs[0].isRead, false);

    // 2. Verify outbox email job
    const outboxJobs = await EmailOutbox.find({ recipientId: recruiterUser._id });
    assert.equal(outboxJobs.length, 1);
    assert.equal(outboxJobs[0].recipientEmail, "recruiter@test-events.example");
    assert.equal(outboxJobs[0].template, "NEW_APPLICATION");
    assert.equal(outboxJobs[0].status, "Pending");
    assert.equal(outboxJobs[0].attempts, 0);
    assert.equal(outboxJobs[0].payload.jobTitle, "Integration Test Job");
    assert.equal(outboxJobs[0].payload.companyName, "Integration Test Co");
    assert.equal(outboxJobs[0].payload.applicantName, "Event Candidate");
  });

  it("should create candidate in-app notification and outbox email on status change", async () => {
    const application = await Application.create({
      jobId: jobDoc._id,
      applicantId: candidateUser._id,
      resumeUrl: "/api/applications/dummy/resume",
      status: "Reviewed",
      statusHistory: [
        {
          status: "Pending",
          changedBy: candidateUser._id,
          changedAt: new Date()
        },
        {
          status: "Reviewed",
          changedBy: recruiterUser._id,
          changedAt: new Date(),
          note: "Strong resume background"
        }
      ]
    });

    emitStatusChangeNotification(application, "Pending", "Reviewed", recruiterUser._id);

    // Wait a brief tick for async event execution
    await new Promise((r) => setTimeout(r, 200));

    // Verify candidate in-app notification
    const candidateNotifs = await Notification.find({ recipientId: candidateUser._id });
    assert.equal(candidateNotifs.length, 1);
    assert.equal(candidateNotifs[0].type, "APPLICATION_REVIEWED");
    assert.ok(candidateNotifs[0].title.includes("Reviewed"));

    // Verify candidate email outbox entry
    const candidateOutbox = await EmailOutbox.find({ recipientId: candidateUser._id });
    assert.equal(candidateOutbox.length, 1);
    assert.equal(candidateOutbox[0].recipientEmail, "candidate@test-events.example");
    assert.equal(candidateOutbox[0].template, "APPLICATION_REVIEWED");
    assert.equal(candidateOutbox[0].payload.newStatus, "Reviewed");
    assert.equal(candidateOutbox[0].payload.note, "Strong resume background");
  });

  it("should support all lifecycle status changes: Shortlisted, Rejected, Accepted", async () => {
    const testCases = [
      { status: "Shortlisted", type: "APPLICATION_SHORTLISTED" },
      { status: "Rejected", type: "APPLICATION_REJECTED" },
      { status: "Accepted", type: "APPLICATION_ACCEPTED" }
    ];

    for (const tc of testCases) {
      await Application.deleteMany({ jobId: jobDoc._id, applicantId: candidateUser._id });
      await Notification.deleteMany({ recipientId: candidateUser._id });
      await EmailOutbox.deleteMany({ recipientId: candidateUser._id });

      const appDoc = await Application.create({
        jobId: jobDoc._id,
        applicantId: candidateUser._id,
        resumeUrl: "/api/applications/dummy/resume",
        status: tc.status,
        statusHistory: [
          { status: tc.status, changedBy: recruiterUser._id, note: `Status note for ${tc.status}` }
        ]
      });

      await notificationService.notifyApplicationStatusChanged({
        application: appDoc,
        oldStatus: "Reviewed",
        newStatus: tc.status,
        changedBy: recruiterUser._id
      });

      const notifs = await Notification.find({ recipientId: candidateUser._id });
      assert.equal(notifs.length, 1);
      assert.equal(notifs[0].type, tc.type);

      const outbox = await EmailOutbox.find({ recipientId: candidateUser._id });
      assert.equal(outbox.length, 1);
      assert.equal(outbox[0].template, tc.type);
    }
  });

  it("should NOT dispatch notifications when status has not changed", async () => {
    const application = await Application.create({
      jobId: jobDoc._id,
      applicantId: candidateUser._id,
      resumeUrl: "/api/applications/dummy/resume",
      status: "Reviewed"
    });

    emitStatusChangeNotification(application, "Reviewed", "Reviewed", recruiterUser._id);
    await new Promise((r) => setTimeout(r, 100));

    const notifs = await Notification.find({ recipientId: candidateUser._id });
    assert.equal(notifs.length, 0);

    const outbox = await EmailOutbox.find({ recipientId: candidateUser._id });
    assert.equal(outbox.length, 0);
  });

  it("should create in-app notification but suppress email outbox when email preferences are disabled", async () => {
    // Disable candidate's email notifications
    candidateUser.notificationPreferences.emailNotificationsEnabled = false;
    await candidateUser.save();

    const application = await Application.create({
      jobId: jobDoc._id,
      applicantId: candidateUser._id,
      resumeUrl: "/api/applications/dummy/resume",
      status: "Shortlisted"
    });

    await notificationService.notifyApplicationStatusChanged({
      application,
      oldStatus: "Reviewed",
      newStatus: "Shortlisted",
      changedBy: recruiterUser._id
    });

    // In-app notification MUST still be created
    const notifs = await Notification.find({ recipientId: candidateUser._id });
    assert.equal(notifs.length, 1);
    assert.equal(notifs[0].type, "APPLICATION_SHORTLISTED");

    // Email outbox MUST be empty
    const outbox = await EmailOutbox.find({ recipientId: candidateUser._id });
    assert.equal(outbox.length, 0);

    // Reset preference
    candidateUser.notificationPreferences.emailNotificationsEnabled = true;
    await candidateUser.save();
  });

  it("should suppress recruiter email outbox when recruiterNewApplicationEmails is disabled", async () => {
    recruiterUser.notificationPreferences.recruiterNewApplicationEmails = false;
    await recruiterUser.save();

    const application = await Application.create({
      jobId: jobDoc._id,
      applicantId: candidateUser._id,
      resumeUrl: "/api/applications/dummy/resume",
      coverLetter: "Integration Test Cover Letter",
      status: "Pending"
    });

    await notificationService.notifyNewApplication({
      application,
      job: jobDoc,
      applicantId: candidateUser._id
    });

    // In-app notification created
    const notifs = await Notification.find({ recipientId: recruiterUser._id });
    assert.equal(notifs.length, 1);
    assert.equal(notifs[0].type, "NEW_APPLICATION");

    // Email outbox suppressed
    const outbox = await EmailOutbox.find({ recipientId: recruiterUser._id });
    assert.equal(outbox.length, 0);

    // Reset preference
    recruiterUser.notificationPreferences.recruiterNewApplicationEmails = true;
    await recruiterUser.save();
  });

  it("should not throw or crash when notification creation encounters unexpected error", async () => {
    // Pass corrupted/null parameters to ensure service catches and handles gracefully
    await assert.doesNotReject(async () => {
      await notificationService.notifyNewApplication({
        application: null,
        job: null
      });
    });

    await assert.doesNotReject(async () => {
      await notificationService.notifyApplicationStatusChanged({
        application: null,
        oldStatus: "Pending",
        newStatus: "Reviewed"
      });
    });
  });
});

