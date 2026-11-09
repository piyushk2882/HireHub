const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/**
 * Basic RFC 5322 compliant email validation regex.
 */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters long"],
      maxlength: [100, "Name cannot exceed 100 characters"]
    },
    email: {
      type: String,
      required: [true, "Email address is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [emailRegex, "Please provide a valid email address"]
    },
    passwordHash: {
      type: String,
      required: [true, "Password hash is required"]
    },
    role: {
      type: String,
      enum: {
        values: ["job_seeker", "recruiter", "admin"],
        message: "Role must be either 'job_seeker', 'recruiter', or 'admin'"
      },
      default: "job_seeker"
    },
    phone: {
      type: String,
      trim: true
    },
    profileImage: {
      type: String,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    notificationPreferences: {
      emailNotificationsEnabled: {
        type: Boolean,
        default: true
      },
      applicationStatusEmails: {
        type: Boolean,
        default: true
      },
      recruiterNewApplicationEmails: {
        type: Boolean,
        default: true
      }
    }
  },
  {
    timestamps: true
  }
);

// Pre-save hook to ensure email normalization
userSchema.pre("save", function () {
  if (this.email) {
    this.email = this.email.trim().toLowerCase();
  }
});

// Index on role for filtering users by role
userSchema.index({ role: 1 });

/**
 * Compares candidate password against stored bcrypt passwordHash.
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.passwordHash || !candidatePassword) return false;
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

/**
 * Returns user representation without sensitive fields such as passwordHash.
 * @returns {object} Safe user object
 */
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject ? this.toObject() : { ...this };
  delete obj.passwordHash;
  delete obj.__v;
  obj.id = this._id.toString();
  return obj;
};

const User = mongoose.model("User", userSchema);

module.exports = User;

