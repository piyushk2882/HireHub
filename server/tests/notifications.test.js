const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { app } = require("../src/server");
const { User, Notification } = require("../src/models");
const { connectDB, disconnectDB } = require("../src/config/database");
const { generateToken } = require("../src/utils/jwt");

describe("Notification & Preferences APIs Tests (Phase 6A)", () => {
  let server;
  let baseUrl;

  let userA, userB;
  let userACookie, userBCookie;

  const validCsrf = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

  const getJsonHeaders = (cookie) => ({
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

    // Cleanup existing test records
    await User.deleteMany({ email: /.*@test-notif-api\.example/i });
    await Notification.deleteMany({ title: /.*Test Notification.*/i });

    const passwordHash = await bcrypt.hash("Password123!", 10);

    userA = await User.create({
      name: "Alice Seeker",
      email: "alice@test-notif-api.example",
      passwordHash,
      role: "job_seeker",
      isActive: true
    });
    userACookie = `hirehub_token=${generateToken({ id: userA._id, role: userA.role })}`;

    userB = await User.create({
      name: "Bob Recruiter",
      email: "bob@test-notif-api.example",
      passwordHash,
      role: "recruiter",
      isActive: true
    });
    userBCookie = `hirehub_token=${generateToken({ id: userB._id, role: userB.role })}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await Notification.deleteMany({
      recipientId: { $in: [userA._id, userB._id] }
    });
    await User.deleteMany({ email: /.*@test-notif-api\.example/i });
    await disconnectDB();
  });

  beforeEach(async () => {
    await Notification.deleteMany({
      recipientId: { $in: [userA._id, userB._id] }
    });
  });

  describe("GET /api/notifications", () => {
    it("should return empty notification list and pagination metadata for new user", async () => {
      const res = await fetch(`${baseUrl}/api/notifications`, {
        method: "GET",
        headers: getJsonHeaders(userACookie)
      });
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.notifications.length, 0);
      assert.equal(data.data.pagination.total, 0);
      assert.equal(data.data.pagination.page, 1);
      assert.equal(data.data.pagination.limit, 10);
      assert.equal(data.data.pagination.totalPages, 1);
      assert.equal(data.data.pagination.hasNextPage, false);
      assert.equal(data.data.pagination.hasPrevPage, false);
    });

    it("should reject unauthenticated request with 401 Unauthorized", async () => {
      const res = await fetch(`${baseUrl}/api/notifications`, {
        method: "GET",
        headers: getJsonHeaders("")
      });
      assert.equal(res.status, 401);
    });

    it("should list only notifications belonging to the authenticated user", async () => {
      const dummyId = new mongoose.Types.ObjectId();

      await Notification.create({
        recipientId: userA._id,
        type: "APPLICATION_SHORTLISTED",
        title: "Test Notification A1",
        message: "You have been shortlisted.",
        relatedEntityType: "Application",
        relatedEntityId: dummyId
      });

      await Notification.create({
        recipientId: userB._id,
        type: "NEW_APPLICATION",
        title: "Test Notification B1",
        message: "New candidate application received.",
        relatedEntityType: "Application",
        relatedEntityId: dummyId
      });

      const resA = await fetch(`${baseUrl}/api/notifications`, {
        method: "GET",
        headers: getJsonHeaders(userACookie)
      });
      const dataA = await resA.json();

      assert.equal(resA.status, 200);
      assert.equal(dataA.data.notifications.length, 1);
      assert.equal(dataA.data.notifications[0].title, "Test Notification A1");
      assert.equal(dataA.data.notifications[0].recipientId.toString(), userA._id.toString());
    });

    it("should support unread-only filtering", async () => {
      const dummyId = new mongoose.Types.ObjectId();

      await Notification.create({
        recipientId: userA._id,
        type: "APPLICATION_REVIEWED",
        title: "Test Notification Read",
        message: "Already read.",
        relatedEntityType: "Application",
        relatedEntityId: dummyId,
        isRead: true,
        readAt: new Date()
      });

      await Notification.create({
        recipientId: userA._id,
        type: "APPLICATION_ACCEPTED",
        title: "Test Notification Unread",
        message: "Still unread.",
        relatedEntityType: "Application",
        relatedEntityId: dummyId,
        isRead: false
      });

      const res = await fetch(`${baseUrl}/api/notifications?unreadOnly=true`, {
        method: "GET",
        headers: getJsonHeaders(userACookie)
      });
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.data.notifications.length, 1);
      assert.equal(data.data.notifications[0].title, "Test Notification Unread");
      assert.equal(data.data.notifications[0].isRead, false);
    });

    it("should support pagination correctly and sort newest first", async () => {
      const dummyId = new mongoose.Types.ObjectId();
      const docs = [];

      for (let i = 1; i <= 15; i++) {
        docs.push({
          recipientId: userA._id,
          type: "APPLICATION_REVIEWED",
          title: `Test Notification ${i.toString().padStart(2, "0")}`,
          message: `Message ${i}`,
          relatedEntityType: "Application",
          relatedEntityId: dummyId,
          createdAt: new Date(Date.now() + i * 1000)
        });
      }
      await Notification.insertMany(docs);

      // Page 1 with limit 5
      const resPage1 = await fetch(`${baseUrl}/api/notifications?page=1&limit=5`, {
        method: "GET",
        headers: getJsonHeaders(userACookie)
      });
      const dataPage1 = await resPage1.json();

      assert.equal(resPage1.status, 200);
      assert.equal(dataPage1.data.notifications.length, 5);
      assert.equal(dataPage1.data.pagination.total, 15);
      assert.equal(dataPage1.data.pagination.totalPages, 3);
      assert.equal(dataPage1.data.pagination.hasNextPage, true);
      assert.equal(dataPage1.data.pagination.hasPrevPage, false);
      // Newest should be #15
      assert.equal(dataPage1.data.notifications[0].title, "Test Notification 15");

      // Page 2 with limit 5
      const resPage2 = await fetch(`${baseUrl}/api/notifications?page=2&limit=5`, {
        method: "GET",
        headers: getJsonHeaders(userACookie)
      });
      const dataPage2 = await resPage2.json();
      assert.equal(dataPage2.data.notifications.length, 5);
      assert.equal(dataPage2.data.pagination.page, 2);
      assert.equal(dataPage2.data.pagination.hasNextPage, true);
      assert.equal(dataPage2.data.pagination.hasPrevPage, true);
    });
  });

  describe("GET /api/notifications/unread-count", () => {
    it("should accurately return unread notification count", async () => {
      const dummyId = new mongoose.Types.ObjectId();

      await Notification.create({
        recipientId: userA._id,
        type: "APPLICATION_REVIEWED",
        title: "Unread 1",
        message: "Message",
        relatedEntityId: dummyId,
        isRead: false
      });
      await Notification.create({
        recipientId: userA._id,
        type: "APPLICATION_SHORTLISTED",
        title: "Unread 2",
        message: "Message",
        relatedEntityId: dummyId,
        isRead: false
      });
      await Notification.create({
        recipientId: userA._id,
        type: "APPLICATION_REJECTED",
        title: "Read 1",
        message: "Message",
        relatedEntityId: dummyId,
        isRead: true,
        readAt: new Date()
      });

      const res = await fetch(`${baseUrl}/api/notifications/unread-count`, {
        method: "GET",
        headers: getJsonHeaders(userACookie)
      });
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.unreadCount, 2);
    });
  });

  describe("PATCH /api/notifications/:id/read", () => {
    it("should mark a single notification as read with timestamp", async () => {
      const dummyId = new mongoose.Types.ObjectId();
      const notif = await Notification.create({
        recipientId: userA._id,
        type: "APPLICATION_REVIEWED",
        title: "Read Me",
        message: "Testing read",
        relatedEntityId: dummyId,
        isRead: false
      });

      const res = await fetch(`${baseUrl}/api/notifications/${notif._id}/read`, {
        method: "PATCH",
        headers: getJsonHeaders(userACookie)
      });
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.notification.isRead, true);
      assert.ok(data.data.notification.readAt);

      const updated = await Notification.findById(notif._id);
      assert.equal(updated.isRead, true);
      assert.ok(updated.readAt);
    });

    it("should reject invalid ObjectId with 400 Bad Request", async () => {
      const res = await fetch(`${baseUrl}/api/notifications/invalid-id/read`, {
        method: "PATCH",
        headers: getJsonHeaders(userACookie)
      });
      assert.equal(res.status, 400);
    });

    it("should return 404 Not Found for non-existent notification ID", async () => {
      const randomId = new mongoose.Types.ObjectId();
      const res = await fetch(`${baseUrl}/api/notifications/${randomId}/read`, {
        method: "PATCH",
        headers: getJsonHeaders(userACookie)
      });
      assert.equal(res.status, 404);
    });

    it("should prevent a user from marking another user's notification as read with 403 Forbidden", async () => {
      const dummyId = new mongoose.Types.ObjectId();
      const notifB = await Notification.create({
        recipientId: userB._id,
        type: "NEW_APPLICATION",
        title: "Bob's notification",
        message: "Private to Bob",
        relatedEntityId: dummyId,
        isRead: false
      });

      const res = await fetch(`${baseUrl}/api/notifications/${notifB._id}/read`, {
        method: "PATCH",
        headers: getJsonHeaders(userACookie) // User A attempts to modify User B's notification
      });
      const data = await res.json();

      assert.equal(res.status, 403);
      assert.equal(data.success, false);

      const check = await Notification.findById(notifB._id);
      assert.equal(check.isRead, false); // Remains unread
    });
  });

  describe("PATCH /api/notifications/read-all", () => {
    it("should mark all unread notifications of the user as read", async () => {
      const dummyId = new mongoose.Types.ObjectId();

      await Notification.create({
        recipientId: userA._id,
        type: "APPLICATION_REVIEWED",
        title: "A1",
        message: "Message",
        relatedEntityId: dummyId,
        isRead: false
      });
      await Notification.create({
        recipientId: userA._id,
        type: "APPLICATION_SHORTLISTED",
        title: "A2",
        message: "Message",
        relatedEntityId: dummyId,
        isRead: false
      });
      await Notification.create({
        recipientId: userB._id,
        type: "NEW_APPLICATION",
        title: "B1",
        message: "Message",
        relatedEntityId: dummyId,
        isRead: false
      });

      const res = await fetch(`${baseUrl}/api/notifications/read-all`, {
        method: "PATCH",
        headers: getJsonHeaders(userACookie)
      });
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.modifiedCount, 2);

      const unreadCountA = await Notification.countDocuments({ recipientId: userA._id, isRead: false });
      assert.equal(unreadCountA, 0);

      // Verify user B's notifications remain unaffected
      const unreadCountB = await Notification.countDocuments({ recipientId: userB._id, isRead: false });
      assert.equal(unreadCountB, 1);
    });
  });

  describe("DELETE /api/notifications/:id", () => {
    it("should delete a notification belonging to the authenticated user", async () => {
      const dummyId = new mongoose.Types.ObjectId();
      const notif = await Notification.create({
        recipientId: userA._id,
        type: "APPLICATION_REVIEWED",
        title: "Delete Me",
        message: "Testing delete",
        relatedEntityId: dummyId
      });

      const res = await fetch(`${baseUrl}/api/notifications/${notif._id}`, {
        method: "DELETE",
        headers: getJsonHeaders(userACookie)
      });
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.success, true);

      const check = await Notification.findById(notif._id);
      assert.equal(check, null);
    });

    it("should return 404 for non-existent notification ID", async () => {
      const randomId = new mongoose.Types.ObjectId();
      const res = await fetch(`${baseUrl}/api/notifications/${randomId}`, {
        method: "DELETE",
        headers: getJsonHeaders(userACookie)
      });
      assert.equal(res.status, 404);
    });

    it("should prevent deleting another user's notification with 403 Forbidden", async () => {
      const dummyId = new mongoose.Types.ObjectId();
      const notifB = await Notification.create({
        recipientId: userB._id,
        type: "NEW_APPLICATION",
        title: "Bob's notification to delete",
        message: "Private",
        relatedEntityId: dummyId
      });

      const res = await fetch(`${baseUrl}/api/notifications/${notifB._id}`, {
        method: "DELETE",
        headers: getJsonHeaders(userACookie)
      });
      assert.equal(res.status, 403);

      const check = await Notification.findById(notifB._id);
      assert.ok(check);
    });
  });

  describe("Notification Preferences APIs", () => {
    it("should fetch default preferences for authenticated user", async () => {
      const res = await fetch(`${baseUrl}/api/notifications/preferences`, {
        method: "GET",
        headers: getJsonHeaders(userACookie)
      });
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.preferences.emailNotificationsEnabled, true);
      assert.equal(data.data.preferences.applicationStatusEmails, true);
      assert.equal(data.data.preferences.recruiterNewApplicationEmails, true);
    });

    it("should update notification preferences successfully", async () => {
      const res = await fetch(`${baseUrl}/api/notifications/preferences`, {
        method: "PATCH",
        headers: getJsonHeaders(userACookie),
        body: JSON.stringify({
          emailNotificationsEnabled: false,
          applicationStatusEmails: false
        })
      });
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.preferences.emailNotificationsEnabled, false);
      assert.equal(data.data.preferences.applicationStatusEmails, false);
      assert.equal(data.data.preferences.recruiterNewApplicationEmails, true);

      // Verify isolation: User B's preferences should remain unmodified
      const userBFromDb = await User.findById(userB._id);
      assert.equal(userBFromDb.notificationPreferences.emailNotificationsEnabled, true);
    });

    it("should reject non-boolean preference values with 400 Bad Request", async () => {
      const res = await fetch(`${baseUrl}/api/notifications/preferences`, {
        method: "PATCH",
        headers: getJsonHeaders(userACookie),
        body: JSON.stringify({
          emailNotificationsEnabled: "not_a_boolean"
        })
      });
      const data = await res.json();

      assert.equal(res.status, 400);
      assert.equal(data.success, false);
    });

    it("should reject payload with no valid preference fields with 400 Bad Request", async () => {
      const res = await fetch(`${baseUrl}/api/notifications/preferences`, {
        method: "PATCH",
        headers: getJsonHeaders(userACookie),
        body: JSON.stringify({
          unsupportedField: true
        })
      });
      const data = await res.json();

      assert.equal(res.status, 400);
      assert.equal(data.success, false);
    });
  });
});

