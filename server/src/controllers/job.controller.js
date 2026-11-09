const mongoose = require("mongoose");
const { Job, Company, Application } = require("../models");

const VALID_CATEGORIES = ["Development", "Design", "Marketing", "Data Science", "Business", "Other"];
const VALID_EMPLOYMENT_TYPES = ["Full Time", "Part Time", "Contract", "Remote", "Hybrid", "Internship"];
const VALID_EXPERIENCE_LEVELS = ["Entry", "Mid", "Senior", "Lead", "Executive"];
const VALID_STATUSES = ["Active", "Closed", "Draft", "Archived"];

/**
 * Create a new job posting.
 * POST /api/jobs
 * Authentication: Required (recruiter or admin)
 */
const createJob = async (req, res) => {
  try {
    const {
      title,
      description,
      requirements,
      responsibilities,
      companyId,
      location,
      employmentType,
      experienceLevel,
      salaryMin,
      salaryMax,
      category,
      skills,
      applicationDeadline,
      status
    } = req.body;

    // Validate required fields
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: "Job title is required." });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ success: false, message: "Job description is required." });
    }
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Company ID is required." });
    }
    if (!location || !location.trim()) {
      return res.status(400).json({ success: false, message: "Job location is required." });
    }
    if (!category || !category.trim()) {
      return res.status(400).json({ success: false, message: "Job category is required." });
    }

    if (!mongoose.isValidObjectId(companyId)) {
      return res.status(400).json({ success: false, message: "Invalid company ID format." });
    }

    // Verify company existence
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: "Target company does not exist." });
    }

    // Recruiter authorization: Recruiters may only post jobs for their own company
    if (req.user.role === "recruiter" && company.recruiterId.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only create job postings for your own company."
      });
    }

    // Validate category enum
    if (!VALID_CATEGORIES.includes(category.trim())) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}.`
      });
    }

    // Validate employmentType if provided
    if (employmentType && !VALID_EMPLOYMENT_TYPES.includes(employmentType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid employment type. Must be one of: ${VALID_EMPLOYMENT_TYPES.join(", ")}.`
      });
    }

    // Validate experienceLevel if provided
    if (experienceLevel && !VALID_EXPERIENCE_LEVELS.includes(experienceLevel)) {
      return res.status(400).json({
        success: false,
        message: `Invalid experience level. Must be one of: ${VALID_EXPERIENCE_LEVELS.join(", ")}.`
      });
    }

    // Validate salary bounds
    const minSal = salaryMin !== undefined && salaryMin !== null ? Number(salaryMin) : undefined;
    const maxSal = salaryMax !== undefined && salaryMax !== null ? Number(salaryMax) : undefined;

    if (minSal !== undefined && (isNaN(minSal) || minSal < 0)) {
      return res.status(400).json({ success: false, message: "Minimum salary must be a non-negative number." });
    }
    if (maxSal !== undefined && (isNaN(maxSal) || maxSal < 0)) {
      return res.status(400).json({ success: false, message: "Maximum salary must be a non-negative number." });
    }
    if (minSal !== undefined && maxSal !== undefined && minSal > maxSal) {
      return res.status(400).json({
        success: false,
        message: "Minimum salary cannot be greater than maximum salary."
      });
    }

    // Validate status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid job status. Must be one of: ${VALID_STATUSES.join(", ")}.`
      });
    }

    // Validate deadline if provided
    let parsedDeadline;
    if (applicationDeadline) {
      parsedDeadline = new Date(applicationDeadline);
      if (isNaN(parsedDeadline.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid application deadline date format." });
      }
    }

    // Set recruiterId strictly from authenticated user (or company owner for admin)
    const recruiterId = req.user.role === "admin" ? company.recruiterId : req.user.id;

    const newJob = await Job.create({
      title: title.trim(),
      description: description.trim(),
      requirements: Array.isArray(requirements) ? requirements.map(r => String(r).trim()).filter(Boolean) : [],
      responsibilities: Array.isArray(responsibilities) ? responsibilities.map(r => String(r).trim()).filter(Boolean) : [],
      companyId: company._id,
      recruiterId,
      location: location.trim(),
      employmentType: employmentType || "Full Time",
      experienceLevel: experienceLevel || undefined,
      salaryMin: minSal,
      salaryMax: maxSal,
      category: category.trim(),
      skills: Array.isArray(skills) ? skills.map(s => String(s).trim()).filter(Boolean) : [],
      applicationDeadline: parsedDeadline,
      status: status || "Active"
    });

    const populatedJob = await Job.findById(newJob._id)
      .populate("companyId", "companyName logo location website industry")
      .lean();

    return res.status(201).json({
      success: true,
      message: "Job posting created successfully.",
      data: {
        job: populatedJob
      }
    });
  } catch (error) {
    console.error("[Create Job Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while creating the job posting."
    });
  }
};

