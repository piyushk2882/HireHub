const express = require("express");
const {
  register,
  login,
  logout,
  getMe
} = require("../controllers/auth.controller");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();

// Public CSRF & Authentication Endpoints
router.get("/csrf-token", (req, res) => {
  return res.status(200).json({
    success: true,
    csrfToken: req.csrfToken || req.cookies?.["XSRF-TOKEN"]
  });
});

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);

// Protected Authentication Endpoints
router.get("/me", requireAuth, getMe);

module.exports = router;
