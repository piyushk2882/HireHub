const mongoose = require("mongoose");
const path = require("path");
const { Application, Job } = require("../models");
const { storageService } = require("../services/storage.service");
const notificationService = require("../services/notification.service");

const VALID_STATUSES = ["Pending", "Reviewed", "Shortlisted", "Rejected", "Accepted"];

/**
 * Status transition matrix defining permitted status changes for recruiters.
 * Admins may override transitions.
 */
const STATUS_TRANSITIONS = {
  Pending: ["Reviewed", "Shortlisted", "Rejected"],
  Reviewed: ["Shortlisted", "Rejected", "Accepted"],
  Shortlisted: ["Accepted", "Rejected"],
  Accepted: [], // Terminal
  Rejected: [] // Terminal
};

/**
 * Hook for Phase 5B / 6A Candidate Notifications.
 * Integrates email and in-app notifications asynchronously without blocking controller flow.
 */
const emitStatusChangeNotification = (application, oldStatus, newStatus, changedBy) => {
  if (oldStatus === newStatus) return;
  notificationService
    .notifyApplicationStatusChanged({
      application,
      oldStatus,
      newStatus,
      changedBy
    })
    .catch((err) => {
      console.error("[Notification Hook Error]:", err.message);
    });
};

/**
 * Submit candidate job application.
 * POST /api/jobs/:jobId/applications
 * Authorization: Authenticated job_seeker only
 */
const submitApplication = async (req, res) => {
  let savedFileKey = null;

  try {
    const { jobId } = req.params;
    const { coverLetter } = req.body || {};

    // 1. Validate Job ID format
    if (!mongoose.isValidObjectId(jobId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid job ID format."
      });
    }

    // 2. Fetch Job and verify existence
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job posting not found."
      });
    }

    // 3. Verify Job is in Active status
    if (job.status !== "Active") {
      return res.status(400).json({
        success: false,
        message: "Cannot apply to an inactive, draft, or closed job posting."
      });
    }

    // 4. Prevent applying to own job posting
    const currentUserId = req.user._id || req.user.id;
    if (job.recruiterId.toString() === currentUserId.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot apply to your own job posting."
      });
    }

    // 5. Prevent duplicate applications
    const existingApplication = await Application.findOne({
      jobId: job._id,
      applicantId: currentUserId
    });
    if (existingApplication) {
      return res.status(409).json({
        success: false,
        message: "You have already submitted an application for this job."
      });
    }

    // 6. Validate Resume file
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: "Resume file is required. Please upload a PDF, DOC, or DOCX document."
      });
    }

    // 7. Validate Cover Letter length if provided
    if (coverLetter && typeof coverLetter === "string" && coverLetter.trim().length > 5000) {
      return res.status(400).json({
        success: false,
        message: "Cover letter cannot exceed 5000 characters."
      });
    }

    // 8. Save file to storage abstraction
    const saved = await storageService.saveFile({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype
    });
    savedFileKey = saved.storageKey;

    // 9. Create Application record in MongoDB
    const application = new Application({
      jobId: job._id,
      applicantId: currentUserId,
      resumeUrl: `/api/applications/placeholder/resume`,
      resumeStorageKey: saved.storageKey,
      resumeOriginalName: saved.originalName,
      resumeMimeType: saved.mimeType,
      resumeSize: saved.size,
      coverLetter: coverLetter ? coverLetter.trim() : undefined,
      status: "Pending",
      appliedAt: new Date(),
      statusHistory: [
        {
          status: "Pending",
          changedBy: currentUserId,
          changedAt: new Date(),
          note: "Application submitted by candidate"
        }
      ]
    });

    application.resumeUrl = `/api/applications/${application._id}/resume`;
    await application.save();

    // Trigger recruiter notification asynchronously
    notificationService
      .notifyNewApplication({
        application,
        job,
        applicantId: currentUserId
      })
      .catch((err) => {
        console.error("[Submit Application Notification Error]:", err.message);
      });

    // Prepare safe response (exclude internal storage key)
    const safeApplication = application.toObject();
    delete safeApplication.resumeStorageKey;

    return res.status(201).json({
      success: true,
      message: "Application submitted successfully.",
      data: {
        application: safeApplication
      }
    });
  } catch (error) {
    // Clean up uploaded file if creation fails
    if (savedFileKey) {
      await storageService.deleteFile(savedFileKey);
    }

    // Gracefully handle MongoDB compound unique index violation (race condition)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You have already submitted an application for this job."
      });
    }

    console.error("[Submit Application Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while submitting your application."
    });
  }
};

