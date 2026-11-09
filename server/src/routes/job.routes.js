const express = require("express");
const {
  createJob,
  getJobs,
  getMyJobs,
  getJobById,
  updateJob,
  updateJobStatus,
  deleteJob
} = require("../controllers/job.controller");
const {
  submitApplication,
  getJobApplications
} = require("../controllers/application.controller");
const { requireAuth, authorizeRoles } = require("../middleware/auth.middleware");
const { uploadResume } = require("../middleware/upload.middleware");

const router = express.Router();

// Public Job Search & Browsing
router.get("/", getJobs);

// Recruiter / Admin Protected routes - MUST be defined before /:id to prevent route clash
router.get("/my-jobs", requireAuth, authorizeRoles("recruiter", "admin"), getMyJobs);
router.post("/", requireAuth, authorizeRoles("recruiter", "admin"), createJob);

// Candidate Application submission for a specific job
router.post("/:jobId/applications", requireAuth, authorizeRoles("job_seeker"), uploadResume, submitApplication);

// Recruiter / Admin: View all applicants for a specific job
router.get("/:jobId/applications", requireAuth, authorizeRoles("recruiter", "admin"), getJobApplications);

// Single Job routes
router.get("/:id", getJobById);
router.put("/:id", requireAuth, authorizeRoles("recruiter", "admin"), updateJob);
router.patch("/:id/status", requireAuth, authorizeRoles("recruiter", "admin"), updateJobStatus);
router.delete("/:id", requireAuth, authorizeRoles("recruiter", "admin"), deleteJob);

module.exports = router;
