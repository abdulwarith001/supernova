#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";

// Dynamic import for open
const open = async (target: string) => {
  const openPkg = await import("open");
  await openPkg.default(target);
};

const PID_FILE = path.join(os.homedir(), ".supernova", "supernova.pid");
const DEFAULT_PORT = 3000;

async function launchDashboard() {
  // 1. Check if Daemon is alive
  if (!fs.existsSync(PID_FILE)) {
    console.log("💤 The agent is currently ASLEEP (Daemon not running).");
    console.log("👉 Run 'supernova wake' to bring the agent to life.");
    process.exit(1);
  }

  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8"));
    // Check if process is actually running
    process.kill(pid, 0);

    console.log(`⚡ Opening interface for live agent (PID: ${pid})...`);
    await open(`http://localhost:${DEFAULT_PORT}`);
    process.exit(0);
  } catch (e) {
    console.log("⚠️ Agent PID found but process is not responding.");
    console.log(
      "👉 It might have crashed. Try 'supernova status' or 'supernova wake'.",
    );
    process.exit(1);
  }
}

launchDashboard();
