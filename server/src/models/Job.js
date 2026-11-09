const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Job title is required"],
      trim: true,
      maxlength: [150, "Job title cannot exceed 150 characters"]
    },
    description: {
      type: String,
      required: [true, "Job description is required"],
      trim: true
    },
    requirements: {
      type: [String],
      default: []
    },
    responsibilities: {
      type: [String],
      default: []
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company reference is required"]
    },
    recruiterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Recruiter reference is required"]
    },
    location: {
      type: String,
      required: [true, "Job location is required"],
      trim: true
    },
    employmentType: {
      type: String,
      enum: {
        values: ["Full Time", "Part Time", "Contract", "Remote", "Hybrid", "Internship"],
        message: "Invalid employment type"
      },
      default: "Full Time"
    },
    experienceLevel: {
      type: String,
      enum: {
        values: ["Entry", "Mid", "Senior", "Lead", "Executive"],
        message: "Invalid experience level"
      }
    },
    salaryMin: {
      type: Number,
      min: [0, "Minimum salary cannot be negative"]
    },
    salaryMax: {
      type: Number,
      min: [0, "Maximum salary cannot be negative"]
    },
    category: {
      type: String,
      required: [true, "Job category is required"],
      enum: {
        values: ["Development", "Design", "Marketing", "Data Science", "Business", "Other"],
        message: "Invalid job category"
      },
      trim: true
    },
    skills: {
      type: [String],
      default: []
    },
    applicationDeadline: {
      type: Date
    },
    status: {
      type: String,
      enum: {
        values: ["Active", "Closed", "Draft", "Archived"],
        message: "Status must be 'Active', 'Closed', 'Draft', or 'Archived'"
      },
      default: "Active"
    }
  },
  {
    timestamps: true
  }
);

// Indexes on commonly searched & filtered fields
jobSchema.index({ title: "text", skills: "text" }); // Text search index for title & skills
jobSchema.index({ category: 1, status: 1 });
jobSchema.index({ location: 1, status: 1 });
jobSchema.index({ companyId: 1 });
jobSchema.index({ recruiterId: 1, createdAt: -1 });
jobSchema.index({ status: 1, createdAt: -1 });

const Job = mongoose.model("Job", jobSchema);

module.exports = Job;

