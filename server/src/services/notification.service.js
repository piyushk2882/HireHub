const mongoose = require("mongoose");
const { Notification, EmailOutbox, User, Job, Company } = require("../models");

/**
 * Get effective notification preferences for a user, applying sensible defaults.
 * @param {object} user
 * @returns {object}
 */
const getEffectivePreferences = (user) => {
  const prefs = user?.notificationPreferences || {};
  return {
    emailNotificationsEnabled:
      typeof prefs.emailNotificationsEnabled === "boolean" ? prefs.emailNotificationsEnabled : true,
    applicationStatusEmails:
      typeof prefs.applicationStatusEmails === "boolean" ? prefs.applicationStatusEmails : true,
    recruiterNewApplicationEmails:
      typeof prefs.recruiterNewApplicationEmails === "boolean" ? prefs.recruiterNewApplicationEmails : true
  };
};

/**
 * Create an in-app notification record for a recipient.
 * @param {object} params
 * @param {string|mongoose.Types.ObjectId} params.recipientId
 * @param {string} params.type
 * @param {string} params.title
 * @param {string} params.message
 * @param {string} [params.relatedEntityType="Application"]
 * @param {string|mongoose.Types.ObjectId} params.relatedEntityId
 * @returns {Promise<object>} Created Notification document
 */
const createInAppNotification = async ({
  recipientId,
  type,
  title,
  message,
  relatedEntityType = "Application",
  relatedEntityId,
  relatedJobId = null
}) => {
  if (!recipientId || !type || !title || !message || !relatedEntityId) {
    throw new Error("Missing required parameters for in-app notification creation.");
  }

  const notification = await Notification.create({
    recipientId,
    type,
    title: title.trim(),
    message: message.trim(),
    relatedEntityType,
    relatedEntityId,
    relatedJobId
  });

  return notification;
};

/**
 * Enqueue an email job into the persistent EmailOutbox queue.
 * @param {object} params
 * @param {string} params.recipientEmail
 * @param {string|mongoose.Types.ObjectId} params.recipientId
 * @param {string} params.template
 * @param {object} params.payload
 * @returns {Promise<object>} Created EmailOutbox document
 */
const enqueueEmailNotification = async ({
  recipientEmail,
  recipientId,
  template,
  payload
}) => {
  if (!recipientEmail || !recipientId || !template || !payload) {
    throw new Error("Missing required parameters for email outbox enqueueing.");
  }

  const outboxJob = await EmailOutbox.create({
    recipientEmail: recipientEmail.trim().toLowerCase(),
    recipientId,
    template,
    payload,
    status: "Pending",
    attempts: 0,
    nextAttemptAt: new Date()
  });

  return outboxJob;
};

/**
 * Dispatch notification for a newly submitted job application:
 * 1. Notifies the recruiter owning the job via in-app notification.
 * 2. Enqueues an email job if the recruiter's email preferences permit it.
 *
 * @param {object} params
 * @param {object} params.application
 * @param {object} params.job
 * @param {string|mongoose.Types.ObjectId} params.applicantId
 */
const notifyNewApplication = async ({ application, job, applicantId }) => {
  try {
    if (!application || !job) {
      console.warn("[Notification Service] Cannot notify new application: application or job missing.");
      return;
    }

    // 1. Resolve Recruiter
    const recruiterId = job.recruiterId;
    if (!recruiterId) return;

    const recruiter = await User.findById(recruiterId).select(
      "name email isActive notificationPreferences"
    );
    if (!recruiter || !recruiter.isActive) return;

    // 2. Resolve Applicant Info
    const applicant = await User.findById(applicantId || application.applicantId).select("name email");
    const applicantName = applicant?.name || "A candidate";
    const applicantEmail = applicant?.email || "";

    // 3. Resolve Company Info
    let companyName = "HireHub Partner";
    if (job.companyId) {
      const company = await Company.findById(job.companyId).select("companyName");
      if (company?.companyName) {
        companyName = company.companyName;
      }
    }

    // 4. Create In-App Notification (Always created regardless of email preferences)
    await createInAppNotification({
      recipientId: recruiter._id,
      type: "NEW_APPLICATION",
      title: `New Application: ${job.title}`,
      message: `${applicantName} submitted an application for "${job.title}".`,
      relatedEntityType: "Application",
      relatedEntityId: application._id,
      relatedJobId: job._id
    });

    // 5. Evaluate Preferences for Email Enqueueing
    const prefs = getEffectivePreferences(recruiter);
    if (prefs.emailNotificationsEnabled && prefs.recruiterNewApplicationEmails && recruiter.email) {
      await enqueueEmailNotification({
        recipientEmail: recruiter.email,
        recipientId: recruiter._id,
        template: "NEW_APPLICATION",
        payload: {
          recruiterName: recruiter.name,
          applicantName,
          applicantEmail,
          jobTitle: job.title,
          jobId: job._id.toString(),
          companyName,
          applicationId: application._id.toString(),
          appliedAt: application.appliedAt || new Date()
        }
      });
    }
  } catch (err) {
    // Non-blocking: log error without interfering with primary business flow
    console.error("[Notification Service] Error handling notifyNewApplication:", err.message);
  }
};

