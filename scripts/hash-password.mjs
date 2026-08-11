#!/usr/bin/env node
// Generates an ADMIN_PASSWORD_HASH value for .env.local — mirrors the
// scrypt hashing in src/lib/auth/admin.ts (no dependency on the app's
// TypeScript build, so it can run standalone with plain Node).
//
// Usage:
//   node scripts/hash-password.mjs "your-password-here"

import { scryptSync, randomBytes } from "node:crypto";

const password = process.argv[2];

if (!password) {
  console.error("Usage: node scripts/hash-password.mjs <password>");
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const derived = scryptSync(password, salt, 64).toString("hex");

console.log("\nADMIN_PASSWORD_HASH=" + salt + ":" + derived);
console.log("\nAdd this to .env.local, along with a random ADMIN_SESSION_SECRET, e.g.:");
console.log("ADMIN_SESSION_SECRET=" + randomBytes(32).toString("hex") + "\n");
