#!/usr/bin/env node

/**
 * HireHub Administrator Account Provisioning CLI Script
 *
 * Securely provisions the platform's initial administrator without exposing any public endpoint.
 *
 * Usage:
 *   Option A (via Environment Variables):
 *     ADMIN_NAME="System Administrator" ADMIN_EMAIL="admin@hirehub.com" ADMIN_PASSWORD="SuperSecretPassword123!" npm run seed:admin
 *
 *   Option B (via CLI Arguments):
 *     node src/scripts/provisionAdmin.js --name "Admin" --email "admin@hirehub.com" --password "SuperSecretPassword123!"
 */

const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const { connectDB, disconnectDB } = require("../config/database");
const { User } = require("../models");

dotenv.config();

const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsed = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].replace(/^--/, "");
      const value = args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true;
      parsed[key] = value;
    }
  }

  return parsed;
};

const provisionAdmin = async () => {
  const cliArgs = parseArgs();

  const name = cliArgs.name || process.env.ADMIN_NAME || "HireHub Administrator";
  const email = cliArgs.email || process.env.ADMIN_EMAIL;
  const password = cliArgs.password || process.env.ADMIN_PASSWORD;

  console.log("==================================================");
  console.log(" HireHub - Secure Administrator Provisioning Tool");
  console.log("==================================================");

  // Validate inputs
  if (!email || !email.trim()) {
    console.error("\n[Error] Admin email is required.");
    console.error("Provide via ADMIN_EMAIL env var or --email argument.");
    process.exit(1);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const normalizedEmail = email.trim().toLowerCase();
  if (!emailRegex.test(normalizedEmail)) {
    console.error(`\n[Error] Invalid email format: '${normalizedEmail}'`);
    process.exit(1);
  }

  if (!password || password.length < 8) {
    console.error("\n[Error] Admin password is required and must be at least 8 characters long.");
    console.error("Provide via ADMIN_PASSWORD env var or --password argument.");
    process.exit(1);
  }

  try {
    console.log(`\nConnecting to database...`);
    await connectDB();

    // Check for existing account
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      if (existingUser.role === "admin") {
        console.log(`\n[Notice] Administrator account for '${normalizedEmail}' already exists.`);
        console.log("No modifications were made to preserve existing access.");
        await disconnectDB();
        process.exit(0);
      } else {
        console.error(
          `\n[Conflict] An account already exists for '${normalizedEmail}' with role '${existingUser.role}'.`
        );
        console.error("Cannot overwrite existing non-admin user as admin.");
        await disconnectDB();
        process.exit(1);
      }
    }

    // Hash password with bcrypt
    console.log("Hashing administrator password...");
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create admin user
    const adminUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: "admin",
      isActive: true
    });

    console.log("\n[Success] Administrator account provisioned successfully!");
    console.log(`- ID: ${adminUser._id}`);
    console.log(`- Name: ${adminUser.name}`);
    console.log(`- Email: ${adminUser.email}`);
    console.log(`- Role: ${adminUser.role}`);
    console.log(`- Active: ${adminUser.isActive}`);
    console.log("\nYou may now log in to the admin console using these credentials.");

    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error("\n[Fatal Provisioning Error]:", error.message);
    try {
      await disconnectDB();
    } catch {
      // Ignore disconnect error on fatal failure
    }
    process.exit(1);
  }
};

// Execute provisioning
provisionAdmin();

