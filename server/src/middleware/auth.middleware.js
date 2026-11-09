const { verifyToken } = require("../utils/jwt");
const { User } = require("../models");

/**
 * Authentication Middleware:
 * Authenticates user strictly via the HttpOnly `hirehub_token` cookie.
 * Verifies JWT signature and active user status in database.
 * Attaches authenticated safe user object to `req.user`.
 */
const requireAuth = async (req, res, next) => {
  try {
    // Strictly authenticate via the HttpOnly cookie
    const token = req.cookies && req.cookies.hirehub_token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. Please log in to proceed."
      });
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message:
          err.name === "TokenExpiredError"
            ? "Your session has expired. Please log in again."
            : "Invalid authentication token. Please log in again."
      });
    }

    // Query active user from database
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account associated with this token no longer exists."
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact support."
      });
    }

    // Attach safe user profile to request
    req.user = user.toSafeObject();
    return next();
  } catch (error) {
    console.error("[RequireAuth Middleware Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An internal authentication error occurred."
    });
  }
};

/**
 * Role-Based Authorization Middleware:
 * Ensures the authenticated user possesses at least one of the permitted roles.
 * Must be preceded by `requireAuth`.
 * @param  {...string} roles Allowed roles (e.g. 'job_seeker', 'recruiter', 'admin')
 */
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required before checking permissions."
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You do not have permission to view this resource."
      });
    }

    return next();
  };
};

module.exports = {
  requireAuth,
  authorizeRoles
};
