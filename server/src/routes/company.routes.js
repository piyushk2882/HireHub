const express = require("express");
const {
  createCompany,
  getCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany
} = require("../controllers/company.controller");
const { requireAuth, authorizeRoles } = require("../middleware/auth.middleware");

const router = express.Router();

// Public routes
router.get("/", getCompanies);
router.get("/:id", getCompanyById);

// Protected routes (recruiter & admin)
router.post("/", requireAuth, authorizeRoles("recruiter", "admin"), createCompany);
router.put("/:id", requireAuth, authorizeRoles("recruiter", "admin"), updateCompany);

// Admin-only route
router.delete("/:id", requireAuth, authorizeRoles("admin"), deleteCompany);

module.exports = router;