/**
 * Retrieve public published jobs with search, filtering, sorting, and pagination.
 * GET /api/jobs
 * Public endpoint
 */
const getJobs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    // Publicly accessible listings are restricted to "Active" jobs
    const filter = { status: "Active" };

    // Search query: searches title, skills, and matching company names
    if (req.query.search && typeof req.query.search === "string" && req.query.search.trim()) {
      const sanitized = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = { $regex: sanitized, $options: "i" };

      // Find matching companies to include company name in search results
      const matchingCompanies = await Company.find({ companyName: searchRegex }).select("_id").lean();
      const matchingCompanyIds = matchingCompanies.map(c => c._id);

      filter.$or = [
        { title: searchRegex },
        { skills: searchRegex },
        { companyId: { $in: matchingCompanyIds } }
      ];
    }

    // Filter by location
    if (req.query.location && typeof req.query.location === "string" && req.query.location.trim()) {
      const sanitized = req.query.location.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.location = { $regex: sanitized, $options: "i" };
    }

    // Filter by category
    if (req.query.category && typeof req.query.category === "string" && req.query.category.trim()) {
      const cat = req.query.category.trim();
      if (VALID_CATEGORIES.includes(cat)) {
        filter.category = cat;
      }
    }

    // Filter by employmentType
    if (req.query.employmentType && typeof req.query.employmentType === "string" && req.query.employmentType.trim()) {
      const empType = req.query.employmentType.trim();
      if (VALID_EMPLOYMENT_TYPES.includes(empType)) {
        filter.employmentType = empType;
      }
    }

    // Filter by experienceLevel
    if (req.query.experienceLevel && typeof req.query.experienceLevel === "string" && req.query.experienceLevel.trim()) {
      const expLevel = req.query.experienceLevel.trim();
      if (VALID_EXPERIENCE_LEVELS.includes(expLevel)) {
        filter.experienceLevel = expLevel;
      }
    }

    // Filter by companyId
    if (req.query.companyId && mongoose.isValidObjectId(req.query.companyId)) {
      filter.companyId = new mongoose.Types.ObjectId(req.query.companyId);
    }

    // Salary range filtering
    const minSalary = Number(req.query.minSalary);
    if (!isNaN(minSalary) && minSalary >= 0) {
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [{ salaryMax: { $gte: minSalary } }, { salaryMin: { $gte: minSalary } }]
      });
    }

    const maxSalary = Number(req.query.maxSalary);
    if (!isNaN(maxSalary) && maxSalary >= 0) {
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [{ salaryMin: { $lte: maxSalary } }, { salaryMax: { $lte: maxSalary } }]
      });
    }

    // Sorting configuration
    let sortOption = { createdAt: -1 }; // default: newest
    if (req.query.sort === "oldest") {
      sortOption = { createdAt: 1 };
    } else if (req.query.sort === "salary_asc") {
      sortOption = { salaryMin: 1, salaryMax: 1 };
    } else if (req.query.sort === "salary_desc") {
      sortOption = { salaryMax: -1, salaryMin: -1 };
    }

    const [jobs, total] = await Promise.all([
      Job.find(filter)
        .populate("companyId", "companyName logo location website industry")
        .select("-__v")
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .lean(),
      Job.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / limit) || 0;

    return res.status(200).json({
      success: true,
      message: "Jobs retrieved successfully.",
      data: {
        jobs,
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
    console.error("[Get Jobs Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while retrieving job postings."
    });
  }
};

/**
 * Retrieve recruiter's own jobs (includes Draft, Closed, Active, Archived).
 * GET /api/jobs/my-jobs
 * Authentication: Required (recruiter or admin)
 */
const getMyJobs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = {};

    // Standard recruiters only see their own jobs
    if (req.user.role === "recruiter") {
      filter.recruiterId = req.user.id;
    } else if (req.user.role === "admin" && req.query.recruiterId) {
      if (mongoose.isValidObjectId(req.query.recruiterId)) {
        filter.recruiterId = req.query.recruiterId;
      }
    }

    // Optional status filtering
    if (req.query.status && VALID_STATUSES.includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const [jobs, total] = await Promise.all([
      Job.find(filter)
        .populate("companyId", "companyName logo location website industry")
        .select("-__v")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Job.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / limit) || 0;

    return res.status(200).json({
      success: true,
      message: "My jobs retrieved successfully.",
      data: {
        jobs,
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
    console.error("[Get My Jobs Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while retrieving your job postings."
    });
  }
};

/**
 * Retrieve single job details by ID.
 * GET /api/jobs/:id
 * Public endpoint (only published "Active" jobs, or owner/admin preview)
 */
const getJobById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid job ID format."
      });
    }

    const job = await Job.findById(id)
      .populate("companyId", "companyName logo location website industry")
      .select("-__v")
      .lean();

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job posting not found."
      });
    }

    // If job is not Active, only owner or admin can view it
    if (job.status !== "Active") {
      const isOwner = req.user && req.user.id.toString() === job.recruiterId.toString();
      const isAdmin = req.user && req.user.role === "admin";

      if (!isOwner && !isAdmin) {
        return res.status(404).json({
          success: false,
          message: "Job posting is not publicly available."
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Job details retrieved successfully.",
      data: {
        job
      }
    });
  } catch (error) {
    console.error("[Get Job By ID Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while retrieving the job details."
    });
  }
};