/**
 * Retrieve candidate's personal application history.
 * GET /api/applications/my-applications
 * Authorization: Authenticated job_seeker only
 */
const getMyApplications = async (req, res) => {
  try {
    const currentUserId = req.user._id || req.user.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = { applicantId: currentUserId };

    // Filter by status if provided
    if (req.query.status && typeof req.query.status === "string" && req.query.status.trim() !== "All") {
      const sanitizedStatus = req.query.status.trim();
      if (VALID_STATUSES.includes(sanitizedStatus)) {
        filter.status = sanitizedStatus;
      }
    }

    // Sorting
    const sortOption = req.query.sort === "oldest" ? { appliedAt: 1 } : { appliedAt: -1 };

    const [applications, total] = await Promise.all([
      Application.find(filter)
        .select("-resumeStorageKey -__v")
        .populate({
          path: "jobId",
          select: "title location employmentType experienceLevel salaryMin salaryMax category status companyId",
          populate: {
            path: "companyId",
            select: "companyName logo location website industry"
          }
        })
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .lean(),
      Application.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / limit) || 0;

    return res.status(200).json({
      success: true,
      message: "Applications retrieved successfully.",
      data: {
        applications,
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
    console.error("[Get My Applications Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while retrieving your applications."
    });
  }
};

/**
 * Retrieve applicants for a specific job.
 * GET /api/jobs/:jobId/applications
 * Authorization: Recruiter who owns the job, or admin
 */
const getJobApplications = async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!mongoose.isValidObjectId(jobId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid job ID format."
      });
    }

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job posting not found."
      });
    }

    // Verify ownership for recruiters (Admin can access all jobs)
    const currentUserId = (req.user._id || req.user.id).toString();
    if (req.user.role === "recruiter" && job.recruiterId.toString() !== currentUserId) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only view applications for your own job postings."
      });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = { jobId: job._id };

    if (req.query.status && typeof req.query.status === "string" && req.query.status.trim() !== "All") {
      const sanitizedStatus = req.query.status.trim();
      if (VALID_STATUSES.includes(sanitizedStatus)) {
        filter.status = sanitizedStatus;
      }
    }

    const sortOption = req.query.sort === "oldest" ? { appliedAt: 1 } : { appliedAt: -1 };

    const [applications, total] = await Promise.all([
      Application.find(filter)
        .select("-resumeStorageKey -__v")
        .populate({
          path: "applicantId",
          select: "name email phone profileImage"
        })
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .lean(),
      Application.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / limit) || 0;

    return res.status(200).json({
      success: true,
      message: "Job applications retrieved successfully.",
      data: {
        job: {
          _id: job._id,
          title: job.title,
          status: job.status
        },
        applications,
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
    console.error("[Get Job Applications Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while retrieving job applicants."
    });
  }
};

/**
 * Retrieve individual application details.
 * GET /api/applications/:applicationId
 * Authorization: Candidate owner, job recruiter owner, or admin
 */
const getApplicationById = async (req, res) => {
  try {
    const { applicationId } = req.params;

    if (!mongoose.isValidObjectId(applicationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid application ID format."
      });
    }

    const application = await Application.findById(applicationId)
      .populate({
        path: "jobId",
        select: "title location employmentType experienceLevel salaryMin salaryMax category status recruiterId companyId",
        populate: {
          path: "companyId",
          select: "companyName logo location website industry"
        }
      })
      .populate({
        path: "applicantId",
        select: "name email phone profileImage"
      })
      .populate({
        path: "statusHistory.changedBy",
        select: "name email role"
      });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found."
      });
    }

    const currentUserId = (req.user._id || req.user.id).toString();

    // Candidate ownership check
    if (req.user.role === "job_seeker") {
      const applicantId = (application.applicantId?._id || application.applicantId).toString();
      if (applicantId !== currentUserId) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only view your own applications."
        });
      }
    }

    // Recruiter ownership check
    if (req.user.role === "recruiter") {
      const recruiterId = application.jobId?.recruiterId?.toString();
      if (recruiterId !== currentUserId) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only view applications for your own job postings."
        });
      }
    }

    const safeApplication = application.toObject();
    delete safeApplication.resumeStorageKey;
    delete safeApplication.__v;

    return res.status(200).json({
      success: true,
      message: "Application retrieved successfully.",
      data: {
        application: safeApplication
      }
    });
  } catch (error) {
    console.error("[Get Application By ID Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while retrieving application details."
    });
  }
};

