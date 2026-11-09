const mongoose = require("mongoose");

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: {
        values: ["Pending", "Reviewed", "Shortlisted", "Rejected", "Accepted"],
        message: "Status must be 'Pending', 'Reviewed', 'Shortlisted', 'Rejected', or 'Accepted'"
      },
      required: [true, "Status is required"]
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference who changed the status is required"]
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    note: {
      type: String,
      trim: true,
      maxlength: [500, "Status note cannot exceed 500 characters"]
    }
  },
  { _id: false }
);

const applicationSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: [true, "Job reference is required"]
    },
    applicantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Applicant user reference is required"]
    },
    resumeUrl: {
      type: String,
      required: [true, "Resume URL is required"],
      trim: true
    },
    resumeOriginalName: {
      type: String,
      trim: true
    },
    resumeMimeType: {
      type: String,
      trim: true
    },
    resumeStorageKey: {
      type: String,
      trim: true
    },
    resumeSize: {
      type: Number
    },
    coverLetter: {
      type: String,
      trim: true,
      maxlength: [5000, "Cover letter cannot exceed 5000 characters"]
    },
    status: {
      type: String,
      enum: {
        values: ["Pending", "Reviewed", "Shortlisted", "Rejected", "Accepted"],
        message: "Status must be 'Pending', 'Reviewed', 'Shortlisted', 'Rejected', or 'Accepted'"
      },
      default: "Pending"
    },
    appliedAt: {
      type: Date,
      default: Date.now
    },
    statusHistory: {
      type: [statusHistorySchema],
      default: []
    }
  },
  {
    timestamps: true
  }
);

// Compound Unique Index: Prevents duplicate applications to the same job by the same user
applicationSchema.index({ jobId: 1, applicantId: 1 }, { unique: true });

// Query indexes for recruiter / applicant lookups & sorting
applicationSchema.index({ jobId: 1, status: 1 });
applicationSchema.index({ applicantId: 1, status: 1 });
applicationSchema.index({ applicantId: 1, appliedAt: -1 });
applicationSchema.index({ jobId: 1, appliedAt: -1 });
applicationSchema.index({ status: 1 });
applicationSchema.index({ appliedAt: -1 });

const Application = mongoose.model("Application", applicationSchema);

module.exports = Application;
