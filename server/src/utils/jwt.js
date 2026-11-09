const jwt = require("jsonwebtoken");

/**
 * Retrieves and validates the JWT secret key.
 * Throws an explicit error in production if the secret is unconfigured.
 */
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === "") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[Security Error] JWT_SECRET must be configured in production environment."
      );
    }
    return "hirehub_dev_jwt_secret_fallback_key_2026";
  }
  return secret;
};

/**
 * Retrieves the token expiration duration.
 */
const getJwtExpiresIn = () => {
  return process.env.JWT_EXPIRES_IN || "7d";
};

/**
 * Cookie options for the HttpOnly auth token.
 * Tailored for development (HTTP localhost) vs production (HTTPS, configurable SameSite).
 */
const getCookieOptions = () => {
  const isProd = process.env.NODE_ENV === "production";
  const sameSite = isProd
    ? (process.env.COOKIE_SAMESITE || "lax").toLowerCase()
    : "lax";

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: sameSite,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/"
  };
};

/**
 * Generates a signed JWT token containing the given payload.
 * @param {object} payload
 * @returns {string} Signed JWT
 */
const generateToken = (payload) => {
  const secret = getJwtSecret();
  const expiresIn = getJwtExpiresIn();
  return jwt.sign(payload, secret, { expiresIn });
};

/**
 * Verifies a signed JWT token and returns the decoded payload.
 * @param {string} token
 * @returns {object} Decoded payload
 */
const verifyToken = (token) => {
  const secret = getJwtSecret();
  return jwt.verify(token, secret);
};

/**
 * Sets the authentication HttpOnly cookie on the response.
 * @param {import('express').Response} res
 * @param {string} token
 */
const setAuthCookie = (res, token) => {
  res.cookie("hirehub_token", token, getCookieOptions());
};

/**
 * Clears the authentication cookie from the response.
 * @param {import('express').Response} res
 */
const clearAuthCookie = (res) => {
  const options = getCookieOptions();
  delete options.maxAge;
  res.clearCookie("hirehub_token", { ...options, maxAge: 0 });
};

module.exports = {
  generateToken,
  verifyToken,
  getCookieOptions,
  setAuthCookie,
  clearAuthCookie,
  getJwtSecret
};