/**
 * Securely stream and download resume file.
 * GET /api/applications/:applicationId/resume
 * Authorization: Candidate owner, job recruiter owner, or admin
 */
const downloadResume = async (req, res) => {
  try {
    const { applicationId } = req.params;

    if (!mongoose.isValidObjectId(applicationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid application ID format."
      });
    }

    const application = await Application.findById(applicationId).populate("jobId", "recruiterId");
    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found."
      });
    }

    const currentUserId = (req.user._id || req.user.id).toString();

    // Candidate ownership check
    if (req.user.role === "job_seeker") {
      if (application.applicantId.toString() !== currentUserId) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only download your own resume."
        });
      }
    }

    // Recruiter ownership check
    if (req.user.role === "recruiter") {
      const recruiterId = application.jobId?.recruiterId?.toString();
      if (recruiterId !== currentUserId) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only download resumes for your own job postings."
        });
      }
    }

    if (!application.resumeStorageKey) {
      return res.status(404).json({
        success: false,
        message: "Resume file reference is missing from application."
      });
    }

    const exists = await storageService.fileExists(application.resumeStorageKey);
    if (!exists) {
      return res.status(404).json({
        success: false,
        message: "Resume file not found or has been removed."
      });
    }

    const sanitizedFilename = (application.resumeOriginalName || "resume.pdf")
      .replace(/[^\w.-]/g, "_");

    const mimeType = application.resumeMimeType || "application/octet-stream";

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${sanitizedFilename}"`);
    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const stream = storageService.getFileStream(application.resumeStorageKey);
    return stream.pipe(res);
  } catch (error) {
    console.error("[Download Resume Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while downloading the resume."
    });
  }
};

/**
 * Update application status with audit history.
 * PATCH /api/applications/:applicationId/status
 * Authorization: Job recruiter owner, or admin
 */
const updateApplicationStatus = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { status: newStatus, note } = req.body;

    if (!mongoose.isValidObjectId(applicationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid application ID format."
      });
    }

    if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Permitted values: ${VALID_STATUSES.join(", ")}.`
      });
    }

    const application = await Application.findById(applicationId).populate("jobId", "recruiterId");
    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found."
      });
    }

    const currentUserId = (req.user._id || req.user.id).toString();

    // Recruiter ownership check
    if (req.user.role === "recruiter") {
      const recruiterId = application.jobId?.recruiterId?.toString();
      if (recruiterId !== currentUserId) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only update applications for your own job postings."
        });
      }
    }

    const previousStatus = application.status;

    // Avoid duplicate history entries if status is not actually changing
    if (previousStatus === newStatus) {
      const safeApplication = application.toObject();
      delete safeApplication.resumeStorageKey;
      return res.status(200).json({
        success: true,
        message: `Application is already in '${newStatus}' status.`,
        data: {
          application: safeApplication
        }
      });
    }

    // Enforce status transition policy (admins can override)
    if (req.user.role !== "admin") {
      const allowedNextStatuses = STATUS_TRANSITIONS[previousStatus] || [];
      if (!allowedNextStatuses.includes(newStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status transition from '${previousStatus}' to '${newStatus}'.`
        });
      }
    }

    // Record status transition in audit history
    application.status = newStatus;
    application.statusHistory.push({
      status: newStatus,
      changedBy: currentUserId,
      changedAt: new Date(),
      note: note && typeof note === "string" ? note.trim().slice(0, 500) : undefined
    });

    await application.save();

    // Trigger Phase 5B notification preparation hook
    emitStatusChangeNotification(application, previousStatus, newStatus, currentUserId);

    const safeApplication = application.toObject();
    delete safeApplication.resumeStorageKey;

    return res.status(200).json({
      success: true,
      message: `Application status updated to '${newStatus}' successfully.`,
      data: {
        application: safeApplication
      }
    });
  } catch (error) {
    console.error("[Update Application Status Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while updating application status."
    });
  }
};

module.exports = {
  submitApplication,
  getMyApplications,
  getJobApplications,
  getApplicationById,
  downloadResume,
  updateApplicationStatus,
  emitStatusChangeNotification,
  VALID_STATUSES,
  STATUS_TRANSITIONS
};
