const mongoose = require("mongoose");
const { Notification, User } = require("../models");
const { getEffectivePreferences } = require("../services/notification.service");

/**
 * Retrieve paginated notifications for the authenticated user.
 * GET /api/notifications
 */
const getNotifications = async (req, res) => {
  try {
    const currentUserId = req.user._id || req.user.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = { recipientId: currentUserId };

    if (req.query.unreadOnly === "true") {
      filter.isRead = false;
    }

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      message: "Notifications retrieved successfully.",
      data: {
        notifications,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error("[Get Notifications Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while retrieving notifications."
    });
  }
};

/**
 * Retrieve unread notification count for the authenticated user.
 * GET /api/notifications/unread-count
 */
const getUnreadCount = async (req, res) => {
  try {
    const currentUserId = req.user._id || req.user.id;
    const unreadCount = await Notification.countDocuments({
      recipientId: currentUserId,
      isRead: false
    });

    return res.status(200).json({
      success: true,
      message: "Unread count retrieved successfully.",
      data: {
        unreadCount
      }
    });
  } catch (error) {
    console.error("[Get Unread Count Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while calculating unread notifications."
    });
  }
};

/**
 * Mark a single notification as read.
 * PATCH /api/notifications/:id/read
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = (req.user._id || req.user.id).toString();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID format."
      });
    }

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found."
      });
    }

    // Ownership verification
    if (notification.recipientId.toString() !== currentUserId) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You do not have permission to view or modify this notification."
      });
    }

    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await notification.save();
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read.",
      data: {
        notification
      }
    });
  } catch (error) {
    console.error("[Mark As Read Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while updating the notification."
    });
  }
};

/**
 * Mark all notifications for the authenticated user as read.
 * PATCH /api/notifications/read-all
 */
const markAllAsRead = async (req, res) => {
  try {
    const currentUserId = req.user._id || req.user.id;
    const now = new Date();

    const result = await Notification.updateMany(
      { recipientId: currentUserId, isRead: false },
      { $set: { isRead: true, readAt: now } }
    );

    return res.status(200).json({
      success: true,
      message: "All unread notifications marked as read.",
      data: {
        modifiedCount: result.modifiedCount
      }
    });
  } catch (error) {
    console.error("[Mark All As Read Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while marking notifications as read."
    });
  }
};

/**
 * Delete a notification belonging to the authenticated user.
 * DELETE /api/notifications/:id
 */
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = (req.user._id || req.user.id).toString();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID format."
      });
    }

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found."
      });
    }

    // Ownership verification
    if (notification.recipientId.toString() !== currentUserId) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You do not have permission to delete this notification."
      });
    }

    await Notification.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Notification deleted successfully."
    });
  } catch (error) {
    console.error("[Delete Notification Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while deleting the notification."
    });
  }
};

/**
 * Get notification preferences for the authenticated user.
 * GET /api/notifications/preferences
 */
const getPreferences = async (req, res) => {
  try {
    const currentUserId = req.user._id || req.user.id;
    const user = await User.findById(currentUserId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    const preferences = getEffectivePreferences(user);

    return res.status(200).json({
      success: true,
      message: "Notification preferences retrieved successfully.",
      data: {
        preferences
      }
    });
  } catch (error) {
    console.error("[Get Preferences Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while retrieving notification preferences."
    });
  }
};

/**
 * Update notification preferences for the authenticated user.
 * PATCH /api/notifications/preferences
 */
const updatePreferences = async (req, res) => {
  try {
    const currentUserId = req.user._id || req.user.id;
    const {
      emailNotificationsEnabled,
      applicationStatusEmails,
      recruiterNewApplicationEmails
    } = req.body;

    const allowedFields = [
      "emailNotificationsEnabled",
      "applicationStatusEmails",
      "recruiterNewApplicationEmails"
    ];

    // Ensure at least one valid field is passed
    const passedFields = Object.keys(req.body || {}).filter((k) => allowedFields.includes(k));
    if (passedFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one valid preference to update."
      });
    }

    // Validate that all passed values are booleans
    for (const field of passedFields) {
      if (typeof req.body[field] !== "boolean") {
        return res.status(400).json({
          success: false,
          message: `Field '${field}' must be a boolean value.`
        });
      }
    }

    const user = await User.findById(currentUserId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    const currentPreferences = getEffectivePreferences(user);

    if (emailNotificationsEnabled !== undefined) {
      currentPreferences.emailNotificationsEnabled = emailNotificationsEnabled;
    }
    if (applicationStatusEmails !== undefined) {
      currentPreferences.applicationStatusEmails = applicationStatusEmails;
    }
    if (recruiterNewApplicationEmails !== undefined) {
      currentPreferences.recruiterNewApplicationEmails = recruiterNewApplicationEmails;
    }

    user.notificationPreferences = currentPreferences;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Notification preferences updated successfully.",
      data: {
        preferences: currentPreferences
      }
    });
  } catch (error) {
    console.error("[Update Preferences Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while updating notification preferences."
    });
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getPreferences,
  updatePreferences
};

