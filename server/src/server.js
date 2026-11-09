const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const { connectDB, disconnectDB, getDBStatus } = require("./config/database");
const { setCsrfCookie, validateCsrf } = require("./middleware/csrf.middleware");
const { startWorker, stopWorker } = require("./workers/email.worker");
const authRoutes = require("./routes/auth.routes");
const companyRoutes = require("./routes/company.routes");
const jobRoutes = require("./routes/job.routes");
const applicationRoutes = require("./routes/application.routes");
const notificationRoutes = require("./routes/notification.routes");

// Load environment variables
dotenv.config();

const app = express();

const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:4200";

// Security and utility middleware
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow direct requests with no origin (e.g. server-side calls, curl, health checks)
      if (!origin) {
        return callback(null, true);
      }
      if (origin === allowedOrigin) {
        return callback(null, true);
      }
      const error = new Error(`CORS policy violation: Origin '${origin}' is not authorized.`);
      return callback(error, false);
    },
    credentials: true
  })
);
app.use(cookieParser());
app.use(express.json());

// CSRF Defense: Attach CSRF cookie to all safe requests & validate mutating requests
app.use(setCsrfCookie);
app.use(validateCsrf);

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/notifications", notificationRoutes);

// Health check endpoint (Monitors API status and Database readiness)
app.get("/api/health", (req, res) => {
  const dbStatus = getDBStatus();
  const timestamp = new Date().toISOString();

  // If database is connected, service is fully ready
  if (dbStatus.isConnected) {
    return res.status(200).json({
      success: true,
      message: "HireHub API is running successfully!",
      timestamp,
      services: {
        api: "healthy",
        database: {
          status: dbStatus.status
        }
      }
    });
  }

  // When database is unconfigured (e.g. fresh clone / local demo without Atlas URI)
  if (!dbStatus.configured) {
    return res.status(200).json({
      success: true,
      message: "HireHub API is running successfully! (Database unconfigured)",
      timestamp,
      services: {
        api: "healthy",
        database: {
          status: "unconfigured"
        }
      }
    });
  }

  // When database is configured but disconnected / unreachable
  return res.status(503).json({
    success: false,
    message: "HireHub API is running (Database connection unavailable)",
    timestamp,
    services: {
      api: "healthy",
      database: {
        status: dbStatus.status
      }
    }
  });
});

// Root API
app.get("/", (req, res) => {
  res.send("Welcome to HireHub Backend!");
});

// Global Error Handler (handles CORS rejections gracefully)
app.use((err, req, res, next) => {
  if (err.message && err.message.includes("CORS policy violation")) {
    return res.status(403).json({
      success: false,
      message: err.message
    });
  }
  console.error("[Server Error]:", err.message);
  return res.status(500).json({
    success: false,
    message: "An internal server error occurred."
  });
});

// Start server function for deployment or direct execution
const startServer = async () => {
  const PORT = process.env.PORT || 5000;

  // Initialize MongoDB connection on startup
  try {
    await connectDB();
  } catch (err) {
    console.error("[Startup Warning] Initial MongoDB connection failed. Health check will report 503 until reconnected.");
  }

  const server = app.listen(PORT, () => {
    console.log(`HireHub API server running on port ${PORT}`);
    console.log(`CORS restricted to origin: ${allowedOrigin}`);
  });

  // Start background email outbox worker (polls every 5s unless explicitly disabled)
  if (process.env.DISABLE_EMAIL_WORKER !== "true") {
    try {
      startWorker({ pollIntervalMs: 5000 });
      console.log("[Email Worker] Background email outbox worker started successfully.");
    } catch (workerErr) {
      console.error("[Email Worker] Failed to initialize email worker:", workerErr.message);
    }
  }

  // Graceful shutdown handling
  const handleShutdown = async (signal) => {
    console.log(`\nReceived ${signal}. Gracefully shutting down HireHub API...`);
    if (process.env.DISABLE_EMAIL_WORKER !== "true") {
      try {
        await stopWorker();
      } catch (err) {
        // Ignore stop worker error during shutdown
      }
    }
    server.close(async () => {
      await disconnectDB();
      console.log("HireHub API server stopped cleanly.");
      process.exit(0);
    });
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));

  return server;
};

// Only automatically start the server if executed directly
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
