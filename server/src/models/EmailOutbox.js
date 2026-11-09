const mongoose = require("mongoose");
const { NOTIFICATION_TYPES } = require("./Notification");

const EMAIL_OUTBOX_STATUSES = ["Pending", "Processing", "Sent", "Failed"];

const emailOutboxSchema = new mongoose.Schema(
  {
    recipientEmail: {
      type: String,
      required: [true, "Recipient email is required"],
      trim: true,
      lowercase: true
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Recipient reference is required"]
    },
    template: {
      type: String,
      enum: {
        values: NOTIFICATION_TYPES,
        message: "Invalid email template type"
      },
      required: [true, "Email template is required"]
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, "Email payload is required"]
    },
    status: {
      type: String,
      enum: {
        values: EMAIL_OUTBOX_STATUSES,
        message: "Invalid email outbox status"
      },
      default: "Pending",
      required: true
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0
    },
    maxAttempts: {
      type: Number,
      default: 5,
      min: 1
    },
    nextAttemptAt: {
      type: Date,
      default: Date.now
    },
    lastError: {
      type: String,
      trim: true,
      default: null
    },
    sentAt: {
      type: Date,
      default: null
    },
    lockedAt: {
      type: Date,
      default: null
    },
    lockedBy: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Indexes for high-throughput polling, concurrency locking, and stale job recovery
emailOutboxSchema.index({ status: 1, nextAttemptAt: 1 });
emailOutboxSchema.index({ recipientId: 1, createdAt: -1 });
emailOutboxSchema.index({ status: 1, lockedAt: 1 });

const EmailOutbox = mongoose.model("EmailOutbox", emailOutboxSchema);

module.exports = {
  EmailOutbox,
  EMAIL_OUTBOX_STATUSES
};