/**
 * Update an existing job posting.
 * PUT /api/jobs/:id
 * Authentication: Required (recruiter owner or admin)
 */
const updateJob = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid job ID format." });
    }

    const job = await Job.findById(id);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job posting not found." });
    }

    // Authorization check
    if (req.user.role === "recruiter" && job.recruiterId.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only update job postings you own."
      });
    }

    const {
      title,
      description,
      requirements,
      responsibilities,
      location,
      employmentType,
      experienceLevel,
      salaryMin,
      salaryMax,
      category,
      skills,
      applicationDeadline,
      status
    } = req.body;

    if (title !== undefined) {
      if (!title || !title.trim()) {
        return res.status(400).json({ success: false, message: "Job title cannot be empty." });
      }
      job.title = title.trim();
    }

    if (description !== undefined) {
      if (!description || !description.trim()) {
        return res.status(400).json({ success: false, message: "Job description cannot be empty." });
      }
      job.description = description.trim();
    }

    if (location !== undefined) {
      if (!location || !location.trim()) {
        return res.status(400).json({ success: false, message: "Job location cannot be empty." });
      }
      job.location = location.trim();
    }

    if (category !== undefined) {
      if (!VALID_CATEGORIES.includes(category.trim())) {
        return res.status(400).json({
          success: false,
          message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}.`
        });
      }
      job.category = category.trim();
    }

    if (employmentType !== undefined) {
      if (!VALID_EMPLOYMENT_TYPES.includes(employmentType)) {
        return res.status(400).json({
          success: false,
          message: `Invalid employment type. Must be one of: ${VALID_EMPLOYMENT_TYPES.join(", ")}.`
        });
      }
      job.employmentType = employmentType;
    }

    if (experienceLevel !== undefined) {
      if (experienceLevel && !VALID_EXPERIENCE_LEVELS.includes(experienceLevel)) {
        return res.status(400).json({
          success: false,
          message: `Invalid experience level. Must be one of: ${VALID_EXPERIENCE_LEVELS.join(", ")}.`
        });
      }
      job.experienceLevel = experienceLevel || undefined;
    }

    if (requirements !== undefined) {
      job.requirements = Array.isArray(requirements)
        ? requirements.map(r => String(r).trim()).filter(Boolean)
        : [];
    }

    if (responsibilities !== undefined) {
      job.responsibilities = Array.isArray(responsibilities)
        ? responsibilities.map(r => String(r).trim()).filter(Boolean)
        : [];
    }

    if (skills !== undefined) {
      job.skills = Array.isArray(skills)
        ? skills.map(s => String(s).trim()).filter(Boolean)
        : [];
    }

    // Salary validation
    const minSal = salaryMin !== undefined ? Number(salaryMin) : job.salaryMin;
    const maxSal = salaryMax !== undefined ? Number(salaryMax) : job.salaryMax;

    if (minSal !== undefined && minSal !== null && (isNaN(minSal) || minSal < 0)) {
      return res.status(400).json({ success: false, message: "Minimum salary must be non-negative." });
    }
    if (maxSal !== undefined && maxSal !== null && (isNaN(maxSal) || maxSal < 0)) {
      return res.status(400).json({ success: false, message: "Maximum salary must be non-negative." });
    }
    if (minSal !== undefined && maxSal !== undefined && minSal > maxSal) {
      return res.status(400).json({
        success: false,
        message: "Minimum salary cannot be greater than maximum salary."
      });
    }

    if (salaryMin !== undefined) job.salaryMin = minSal;
    if (salaryMax !== undefined) job.salaryMax = maxSal;

    if (applicationDeadline !== undefined) {
      if (applicationDeadline) {
        const parsed = new Date(applicationDeadline);
        if (isNaN(parsed.getTime())) {
          return res.status(400).json({ success: false, message: "Invalid application deadline date format." });
        }
        job.applicationDeadline = parsed;
      } else {
        job.applicationDeadline = undefined;
      }
    }

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}.`
        });
      }
      job.status = status;
    }

    // Ensure recruiterId and companyId cannot be hijacked
    await job.save();

    const updatedJob = await Job.findById(job._id)
      .populate("companyId", "companyName logo location website industry")
      .lean();

    return res.status(200).json({
      success: true,
      message: "Job posting updated successfully.",
      data: {
        job: updatedJob
      }
    });
  } catch (error) {
    console.error("[Update Job Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while updating the job posting."
    });
  }
};

