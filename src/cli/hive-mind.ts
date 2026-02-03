#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

const PLATFORM = process.platform;
const HOME = os.homedir();
const projectRoot = process.cwd();

const args = process.argv.slice(2);
const isLink = args.includes("link") || args.includes("--link");
const isUnlink = args.includes("unlink") || args.includes("--unlink");

async function hiveMind() {
  if (isLink) {
    await link();
  } else if (isUnlink) {
    await unlink();
  } else {
    console.log("Usage:");
    console.log(
      "  supernova hive-mind --link    Tether the agent to your system for permanent background life.",
    );
    console.log(
      "  supernova hive-mind --unlink  Break the tether and stop the permanent background life.",
    );
  }
}

async function link() {
  console.log(`🛠️  Tethering Hive Mind to ${PLATFORM}...`);

  const serverPath = path.join(projectRoot, "src", "server", "index.ts");
  const command = `npx ts-node ${serverPath}`;

  if (PLATFORM === "darwin") {
    setupMacOS();
  } else if (PLATFORM === "linux") {
    setupLinux();
  } else if (PLATFORM === "win32") {
    setupWindows();
  } else {
    console.error(`❌ Platform ${PLATFORM} not supported for tethering yet.`);
  }
}

async function unlink() {
  console.log(`✂️  Unlinking Hive Mind from ${PLATFORM}...`);

  if (PLATFORM === "darwin") {
    const plistPath = path.join(
      HOME,
      "Library",
      "LaunchAgents",
      "com.supernova.agent.plist",
    );
    if (fs.existsSync(plistPath)) {
      try {
        execSync(`launchctl unload ${plistPath}`);
        fs.unlinkSync(plistPath);
        console.log("✅ Hive Mind unlinked (plist removed).");
      } catch (e) {
        console.error(
          "❌ Failed to unload plist. You may need to run 'supernova sleep' first.",
        );
      }
    } else {
      console.log("ℹ️  Hive Mind is not linked.");
    }
  } else if (PLATFORM === "linux") {
    const servicePath = path.join(
      HOME,
      ".config",
      "systemd",
      "user",
      "supernova.service",
    );
    if (fs.existsSync(servicePath)) {
      try {
        execSync(`systemctl --user stop supernova`);
        execSync(`systemctl --user disable supernova`);
        fs.unlinkSync(servicePath);
        console.log("✅ Hive Mind unlinked (systemd service removed).");
      } catch (e) {
        console.error("❌ Failed to remove systemd service.");
      }
    } else {
      console.log("ℹ️  Hive Mind is not linked.");
    }
  } else if (PLATFORM === "win32") {
    const startupDir = path.join(
      process.env.APPDATA || "",
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs",
      "Startup",
    );
    const vbsPath = path.join(startupDir, "supernova.vbs");
    if (fs.existsSync(vbsPath)) {
      fs.unlinkSync(vbsPath);
      console.log("✅ Hive Mind unlinked (startup script removed).");
      console.log(
        "⚠️  Please manually stop the background process via Task Manager if still running.",
      );
    } else {
      console.log("ℹ️  Hive Mind is not linked.");
    }
  }
}

function setupMacOS() {
  const plistPath = path.join(
    HOME,
    "Library",
    "LaunchAgents",
    "com.supernova.agent.plist",
  );
  const logDir = path.join(HOME, ".supernova", "logs");
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  const nodePath = execSync("which node").toString().trim();
  const tsNodePath = path.join(projectRoot, "node_modules", ".bin", "ts-node");

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.supernova.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${tsNodePath}</string>
        <string>${projectRoot}/src/server/index.ts</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${HOME}/.supernova/supernova.log</string>
    <key>StandardErrorPath</key>
    <string>${HOME}/.supernova/supernova.error.log</string>
    <key>WorkingDirectory</key>
    <string>${projectRoot}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${process.env.PATH}</string>
        <key>DAEMON_MODE</key>
        <string>true</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
</dict>
</plist>`;

  fs.writeFileSync(plistPath, plistContent);
  console.log(`✅ Tether created at: ${plistPath}`);

  try {
    execSync(`launchctl load ${plistPath}`);
    console.log("⚡ Hive Mind is now PERMANENTLY LINKED.");
  } catch (e) {
    console.log("⚠️  Hive Mind already linked or failed to auto-start.");
  }
}

function setupLinux() {
  const servicePath = path.join(
    HOME,
    ".config",
    "systemd",
    "user",
    "supernova.service",
  );
  const systemdDir = path.dirname(servicePath);
  if (!fs.existsSync(systemdDir)) fs.mkdirSync(systemdDir, { recursive: true });

  const nodePath = execSync("which node").toString().trim();
  const tsNodePath = path.join(projectRoot, "node_modules", ".bin", "ts-node");

  const serviceContent = `[Unit]
Description=Supernova Bio-Digital Agent
After=network.target

[Service]
Type=simple
WorkingDirectory=${projectRoot}
ExecStart=${nodePath} ${tsNodePath} src/server/index.ts
Restart=always
RestartSec=10
StandardOutput=append:${HOME}/.supernova/supernova.log
StandardError=append:${HOME}/.supernova/supernova.error.log
Environment=DAEMON_MODE=true
Environment=PATH=${process.env.PATH}

[Install]
WantedBy=default.target
`;

  fs.writeFileSync(servicePath, serviceContent);
  console.log(`✅ Systemd service created at: ${servicePath}`);

  try {
    execSync(`systemctl --user daemon-reload`);
    execSync(`systemctl --user enable --now supernova`);
    console.log("⚡ Hive Mind is now PERMANENTLY LINKED.");
  } catch (e) {
    console.log("⚠️  Failed to link. Check systemctl --user status supernova.");
  }
}

function setupWindows() {
  const startupDir = path.join(
    process.env.APPDATA || "",
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Startup",
  );
  const vbsPath = path.join(startupDir, "supernova.vbs");
  const nodePath = process.execPath;
  const tsNodePath = path.join(
    projectRoot,
    "node_modules",
    "ts-node",
    "dist",
    "bin.js",
  );
  const serverPath = path.join(projectRoot, "src", "server", "index.ts");

  const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "${projectRoot}"
WshShell.Environment("PROCESS")("DAEMON_MODE") = "true"
WshShell.Run "cmd /c ""${nodePath}"" ""${tsNodePath}"" ""${serverPath}"" >> ""%USERPROFILE%\\.supernova\\supernova.log"" 2>&1", 0, false
`;

  try {
    fs.writeFileSync(vbsPath, vbsContent);
    console.log(`✅ Windows Startup script created at: ${vbsPath}`);
    execSync(`wscript "${vbsPath}"`);
    console.log("⚡ Hive Mind is now PERMANENTLY LINKED.");
  } catch (e: any) {
    console.error(`❌ Failed to link Windows: ${e.message}`);
  }
}

hiveMind();
