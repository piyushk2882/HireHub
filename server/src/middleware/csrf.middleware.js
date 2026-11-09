const crypto = require("crypto");

/**
 * Generates a cryptographically strong random token for CSRF protection.
 */
const generateCsrfToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

/**
 * Cookie options for the non-HttpOnly CSRF token.
 * Must be readable by client JavaScript (Angular HttpClient) to enable Double-Submit Cookie pattern.
 */
const getCsrfCookieOptions = () => {
  const isProd = process.env.NODE_ENV === "production";
  const sameSite = isProd
    ? (process.env.COOKIE_SAMESITE || "lax").toLowerCase()
    : "lax";

  return {
    httpOnly: false, // Angular needs to read this cookie to populate X-XSRF-TOKEN header
    secure: isProd && process.env.COOKIE_SECURE !== "false",
    sameSite: sameSite,
    path: "/"
  };
};

/**
 * Middleware: Attaches or refreshes the XSRF-TOKEN cookie on safe requests.
 */
const setCsrfCookie = (req, res, next) => {
  if (!req.cookies || !req.cookies["XSRF-TOKEN"]) {
    const token = generateCsrfToken();
    res.cookie("XSRF-TOKEN", token, getCsrfCookieOptions());
    // Attach to request for immediate availability in current cycle
    req.csrfToken = token;
  } else {
    req.csrfToken = req.cookies["XSRF-TOKEN"];
  }
  next();
};

/**
 * Validates request Origin and Referer against permitted frontend origin.
 * Defense-in-depth against cross-site requests.
 */
const validateOrigin = (req) => {
  const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:4200";
  const requestOrigin = req.headers.origin;
  const requestReferer = req.headers.referer;

  // In standard browser cross-origin requests, Origin is present
  if (requestOrigin) {
    return requestOrigin === allowedOrigin;
  }

  // If Origin is missing, check Referer
  if (requestReferer) {
    return requestReferer.startsWith(allowedOrigin);
  }

  // Non-browser or direct requests (e.g., node-fetch without origin header)
  return true;
};

/**
 * Middleware: Enforces Double-Submit Cookie and Origin validation on state-changing methods.
 */
const validateCsrf = (req, res, next) => {
  const stateMutatingMethods = ["POST", "PUT", "DELETE", "PATCH"];

  // Safe HTTP methods (GET, HEAD, OPTIONS) do not require CSRF token validation
  if (!stateMutatingMethods.includes(req.method)) {
    return next();
  }

  // 1. Origin / Referer validation
  if (!validateOrigin(req)) {
    return res.status(403).json({
      success: false,
      message: "Cross-site request blocked: Invalid request origin."
    });
  }

  // 2. Double-Submit Cookie validation
  const clientHeaderToken =
    req.headers["x-xsrf-token"] || req.headers["x-csrf-token"];
  const cookieToken = req.cookies && req.cookies["XSRF-TOKEN"];

  if (!cookieToken || !clientHeaderToken) {
    return res.status(403).json({
      success: false,
      message: "CSRF verification failed: Missing token in cookie or header."
    });
  }

  // Constant-time comparison to prevent timing attacks
  try {
    const headerBuffer = Buffer.from(clientHeaderToken);
    const cookieBuffer = Buffer.from(cookieToken);

    if (
      headerBuffer.length !== cookieBuffer.length ||
      !crypto.timingSafeEqual(headerBuffer, cookieBuffer)
    ) {
      return res.status(403).json({
        success: false,
        message: "CSRF verification failed: Token mismatch."
      });
    }
  } catch {
    return res.status(403).json({
      success: false,
      message: "CSRF verification failed: Invalid token format."
    });
  }

  return next();
};

module.exports = {
  generateCsrfToken,
  getCsrfCookieOptions,
  setCsrfCookie,
  validateCsrf
};

