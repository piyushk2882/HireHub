const nodemailer = require("nodemailer");
const { escapeHtml } = require("../utils/html");

let customTransporter = null;

/**
 * Check whether SMTP is configured via environment variables.
 * @returns {boolean}
 */
const isSmtpConfigured = () => {
  return Boolean(process.env.SMTP_HOST);
};

/**
 * Configure a custom Nodemailer transporter (primarily used for unit/integration testing).
 * @param {object|null} transporter
 */
const setTransporter = (transporter) => {
  customTransporter = transporter;
};

/**
 * Get or create the active Nodemailer transporter.
 * @returns {object|null} Transporter instance or null if SMTP is unconfigured
 */
const getTransporter = () => {
  if (customTransporter) {
    return customTransporter;
  }

  if (!isSmtpConfigured()) {
    return null;
  }

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  const auth = user && pass ? { user, pass } : undefined;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth,
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === "production"
    }
  });
};

/**
 * Renders HTML layout wrapper with styling and branded footer.
 */
const renderEmailLayout = ({ title, bodyHtml, actionText, actionUrl }) => {
  const safeTitle = escapeHtml(title);
  const safeActionText = escapeHtml(actionText);
  const safeActionUrl = escapeHtml(actionUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; line-height: 1.5; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; }
    .header { background-color: #2563eb; color: #ffffff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
    .content { padding: 32px; }
    .content p { margin: 0 0 16px 0; font-size: 15px; }
    .details-box { background-color: #f1f5f9; border-left: 4px solid #2563eb; padding: 16px; margin: 20px 0; border-radius: 4px; }
    .details-box p { margin: 4px 0; font-size: 14px; }
    .btn-container { margin: 28px 0; }
    .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; font-size: 14px; }
    .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 32px; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>HireHub Notifications</h1>
    </div>
    <div class="content">
      ${bodyHtml}
      ${
        actionUrl && actionText
          ? `<div class="btn-container"><a href="${safeActionUrl}" class="btn" target="_blank" rel="noopener noreferrer">${safeActionText}</a></div>`
          : ""
      }
    </div>
    <div class="footer">
      <p>This is an automated notification from HireHub. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>`;
};

/**
 * Builds email subject, HTML, and plain-text body according to the template type.
 * @param {string} template
 * @param {object} payload
 * @returns {{ subject: string, html: string, text: string }}
 */
const buildEmailContent = (template, payload = {}) => {
  const baseUrl = (process.env.APP_URL || process.env.CORS_ORIGIN || "http://localhost:4200").replace(/\/$/, "");
  const {
    jobTitle = "Unknown Job",
    companyName = "HireHub Partner",
    candidateName = "Candidate",
    applicantName = "Applicant",
    applicantEmail = "",
    applicationId = "",
    jobId = "",
    newStatus = "",
    note = ""
  } = payload;

  const safeJobTitle = escapeHtml(jobTitle);
  const safeCompanyName = escapeHtml(companyName);
  const safeCandidateName = escapeHtml(candidateName);
  const safeApplicantName = escapeHtml(applicantName);
  const safeApplicantEmail = escapeHtml(applicantEmail);
  const safeNote = escapeHtml(note);

  switch (template) {
    case "NEW_APPLICATION": {
      const subject = `New Application Received for ${jobTitle}`;
      const actionUrl = jobId ? `${baseUrl}/recruiter/jobs/${jobId}/applicants` : `${baseUrl}/recruiter/applications`;
      const bodyHtml = `
        <p>Hello,</p>
        <p>A new application has been submitted for your job posting <strong>${safeJobTitle}</strong>.</p>
        <div class="details-box">
          <p><strong>Job Title:</strong> ${safeJobTitle}</p>
          <p><strong>Company:</strong> ${safeCompanyName}</p>
          <p><strong>Applicant:</strong> ${safeApplicantName}${applicantEmail ? ` (${safeApplicantEmail})` : ""}</p>
        </div>
        <p>Click below to review the applicant's credentials and resume.</p>
      `;
      const text = `Hello,\n\nA new application has been submitted for your job posting: "${jobTitle}".\nCompany: ${companyName}\nApplicant: ${applicantName} (${applicantEmail})\n\nReview the application: ${actionUrl}\n\n- HireHub Team`;
      const html = renderEmailLayout({ title: subject, bodyHtml, actionText: "Review Application", actionUrl });
      return { subject, html, text };
    }

    case "APPLICATION_REVIEWED": {
      const subject = `Application Update: Your application for ${jobTitle} is Under Review`;
      const actionUrl = `${baseUrl}/my-applications`;
      const bodyHtml = `
        <p>Dear ${safeCandidateName},</p>
        <p>Your application for <strong>${safeJobTitle}</strong> at <strong>${safeCompanyName}</strong> has been reviewed by the hiring team.</p>
        <div class="details-box">
          <p><strong>Status:</strong> Under Review (Reviewed)</p>
          <p><strong>Job Title:</strong> ${safeJobTitle}</p>
          <p><strong>Company:</strong> ${safeCompanyName}</p>
          ${safeNote ? `<p><strong>Recruiter Note:</strong> ${safeNote}</p>` : ""}
        </div>
        <p>You can track the ongoing progress of your application on HireHub.</p>
      `;
      const text = `Dear ${candidateName},\n\nYour application for "${jobTitle}" at "${companyName}" has been reviewed by the hiring team.\nStatus: Reviewed\n${note ? `Note: ${note}\n` : ""}\nTrack your application: ${actionUrl}\n\n- HireHub Team`;
      const html = renderEmailLayout({ title: subject, bodyHtml, actionText: "View My Applications", actionUrl });
      return { subject, html, text };
    }

    case "APPLICATION_SHORTLISTED": {
      const subject = `Congratulations! Shortlisted for ${jobTitle}`;
      const actionUrl = `${baseUrl}/my-applications`;
      const bodyHtml = `
        <p>Dear ${safeCandidateName},</p>
        <p>Great news! Your application for <strong>${safeJobTitle}</strong> at <strong>${safeCompanyName}</strong> has been shortlisted for the next stage of the hiring process.</p>
        <div class="details-box">
          <p><strong>Status:</strong> Shortlisted</p>
          <p><strong>Job Title:</strong> ${safeJobTitle}</p>
          <p><strong>Company:</strong> ${safeCompanyName}</p>
          ${safeNote ? `<p><strong>Recruiter Note:</strong> ${safeNote}</p>` : ""}
        </div>
        <p>The recruiter may contact you soon with next steps.</p>
      `;
      const text = `Dear ${candidateName},\n\nCongratulations! Your application for "${jobTitle}" at "${companyName}" has been shortlisted.\nStatus: Shortlisted\n${note ? `Note: ${note}\n` : ""}\nView details: ${actionUrl}\n\n- HireHub Team`;
      const html = renderEmailLayout({ title: subject, bodyHtml, actionText: "View My Applications", actionUrl });
      return { subject, html, text };
    }

    case "APPLICATION_REJECTED": {
      const subject = `Application Update: ${jobTitle}`;
      const actionUrl = `${baseUrl}/my-applications`;
      const bodyHtml = `
        <p>Dear ${safeCandidateName},</p>
        <p>Thank you for taking the time to apply for <strong>${safeJobTitle}</strong> at <strong>${safeCompanyName}</strong>.</p>
        <p>After careful evaluation, the hiring team has decided to move forward with other candidates for this specific opening.</p>
        <div class="details-box">
          <p><strong>Status:</strong> Rejected</p>
          <p><strong>Job Title:</strong> ${safeJobTitle}</p>
          <p><strong>Company:</strong> ${safeCompanyName}</p>
          ${safeNote ? `<p><strong>Feedback Note:</strong> ${safeNote}</p>` : ""}
        </div>
        <p>We encourage you to explore other openings on HireHub that match your skills and experience.</p>
      `;
      const text = `Dear ${candidateName},\n\nThank you for applying for "${jobTitle}" at "${companyName}". The team has decided to pursue other candidates for this position.\nStatus: Rejected\n${note ? `Feedback: ${note}\n` : ""}\nExplore other jobs: ${actionUrl}\n\n- HireHub Team`;
      const html = renderEmailLayout({ title: subject, bodyHtml, actionText: "Explore More Jobs", actionUrl });
      return { subject, html, text };
    }

    case "APPLICATION_ACCEPTED": {
      const subject = `Great News! Your application for ${jobTitle} has been Accepted`;
      const actionUrl = `${baseUrl}/my-applications`;
      const bodyHtml = `
        <p>Dear ${safeCandidateName},</p>
        <p>Congratulations! We are delighted to inform you that your application for <strong>${safeJobTitle}</strong> at <strong>${safeCompanyName}</strong> has been accepted!</p>
        <div class="details-box">
          <p><strong>Status:</strong> Accepted</p>
          <p><strong>Job Title:</strong> ${safeJobTitle}</p>
          <p><strong>Company:</strong> ${safeCompanyName}</p>
          ${safeNote ? `<p><strong>Recruiter Note:</strong> ${safeNote}</p>` : ""}
        </div>
        <p>The hiring team will reach out with onboarding and offer details.</p>
      `;
      const text = `Dear ${candidateName},\n\nCongratulations! Your application for "${jobTitle}" at "${companyName}" has been Accepted!\nStatus: Accepted\n${note ? `Note: ${note}\n` : ""}\nView details: ${actionUrl}\n\n- HireHub Team`;
      const html = renderEmailLayout({ title: subject, bodyHtml, actionText: "View My Applications", actionUrl });
      return { subject, html, text };
    }

    default:
      throw new Error(`Unsupported email template: "${template}"`);
  }
};

/**
 * Deliver an email through the configured Nodemailer transport.
 * Throws if transport is unconfigured or if delivery fails.
 * @param {object} options
 * @param {string} options.to
 * @param {string} options.subject
 * @param {string} options.html
 * @param {string} options.text
 * @returns {Promise<object>} Transporter response (e.g. messageId)
 */
const deliverEmail = async ({ to, subject, html, text }) => {
  const transporter = getTransporter();

  if (!transporter) {
    const error = new Error("SMTP transport is not configured. (Missing SMTP_HOST)");
    error.code = "SMTP_NOT_CONFIGURED";
    throw error;
  }

  const from = process.env.SMTP_FROM || "HireHub <no-reply@hirehub.example>";

  return transporter.sendMail({
    from,
    to,
    subject,
    html,
    text
  });
};

module.exports = {
  isSmtpConfigured,
  setTransporter,
  getTransporter,
  buildEmailContent,
  deliverEmail
};

