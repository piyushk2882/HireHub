const mongoose = require("mongoose");

const companySchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: [true, "Company name is required"],
      trim: true,
      maxlength: [150, "Company name cannot exceed 150 characters"]
    },
    description: {
      type: String,
      trim: true,
      maxlength: [3000, "Company description cannot exceed 3000 characters"]
    },
    website: {
      type: String,
      trim: true
    },
    industry: {
      type: String,
      trim: true,
      maxlength: [100, "Industry cannot exceed 100 characters"]
    },
    location: {
      type: String,
      trim: true,
      maxlength: [150, "Location cannot exceed 150 characters"]
    },
    logo: {
      type: String,
      trim: true
    },
    recruiterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Recruiter ID reference is required"]
    }
  },
  {
    timestamps: true
  }
);

// Indexes on commonly queried fields
companySchema.index({ companyName: 1 });
companySchema.index({ recruiterId: 1 });
companySchema.index({ industry: 1 });

const Company = mongoose.model("Company", companySchema);

module.exports = Company;

