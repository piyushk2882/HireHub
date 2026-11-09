const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getPreferences,
  updatePreferences
} = require("../controllers/notification.controller");

const router = express.Router();

// Enforce authentication across all notification endpoints
router.use(requireAuth);

// Static routes
router.get("/", getNotifications);
router.get("/unread-count", getUnreadCount);
router.get("/preferences", getPreferences);
router.patch("/preferences", updatePreferences);
router.patch("/read-all", markAllAsRead);

// Parameterized routes
router.patch("/:id/read", markAsRead);
router.delete("/:id", deleteNotification);

module.exports = router;

