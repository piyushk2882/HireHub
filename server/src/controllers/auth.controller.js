const bcrypt = require("bcryptjs");
const { User } = require("../models");
const { generateToken, setAuthCookie, clearAuthCookie } = require("../utils/jwt");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Register a new job seeker or recruiter account.
 * Rejects public admin registrations.
 * Sets HttpOnly cookie for session management and does NOT expose the raw JWT in response body.
 * POST /api/auth/register
 */
const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Validate presence of required fields
    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, password, and role are required."
      });
    }

    // Name length check
    if (name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Full name must be at least 2 characters long."
      });
    }

    // Email format validation
    const normalizedEmail = email.trim().toLowerCase();
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address."
      });
    }

    // Password strength enforcement
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long."
      });
    }

    // Disallow public admin registration
    if (role === "admin") {
      return res.status(403).json({
        success: false,
        message: "Registration as administrator is not permitted."
      });
    }

    // Only allow supported public registration roles
    if (!["job_seeker", "recruiter"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be either 'job_seeker' or 'recruiter'."
      });
    }

    // Check for existing account
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email address already exists."
      });
    }

    // Hash password securely with bcrypt
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Persist new user
    const newUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role
    });

    // Generate JWT & set HttpOnly cookie
    const token = generateToken({ id: newUser._id, role: newUser.role });
    setAuthCookie(res, token);

    // Return safe user information only - do not expose raw JWT in JSON
    return res.status(201).json({
      success: true,
      message: "Registration successful",
      data: {
        user: newUser.toSafeObject()
      }
    });
  } catch (error) {
    console.error("[Register Controller Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred during registration. Please try again."
    });
  }
};

/**
 * Log in an existing user with email and password.
 * Sets HttpOnly cookie for session management and does NOT expose the raw JWT in response body.
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Reject non-existent or deactivated accounts with generic error
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    // Verify password hash
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    // Generate JWT & set HttpOnly cookie
    const token = generateToken({ id: user._id, role: user.role });
    setAuthCookie(res, token);

    // Return safe user information only - do not expose raw JWT in JSON
    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: user.toSafeObject()
      }
    });
  } catch (error) {
    console.error("[Login Controller Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred during login. Please try again."
    });
  }
};

/**
 * Log out user by clearing the HttpOnly auth cookie.
 * POST /api/auth/logout
 */
const logout = (req, res) => {
  clearAuthCookie(res);
  return res.status(200).json({
    success: true,
    message: "Logged out successfully"
  });
};

/**
 * Returns safe profile of the currently authenticated user.
 * GET /api/auth/me
 */
const getMe = (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      user: req.user
    }
  });
};

module.exports = {
  register,
  login,
  logout,
  getMe
};
