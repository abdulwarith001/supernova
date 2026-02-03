#!/usr/bin/env node

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const PID_FILE = path.join(os.homedir(), ".supernova", "supernova.pid");
const LOG_FILE = path.join(os.homedir(), ".supernova", "supernova.log");
const ERROR_FILE = path.join(os.homedir(), ".supernova", "supernova.error.log");

// Ensure config dir
const configDir = path.dirname(PID_FILE);
if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

async function wake() {
  const flags = process.argv.slice(2);
  const openChat = flags.includes("--chat") || flags.includes("-c");

  if (fs.existsSync(PID_FILE)) {
    try {
      const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8"));
      process.kill(pid, 0); // Check if running
      console.log(`⚠️  Agent is already AWAKE (PID: ${pid}).`);
      if (openChat) {
        console.log("💬 Opening chat interface...");
        const open = (await import("open")).default;
        await open("http://localhost:3000");
      } else {
        console.log(
          "Use 'supernova chat' to connect or 'supernova status' to check health.",
        );
      }
      return;
    } catch (e) {
      // Process dead, remove PID
      fs.unlinkSync(PID_FILE);
    }
  }

  console.log("⚡ Awakening Agent Daemon...");

  // Resolve server path (assuming dist/server.js in prod or src/server.ts via ts-node in dev)
  // For this environment, we are likely running ts-node.
  const isDev = process.env.NODE_ENV !== "production";

  // Resolve server path
  const serverPath = path.join(process.cwd(), "src/server/index.ts");
  let command = "node";
  let args = ["dist/server/index.js"];

  if (fs.existsSync(serverPath)) {
    command = "npx";
    args = ["ts-node", "src/server/index.ts"];
  }

  const out = fs.openSync(LOG_FILE, "a");
  const err = fs.openSync(ERROR_FILE, "a");

  const child = spawn(command, args, {
    detached: true,
    stdio: ["ignore", out, err],
    cwd: process.cwd(),
    env: { ...process.env, DAEMON_MODE: "true" },
  });

  if (child.pid) {
    fs.writeFileSync(PID_FILE, child.pid.toString());
    console.log(`✅ Agent is AWAKE (PID: ${child.pid}).`);
    console.log(`📜 Logs detached to: ${LOG_FILE}`);

    if (openChat) {
      console.log("💬 Opening chat interface...");
      // For some reason, importing 'open' sometimes needs a small delay to ensure server is up
      setTimeout(async () => {
        const open = (await import("open")).default;
        await open("http://localhost:3000");
      }, 1000);
    } else {
      console.log(`💬 Run 'supernova chat' to interact.`);
    }

    child.unref();
  } else {
    console.error("❌ Failed to spawn agent daemon.");
  }
}

wake();
