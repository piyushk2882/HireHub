const multer = require("multer");
const path = require("path");

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx"];
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream"
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// Store in memory so signature and MIME type can be verified before writing to disk
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    const error = new Error("Unsupported file type. Only PDF, DOC, and DOCX files are allowed.");
    error.code = "INVALID_FILE_TYPE";
    return cb(error, false);
  }

  if (file.mimetype && !ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
    const error = new Error("Unsupported file MIME type. Only PDF, DOC, and DOCX files are allowed.");
    error.code = "INVALID_MIME_TYPE";
    return cb(error, false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  },
  fileFilter
});

/**
 * Validates binary magic numbers (file signature) for PDF, DOC, and DOCX.
 */
const validateFileSignature = (buffer, ext) => {
  if (!buffer || buffer.length < 4) {
    return false;
  }

  const isPdf =
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46; // %PDF

  const isZipContainer =
    buffer[0] === 0x50 &&
    buffer[1] === 0x4B &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04; // PK\x03\x04 (Used by DOCX)

  const isDoc =
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 &&
    buffer[5] === 0xb1 &&
    buffer[6] === 0x1a &&
    buffer[7] === 0xe1; // Compound Document (DOC)

  if (ext === ".pdf") return isPdf;
  if (ext === ".docx") return isZipContainer;
  if (ext === ".doc") return isDoc;

  return false;
};

/**
 * Express middleware for resume file upload.
 * Catches Multer limits and validates file signature.
 */
const uploadResume = (req, res, next) => {
  const uploadSingle = upload.single("resume");

  uploadSingle(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: "File size exceeds the maximum allowed limit of 5 MB."
        });
      }
      if (err.code === "INVALID_FILE_TYPE" || err.code === "INVALID_MIME_TYPE") {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message || "Failed to process uploaded file."
      });
    }

    // Verify file existence (if this route mandates a file)
    if (req.file) {
      const ext = path.extname(req.file.originalname || "").toLowerCase();
      if (!validateFileSignature(req.file.buffer, ext)) {
        return res.status(400).json({
          success: false,
          message: "File signature mismatch. The uploaded file does not match a valid PDF, DOC, or DOCX document."
        });
      }
    }

    next();
  });
};

module.exports = {
  uploadResume,
  validateFileSignature,
  MAX_FILE_SIZE
};

