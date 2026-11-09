const express = require("express");
const {
  getMyApplications,
  getApplicationById,
  downloadResume,
  updateApplicationStatus
} = require("../controllers/application.controller");
const { requireAuth, authorizeRoles } = require("../middleware/auth.middleware");

const router = express.Router();

// Candidate: Personal application history
router.get("/my-applications", requireAuth, authorizeRoles("job_seeker"), getMyApplications);

// Secure Resume download (Candidate owner, job recruiter owner, or admin)
router.get("/:applicationId/resume", requireAuth, downloadResume);

// Recruiter / Admin: Update application status with audit trail
router.patch("/:applicationId/status", requireAuth, authorizeRoles("recruiter", "admin"), updateApplicationStatus);

// Application details (Candidate owner, job recruiter owner, or admin)
router.get("/:applicationId", requireAuth, getApplicationById);

module.exports = router;

