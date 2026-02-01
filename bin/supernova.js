#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

// We need to register ts-node to import the crypto util directly or just re-implement simple encryption here for the JS CLI
// to avoid heavy ts-node dependency for just the CLI wrapper.
// For simplicity/robustness in this CLI wrapper, I will implement the config saving logic directly here using Node crypto.

const args = process.argv.slice(2);
const command = args[0];
const subCommand = args[1];
const thirdArg = args[2];

const spawnTS = (scriptPath, extraArgs = []) => {
  const child = spawn("npx", ["ts-node", scriptPath, ...extraArgs], {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  child.on("close", (code) => process.exit(code));
};

if (command === "onboard") {
  spawnTS(path.join(__dirname, "../src/cli/onboard.ts"));
} else if (command === "skills") {
  // Pass subCommand (list, info, add) and thirdArg (filename/args)
  const skillArgs = [subCommand || "help", thirdArg || ""];
  spawnTS(path.join(__dirname, "../src/cli/skills.ts"), skillArgs);
} else if (command === "add" && subCommand === "skills") {
  // Legacy support or redirect
  console.log("Please use: supernova skills add");
} else if (command === "setup" && subCommand === "browse") {
  // Legacy setup, keep for now or redirect to onboard
  spawnTS(path.join(__dirname, "../src/cli/onboard.ts")); // Reuse onboard for now
} else if (command === "setup") {
  spawnTS(path.join(__dirname, "../src/cli/setup.ts"), [subCommand || ""]);
} else if (command === "dashboard") {
  console.log("🚀 Launching Supernova Dashboard...");
  spawnTS(path.join(__dirname, "../src/server/index.ts"));
} else if (command === "mode") {
  spawnTS(path.join(__dirname, "../src/cli/mode.ts"), [subCommand || ""]);
} else if (command === "keys") {
  spawnTS(path.join(__dirname, "../src/cli/keys.ts"));
} else {
  console.log("Usage:");
  console.log("  supernova onboard          Run interactive setup wizard");
  console.log(
    "  supernova setup            Manage integrations (Calendar, Email, etc.)",
  );
  console.log("  supernova mode [persona]   Switch agent personality");
  console.log(
    "  supernova keys             Manage API keys for skills (Serper, etc.)",
  );
  console.log("  supernova skills list      List installed skills");
  console.log("  supernova skills add <url> Add a new skill");
  console.log("  supernova dashboard        Launch the AI agent dashboard");
}
