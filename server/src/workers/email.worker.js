const dotenv = require("dotenv");
const crypto = require("crypto");
const { connectDB, disconnectDB } = require("../config/database");
const { EmailOutbox } = require("../models");
const { buildEmailContent, deliverEmail, isSmtpConfigured, getTransporter } = require("../services/email.service");

// Load environment variables if running directly
dotenv.config();

// Unique worker identifier for atomic lock traceability
const WORKER_ID = `worker-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;

// Configuration constants
const STALE_JOB_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const BASE_RETRY_DELAY_MS = 5 * 1000; // 5 seconds initial backoff
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000; // 1 hour cap

let isRunning = false;
let pollingTimer = null;
let activeJobPromise = null;

/**
 * Calculates exponential backoff in milliseconds.
 * Formula: min(MAX_DELAY, BASE_DELAY * 2^(attempts - 1))
 * @param {number} attempts
 * @returns {number}
 */
const calculateBackoffMs = (attempts) => {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * Math.pow(2, exponent));
};

/**
 * Atomically claim the next eligible outbox job.
 * Eligible jobs:
 * 1. status is 'Pending' AND nextAttemptAt <= now
 * 2. OR status is 'Processing' AND lockedAt <= (now - STALE_JOB_THRESHOLD_MS) [Stale Job Recovery]
 *
 * @param {string} [workerId=WORKER_ID]
 * @returns {Promise<object|null>} Claimed EmailOutbox document or null
 */
const claimNextJob = async (workerId = WORKER_ID) => {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - STALE_JOB_THRESHOLD_MS);

  return EmailOutbox.findOneAndUpdate(
    {
      $or: [
        {
          status: "Pending",
          nextAttemptAt: { $lte: now }
        },
        {
          status: "Processing",
          lockedAt: { $lte: staleThreshold }
        }
      ]
    },
    {
      $set: {
        status: "Processing",
        lockedAt: now,
        lockedBy: workerId
      },
      $inc: { attempts: 1 }
    },
    {
      returnDocument: "after",
      sort: { nextAttemptAt: 1 }
    }
  );
};

/**
 * Process a single outbox job:
 * 1. Atomically claim the job.
 * 2. Generate email HTML and text from template and payload.
 * 3. Deliver via email service.
 * 4. Update status to 'Sent' or handle retry / 'Failed'.
 *
 * @param {string} [workerId=WORKER_ID]
 * @returns {Promise<object|null>} Result metadata or null if no job was available
 */
const processNextJob = async (workerId = WORKER_ID) => {
  const job = await claimNextJob(workerId);
  if (!job) {
    return null;
  }

  const startTime = Date.now();
  console.log(`[Email Worker] Processing outbox job ${job._id} (template: ${job.template}, attempt: ${job.attempts}/${job.maxAttempts})`);

  try {
    // Check SMTP configuration / transporter availability
    if (!getTransporter()) {
      const unconfiguredError = new Error("SMTP transport is not configured. Please define SMTP_HOST in environment.");
      unconfiguredError.code = "SMTP_NOT_CONFIGURED";
      throw unconfiguredError;
    }

    // Render template
    const { subject, html, text } = buildEmailContent(job.template, job.payload);

    // Deliver email
    await deliverEmail({
      to: job.recipientEmail,
      subject,
      html,
      text
    });

    // Mark job as Sent
    job.status = "Sent";
    job.sentAt = new Date();
    job.lockedAt = null;
    job.lockedBy = null;
    job.lastError = null;
    await job.save();

    const duration = Date.now() - startTime;
    console.log(`[Email Worker] Successfully delivered job ${job._id} to ${job.recipientEmail} in ${duration}ms.`);
    return { success: true, job, duration };
  } catch (error) {
    const isUnconfigured = error.code === "SMTP_NOT_CONFIGURED";
    const errorMessage = error.message ? error.message.slice(0, 500) : "Unknown delivery error";

    job.lastError = errorMessage;
    job.lockedAt = null;
    job.lockedBy = null;

    // Permanent failure condition: reached max attempts OR unconfigured SMTP environment
    if (job.attempts >= job.maxAttempts || isUnconfigured) {
      job.status = "Failed";
      console.warn(`[Email Worker] Job ${job._id} permanently marked as Failed. Reason: ${errorMessage}`);
    } else {
      // Temporary failure: schedule retry with exponential backoff
      const backoffMs = calculateBackoffMs(job.attempts);
      job.status = "Pending";
      job.nextAttemptAt = new Date(Date.now() + backoffMs);
      console.warn(`[Email Worker] Job ${job._id} delivery failed. Retrying in ${Math.round(backoffMs / 1000)}s (Attempt ${job.attempts}/${job.maxAttempts}). Error: ${errorMessage}`);
    }

    await job.save();
    return { success: false, job, error: errorMessage };
  }
};

/**
 * Process up to `limit` pending outbox jobs in sequence.
 * @param {number} [limit=10]
 * @param {string} [workerId=WORKER_ID]
 * @returns {Promise<Array<object>>} Array of processed results
 */
const processBatch = async (limit = 10, workerId = WORKER_ID) => {
  const results = [];
  for (let i = 0; i < limit; i++) {
    const result = await processNextJob(workerId);
    if (!result) break; // Queue is currently empty
    results.push(result);
  }
  return results;
};

/**
 * Start the background polling loop.
 * @param {object} [options]
 * @param {number} [options.pollIntervalMs=5000]
 * @returns {Promise<void>}
 */
const startWorker = async ({ pollIntervalMs = 5000 } = {}) => {
  if (isRunning) {
    console.warn("[Email Worker] Worker is already running.");
    return;
  }

  console.log(`[Email Worker] Starting HireHub Email Worker (ID: ${WORKER_ID})...`);
  await connectDB();

  isRunning = true;

  const runLoop = async () => {
    if (!isRunning) return;

    try {
      activeJobPromise = processBatch(10, WORKER_ID);
      await activeJobPromise;
    } catch (loopError) {
      console.error("[Email Worker] Error during polling batch:", loopError.message);
    } finally {
      activeJobPromise = null;
      if (isRunning) {
        pollingTimer = setTimeout(runLoop, pollIntervalMs);
      }
    }
  };

  runLoop();
};

/**
 * Gracefully stop the worker loop, waiting for any in-flight batch to conclude.
 * @returns {Promise<void>}
 */
const stopWorker = async () => {
  if (!isRunning) return;

  console.log("\n[Email Worker] Stopping email worker gracefully...");
  isRunning = false;

  if (pollingTimer) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }

  if (activeJobPromise) {
    try {
      await activeJobPromise;
    } catch (err) {
      // Suppress in-flight error during shutdown
    }
  }

  console.log("[Email Worker] Worker stopped cleanly.");
};

// Handle process termination signals
const handleSignal = async (signal) => {
  console.log(`\nReceived ${signal}. Shutting down worker...`);
  await stopWorker();
  await disconnectDB();
  process.exit(0);
};

process.on("SIGINT", () => handleSignal("SIGINT"));
process.on("SIGTERM", () => handleSignal("SIGTERM"));

// Execute directly from CLI
if (require.main === module) {
  startWorker();
}

module.exports = {
  WORKER_ID,
  STALE_JOB_THRESHOLD_MS,
  BASE_RETRY_DELAY_MS,
  MAX_RETRY_DELAY_MS,
  calculateBackoffMs,
  claimNextJob,
  processNextJob,
  processBatch,
  startWorker,
  stopWorker
};

