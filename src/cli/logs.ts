#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";

const LOG_FILE = path.join(os.homedir(), ".supernova", "supernova.log");
const ERROR_FILE = path.join(os.homedir(), ".supernova", "supernova.error.log");

async function showLogs() {
  const args = process.argv.slice(2);
  const tail = args.includes("--tail") || args.includes("-f");

  if (!fs.existsSync(LOG_FILE)) {
    console.log("❌ No logs found. Is the agent running?");
    return;
  }

  console.log(`📜 Reading logs from: ${LOG_FILE}`);

  if (tail) {
    console.log("... Tailing logs (Press Ctrl+C to stop) ...");
    const child = spawn("tail", ["-f", LOG_FILE], {
      stdio: "inherit",
    });

    // Also tail error log if it exists and is not empty?
    // Usually tail -f on one file is cleaner for CLI.
    // If users want both, maybe we can tail both?
    // Let's stick to main log for now as it captures stdout/stderr from the daemon spawn usually.

    child.on("close", (code) => {
      process.exit(code || 0);
    });
  } else {
    // Just cat the last 50 lines by default if no tail? Or cat whole file?
    // User asked for "all logs" but large files might be bad.
    // Let's default to cat whole file but using stream to avoid memory issues.

    const stream = fs.createReadStream(LOG_FILE, { encoding: "utf-8" });
    stream.pipe(process.stdout);

    stream.on("end", () => {
      // Maybe check error log too
      if (fs.existsSync(ERROR_FILE)) {
        const stats = fs.statSync(ERROR_FILE);
        if (stats.size > 0) {
          console.log("\n⚠️  ERROR LOGS FOUND:");
          const errStream = fs.createReadStream(ERROR_FILE, {
            encoding: "utf-8",
          });
          errStream.pipe(process.stdout);
        }
      }
    });
  }
}

showLogs();
