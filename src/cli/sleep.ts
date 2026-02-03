#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";

const PID_FILE = path.join(os.homedir(), ".supernova", "supernova.pid");

async function sleep() {
  if (!fs.existsSync(PID_FILE)) {
    console.log("💤 Agent is already ASLEEP (No PID file found).");
    return;
  }

  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8"));

    console.log(`🌙 Putting Agent (PID: ${pid}) to sleep...`);
    process.kill(pid, "SIGINT"); // Graceful shutdown

    // Wait for it to clear PID file? Or just remove it if it doesn't?
    // Let's assume the server handles it, but we'll cleanup to be safe after a delay if needed.
    // For now, just sending the signal.

    // Check if it died
    let checks = 0;
    while (checks < 10) {
      try {
        process.kill(pid, 0);
        await new Promise((r) => setTimeout(r, 500));
        checks++;
      } catch (e) {
        console.log("✅ Agent is now ASLEEP.");
        fs.unlinkSync(PID_FILE);
        return;
      }
    }

    // Force kill if stuck
    console.warn("⚠️ Agent refused to sleep. Forcing shutdown...");
    process.kill(pid, "SIGKILL");
    fs.unlinkSync(PID_FILE);
    console.log("✅ Agent forced to SLEEP.");
  } catch (e: any) {
    if (e.code === "ESRCH") {
      console.log("⚠️ Agent process was not running. Cleaning up metadata.");
      fs.unlinkSync(PID_FILE);
    } else {
      console.error("❌ Error putting agent to sleep:", e.message);
    }
  }
}

sleep();
