const mongoose = require("mongoose");
const { Company, Job } = require("../models");

/**
 * Create a new company profile.
 * POST /api/companies
 * Authentication: Required (recruiter or admin)
 */
const createCompany = async (req, res) => {
  try {
    const { companyName, description, website, industry, location, logo } = req.body;

    // Validate required company name
    if (!companyName || !companyName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Company name is required."
      });
    }

    if (companyName.trim().length > 150) {
      return res.status(400).json({
        success: false,
        message: "Company name cannot exceed 150 characters."
      });
    }

    // Set recruiterId strictly from the authenticated user - never accept from body
    const recruiterId = req.user._id || req.user.id;

    // Business Rule: Standard recruiters are restricted to one company profile
    if (req.user.role === "recruiter") {
      const existingCompany = await Company.findOne({ recruiterId });
      if (existingCompany) {
        return res.status(409).json({
          success: false,
          message: "You have already created a company profile. Each recruiter may manage only one company."
        });
      }
    }

    const newCompany = await Company.create({
      companyName: companyName.trim(),
      description: description ? description.trim() : undefined,
      website: website ? website.trim() : undefined,
      industry: industry ? industry.trim() : undefined,
      location: location ? location.trim() : undefined,
      logo: logo ? logo.trim() : undefined,
      recruiterId
    });

    return res.status(201).json({
      success: true,
      message: "Company profile created successfully.",
      data: {
        company: newCompany
      }
    });
  } catch (error) {
    console.error("[Create Company Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while creating the company profile."
    });
  }
};

/**
 * Retrieve a paginated list of companies with optional search & filters.
 * GET /api/companies
 * Public endpoint
 */
const getCompanies = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = {};

    // Search by companyName (case-insensitive substring)
    if (req.query.search && typeof req.query.search === "string") {
      const sanitized = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.companyName = { $regex: sanitized, $options: "i" };
    } else if (req.query.companyName && typeof req.query.companyName === "string") {
      const sanitized = req.query.companyName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.companyName = { $regex: sanitized, $options: "i" };
    }

    // Filter by industry
    if (req.query.industry && typeof req.query.industry === "string") {
      const sanitized = req.query.industry.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.industry = { $regex: `^${sanitized}$`, $options: "i" };
    }

    // Filter by location
    if (req.query.location && typeof req.query.location === "string") {
      const sanitized = req.query.location.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.location = { $regex: sanitized, $options: "i" };
    }

    // Filter by recruiterId
    if (req.query.recruiterId && mongoose.isValidObjectId(req.query.recruiterId)) {
      filter.recruiterId = new mongoose.Types.ObjectId(req.query.recruiterId);
    }

    const [companies, total] = await Promise.all([
      Company.find(filter)
        .select("-__v")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Company.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / limit) || 0;

    return res.status(200).json({
      success: true,
      message: "Companies retrieved successfully.",
      data: {
        companies,
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
    console.error("[Get Companies Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while retrieving companies."
    });
  }
};

/**
 * Retrieve single company details by ID.
 * GET /api/companies/:id
 * Public endpoint
 */
const getCompanyById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid company ID format."
      });
    }

    const company = await Company.findById(id).select("-__v").lean();

    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Company retrieved successfully.",
      data: {
        company
      }
    });
  } catch (error) {
    console.error("[Get Company By ID Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while retrieving company details."
    });
  }
};

/**
 * Update an existing company profile.
 * PUT /api/companies/:id
 * Authentication: Required (recruiter owner or admin)
 */
const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid company ID format."
      });
    }

    const company = await Company.findById(id);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found."
      });
    }

    // Authorization: Recruiter may only update their own company profile; Admin may update any
    const currentUserId = (req.user._id || req.user.id).toString();
    if (req.user.role === "recruiter" && company.recruiterId.toString() !== currentUserId) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only update your own company profile."
      });
    }

    // Allowlisted fields to prevent mass assignment
    const { companyName, description, website, industry, location, logo } = req.body;

    if (companyName !== undefined) {
      if (!companyName || !companyName.trim()) {
        return res.status(400).json({
          success: false,
          message: "Company name cannot be empty."
        });
      }
      company.companyName = companyName.trim();
    }

    if (description !== undefined) company.description = description ? description.trim() : "";
    if (website !== undefined) company.website = website ? website.trim() : "";
    if (industry !== undefined) company.industry = industry ? industry.trim() : "";
    if (location !== undefined) company.location = location ? location.trim() : "";
    if (logo !== undefined) company.logo = logo ? logo.trim() : "";

    // Note: recruiterId is intentionally NOT updated to prevent ownership hijacking
    await company.save();

    return res.status(200).json({
      success: true,
      message: "Company profile updated successfully.",
      data: {
        company
      }
    });
  } catch (error) {
    console.error("[Update Company Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while updating the company profile."
    });
  }
};

/**
 * Delete a company profile.
 * DELETE /api/companies/:id
 * Authentication: Required (Admin only)
 */
const deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid company ID format."
      });
    }

    const company = await Company.findById(id);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found."
      });
    }

    // Prevent deletion if jobs are currently associated with the company
    const associatedJobsCount = await Job.countDocuments({ companyId: company._id });
    if (associatedJobsCount > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete company with ${associatedJobsCount} associated job posting(s). Please remove or archive associated jobs first.`
      });
    }

    await Company.findByIdAndDelete(company._id);

    return res.status(200).json({
      success: true,
      message: "Company profile deleted successfully."
    });
  } catch (error) {
    console.error("[Delete Company Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while deleting the company profile."
    });
  }
};

module.exports = {
  createCompany,
  getCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany
};
