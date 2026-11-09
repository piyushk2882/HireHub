const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/**
 * Storage Service:
 * Provides an abstraction layer for file storage.
 * Default provider stores files securely on the local filesystem outside public directories.
 * Can be swapped for an S3/Cloud provider in later phases without altering controllers.
 */
class LocalStorageProvider {
  constructor(baseDir) {
    this.baseDir = baseDir || path.resolve(__dirname, "../../uploads/resumes");
    this._ensureDirectory();
  }

  _ensureDirectory() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Sanitizes storage keys to prevent path traversal vulnerabilities.
   */
  _resolveSafePath(storageKey) {
    if (!storageKey || typeof storageKey !== "string") {
      throw new Error("Invalid storage key");
    }
    const safeKey = path.basename(storageKey);
    const targetPath = path.resolve(this.baseDir, safeKey);

    // Defense-in-depth: Ensure target path remains within baseDir
    if (!targetPath.startsWith(this.baseDir)) {
      throw new Error("Path traversal attempt detected");
    }
    return targetPath;
  }

  /**
   * Saves a file buffer to storage under a random unique key.
   */
  async saveFile({ buffer, originalName, mimeType }) {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new Error("File buffer is required to save file");
    }

    const ext = path.extname(originalName || "").toLowerCase() || ".pdf";
    const randomName = `${crypto.randomUUID()}${ext}`;
    const targetPath = this._resolveSafePath(randomName);

    await fs.promises.writeFile(targetPath, buffer, { mode: 0o600 });

    return {
      storageKey: randomName,
      size: buffer.length,
      originalName: originalName ? path.basename(originalName) : "resume" + ext,
      mimeType: mimeType || "application/octet-stream"
    };
  }

  /**
   * Checks whether a file exists in storage.
   */
  async fileExists(storageKey) {
    try {
      const targetPath = this._resolveSafePath(storageKey);
      await fs.promises.access(targetPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Returns a readable stream for the requested storage key.
   */
  getFileStream(storageKey) {
    const targetPath = this._resolveSafePath(storageKey);
    if (!fs.existsSync(targetPath)) {
      const error = new Error("File not found in storage");
      error.code = "ENOENT";
      throw error;
    }
    return fs.createReadStream(targetPath);
  }

  /**
   * Deletes a file from storage.
   */
  async deleteFile(storageKey) {
    try {
      const targetPath = this._resolveSafePath(storageKey);
      if (fs.existsSync(targetPath)) {
        await fs.promises.unlink(targetPath);
      }
      return true;
    } catch (err) {
      console.warn(`[Storage Warning] Failed to delete file ${storageKey}:`, err.message);
      return false;
    }
  }
}

// Default export uses LocalStorageProvider
const defaultUploadDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(__dirname, "../../uploads/resumes");

const storageService = new LocalStorageProvider(defaultUploadDir);

module.exports = {
  LocalStorageProvider,
  storageService
};

