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
} else if (command === "mode") {
  spawnTS(path.join(__dirname, "../src/cli/mode.ts"), [subCommand || ""]);
} else if (command === "keys") {
  spawnTS(path.join(__dirname, "../src/cli/keys.ts"));
} else if (command === "wake") {
  spawnTS(path.join(__dirname, "../src/cli/wake.ts"), args.slice(1));
} else if (command === "sleep") {
  spawnTS(path.join(__dirname, "../src/cli/sleep.ts"));
} else if (command === "status") {
  spawnTS(path.join(__dirname, "../src/cli/status.ts"));
} else if (command === "hive-mind") {
  spawnTS(path.join(__dirname, "../src/cli/hive-mind.ts"), [
    subCommand || "help",
  ]);
} else if (command === "chat") {
  spawnTS(path.join(__dirname, "../src/cli/chat.ts"));
} else if (command === "logs") {
  // Pass flags (subCommand could be --tail)
  const logArgs = [subCommand || "", thirdArg || ""];
  spawnTS(path.join(__dirname, "../src/cli/logs.ts"), logArgs);
} else if (command === "meditate") {
  spawnTS(path.join(__dirname, "../src/cli/meditate.ts"));
} else {
  console.log("Usage:");
  console.log(
    "  supernova wake [--chat]    Start the Agent Daemon (Background Life)",
  );
  console.log("  supernova chat             Open the Chat Interface");
  console.log(
    "  supernova meditate         Consolidate history into permanent memories",
  );
  console.log("  supernova logs [--tail]    View Agent Logs");
  console.log("  supernova sleep            Stop the Agent Daemon");
  console.log("  supernova status           Check Agent Health");
  console.log(
    "  supernova hive-mind --link Tether agent permanently to your system",
  );
  console.log(
    "  supernova hive-mind --unlink Break the permanent system tether",
  );
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
}
