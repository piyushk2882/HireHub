const mongoose = require("mongoose");

/**
 * Maps Mongoose readyState numerical code to a human-readable string.
 * 0: disconnected, 1: connected, 2: connecting, 3: disconnecting
 */
const readyStateMap = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting"
};

/**
 * Strips credentials from a MongoDB connection string to ensure
 * sensitive details are never leaked in logs or error traces.
 * @param {string} uri
 * @returns {string} Sanitized URI
 */
const sanitizeMongoUri = (uri) => {
  if (!uri || typeof uri !== "string") return "unknown";
  try {
    return uri.replace(/\/\/(.*?)@/, "//***:***@");
  } catch {
    return "sanitized_uri";
  }
};

/**
 * Initializes and establishes a MongoDB connection using Mongoose.
 * Handles missing configuration, connection timeouts, and connection lifecycle events.
 * @returns {Promise<typeof mongoose | null>}
 */
const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri || uri.trim() === "") {
    console.warn(
      "[Database Warning] MONGODB_URI is not set. Running in database-disconnected mode."
    );
    return null;
  }

  // If already connected, reuse existing connection
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  try {
    const sanitized = sanitizeMongoUri(uri);
    console.log(`[Database] Connecting to MongoDB Atlas (${sanitized})...`);

    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds instead of hanging
      autoIndex: process.env.NODE_ENV !== "production"
    });

    console.log(
      `[Database Success] MongoDB connected successfully to host: ${conn.connection.host}`
    );
    return conn;
  } catch (error) {
    console.error("[Database Error] MongoDB connection failed:", error.message);
    // Graceful handling without throwing unhandled rejection during startup
    return null;
  }
};

/**
 * Disconnects the Mongoose connection cleanly.
 * Useful for graceful shutdown and testing teardowns.
 */
const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    console.log("[Database] MongoDB connection closed cleanly.");
  }
};

/**
 * Returns current database connectivity status and metadata.
 * Strictly guarantees that no credentials, tokens, or internal topologies are exposed.
 */
const getDBStatus = () => {
  const state = mongoose.connection.readyState;
  const isConfigured = Boolean(process.env.MONGODB_URI && process.env.MONGODB_URI.trim());

  return {
    configured: isConfigured,
    status: isConfigured ? (readyStateMap[state] || "unknown") : "unconfigured",
    readyState: state,
    isConnected: state === 1
  };
};

// Lifecycle Event Listeners
mongoose.connection.on("connected", () => {
  console.log("[Database Event] Mongoose connected to MongoDB cluster.");
});

mongoose.connection.on("error", (err) => {
  console.error("[Database Event] Mongoose connection error:", err.message);
});

mongoose.connection.on("disconnected", () => {
  console.log("[Database Event] Mongoose disconnected from MongoDB cluster.");
});

module.exports = {
  connectDB,
  disconnectDB,
  getDBStatus,
  sanitizeMongoUri
};