/**
 * Update job status only.
 * PATCH /api/jobs/:id/status
 * Authentication: Required (recruiter owner or admin)
 */
const updateJobStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid job ID format." });
    }

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${VALID_STATUSES.join(", ")}.`
      });
    }

    const job = await Job.findById(id);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job posting not found." });
    }

    // Ownership check
    if (req.user.role === "recruiter" && job.recruiterId.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only update the status of your own job postings."
      });
    }

    job.status = status;
    await job.save();

    return res.status(200).json({
      success: true,
      message: "Job status updated successfully.",
      data: {
        job
      }
    });
  } catch (error) {
    console.error("[Update Job Status Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while updating the job status."
    });
  }
};

/**
 * Delete or safely archive a job posting.
 * If applications exist, job is archived to protect candidate history.
 * If no applications exist, job is permanently deleted.
 * DELETE /api/jobs/:id
 * Authentication: Required (recruiter owner or admin)
 */
const deleteJob = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid job ID format." });
    }

    const job = await Job.findById(id);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job posting not found." });
    }

    // Ownership check
    if (req.user.role === "recruiter" && job.recruiterId.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only delete job postings you own."
      });
    }

    // Check for existing applications
    const applicationsCount = await Application.countDocuments({ jobId: job._id });

    if (applicationsCount > 0) {
      // Data preservation strategy: Archive the job to preserve application history
      job.status = "Archived";
      await job.save();

      return res.status(200).json({
        success: true,
        message: `Job has ${applicationsCount} existing application(s) and was safely archived rather than permanently deleted.`,
        data: {
          job,
          action: "archived"
        }
      });
    }

    // If zero applications exist, safe to permanently delete
    await Job.findByIdAndDelete(job._id);

    return res.status(200).json({
      success: true,
      message: "Job posting permanently deleted.",
      data: {
        action: "deleted"
      }
    });
  } catch (error) {
    console.error("[Delete Job Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while deleting the job posting."
    });
  }
};

module.exports = {
  createJob,
  getJobs,
  getMyJobs,
  getJobById,
  updateJob,
  updateJobStatus,
  deleteJob
};

