const mongoose = require("mongoose");

const NOTIFICATION_TYPES = [
  "NEW_APPLICATION",
  "APPLICATION_REVIEWED",
  "APPLICATION_SHORTLISTED",
  "APPLICATION_REJECTED",
  "APPLICATION_ACCEPTED"
];

const notificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Recipient reference is required"]
    },
    type: {
      type: String,
      enum: {
        values: NOTIFICATION_TYPES,
        message: "Invalid notification type"
      },
      required: [true, "Notification type is required"]
    },
    title: {
      type: String,
      required: [true, "Notification title is required"],
      trim: true,
      maxlength: [150, "Title cannot exceed 150 characters"]
    },
    message: {
      type: String,
      required: [true, "Notification message is required"],
      trim: true,
      maxlength: [1000, "Message cannot exceed 1000 characters"]
    },
    relatedEntityType: {
      type: String,
      enum: ["Application", "Job"],
      default: "Application"
    },
    relatedEntityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "Related entity ID is required"]
    },
    relatedJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      default: null
    },
    isRead: {
      type: Boolean,
      default: false
    },
    readAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Query indexes for fast user notification retrieval, filtering, and sorting
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, isRead: 1 });
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);

module.exports = {
  Notification,
  NOTIFICATION_TYPES
};

