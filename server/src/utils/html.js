/**
 * Escape HTML special characters in untrusted strings to prevent XSS / HTML injection in emails.
 * @param {string} str
 * @returns {string} Sanitized string
 */
const escapeHtml = (str) => {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

module.exports = {
  escapeHtml
};