/**
 * Dispatch notification when an application status changes:
 * 1. Notifies the applicant candidate via in-app notification.
 * 2. Enqueues an email job if the candidate's email preferences permit it.
 *
 * @param {object} params
 * @param {object} params.application
 * @param {string} params.oldStatus
 * @param {string} params.newStatus
 * @param {string|mongoose.Types.ObjectId} params.changedBy
 */
const notifyApplicationStatusChanged = async ({
  application,
  oldStatus,
  newStatus,
  changedBy
}) => {
  try {
    if (!application || !newStatus) return;

    // Guard: Do not notify if status has not changed
    if (oldStatus && oldStatus === newStatus) return;

    // Map status to notification & template type
    const statusTypeMap = {
      Reviewed: "APPLICATION_REVIEWED",
      Shortlisted: "APPLICATION_SHORTLISTED",
      Rejected: "APPLICATION_REJECTED",
      Accepted: "APPLICATION_ACCEPTED"
    };

    const notifType = statusTypeMap[newStatus];
    if (!notifType) {
      // If status is not one of the notification lifecycle statuses (e.g. Pending), no notification
      return;
    }

    // 1. Resolve Candidate
    const candidateId = application.applicantId;
    if (!candidateId) return;

    const candidate = await User.findById(candidateId).select(
      "name email isActive notificationPreferences"
    );
    if (!candidate || !candidate.isActive) return;

    // 2. Resolve Job and Company Info
    const job = await Job.findById(application.jobId).select("title companyId");
    const jobTitle = job?.title || "Job Opening";

    let companyName = "HireHub Partner";
    if (job?.companyId) {
      const company = await Company.findById(job.companyId).select("companyName");
      if (company?.companyName) {
        companyName = company.companyName;
      }
    }

    // Extract optional recruiter note from the latest statusHistory entry
    let note = "";
    if (Array.isArray(application.statusHistory) && application.statusHistory.length > 0) {
      const latest = application.statusHistory[application.statusHistory.length - 1];
      if (latest && latest.note) {
        note = latest.note;
      }
    }

    // 3. Create In-App Notification (Always created)
    await createInAppNotification({
      recipientId: candidate._id,
      type: notifType,
      title: `Application ${newStatus}: ${jobTitle}`,
      message: `Your application for "${jobTitle}" has been updated to "${newStatus}".`,
      relatedEntityType: "Application",
      relatedEntityId: application._id,
      relatedJobId: job?._id || application.jobId
    });

    // 4. Evaluate Preferences for Email Enqueueing
    const prefs = getEffectivePreferences(candidate);
    if (prefs.emailNotificationsEnabled && prefs.applicationStatusEmails && candidate.email) {
      await enqueueEmailNotification({
        recipientEmail: candidate.email,
        recipientId: candidate._id,
        template: notifType,
        payload: {
          candidateName: candidate.name,
          jobTitle,
          companyName,
          newStatus,
          note,
          applicationId: application._id.toString()
        }
      });
    }
  } catch (err) {
    // Non-blocking: log error without interfering with application status update
    console.error("[Notification Service] Error handling notifyApplicationStatusChanged:", err.message);
  }
};

module.exports = {
  getEffectivePreferences,
  createInAppNotification,
  enqueueEmailNotification,
  notifyNewApplication,
  notifyApplicationStatusChanged
};

