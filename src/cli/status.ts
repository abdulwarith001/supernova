#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";
import axios from "axios";

const PID_FILE = path.join(os.homedir(), ".supernova", "supernova.pid");

function createMeter(value: number, color: string = "\x1b[32m"): string {
  const bars = Math.round(value / 10);
  const empty = 10 - bars;
  const barStr = "█".repeat(bars);
  const emptyStr = "░".repeat(empty);
  return `[${color}${barStr}\x1b[0m${emptyStr}] ${value.toFixed(0)}%`;
}

async function status() {
  if (!fs.existsSync(PID_FILE)) {
    console.log("\x1b[31m💤 Agent is ASLEEP.\x1b[0m");
    return;
  }

  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8"));
    process.kill(pid, 0);

    try {
      const res = await axios.get("http://localhost:3000/health", {
        timeout: 2000,
      });
      const data = res.data;

      console.log("\n\x1b[1m\x1b[35m─── SUPERNOVA STATUS Dashboard ───\x1b[0m");
      console.log(
        `\x1b[1mPID:\x1b[22m ${pid} | \x1b[1mUptime:\x1b[22m ${(data.uptime / 60).toFixed(1)} mins`,
      );
      console.log(
        `\x1b[1mStatus:\x1b[22m ${data.agent === "ACTIVE" ? "\x1b[32mACTIVE\x1b[0m" : "\x1b[33mIDLE\x1b[0m"}`,
      );

      if (data.session) {
        const { neuroState, anxieties, isDreaming } = data.session;
        console.log("\n\x1b[1m🧬 Neuro-Chemistry\x1b[0m");
        console.log(
          `  Dopamine: ${createMeter(neuroState.dopamine, "\x1b[33m")}`,
        );
        console.log(
          `  Cortisol: ${createMeter(neuroState.cortisol, "\x1b[31m")}`,
        );
        console.log(
          `  Oxytocin: ${createMeter(neuroState.oxytocin, "\x1b[35m")}`,
        );

        if (isDreaming) {
          console.log("\n\x1b[36m🌙 [REVERIE] Currently Dreaming...\x1b[0m");
        }

        if (anxieties && anxieties.length > 0) {
          console.log("\n\x1b[1m\x1b[31m⚠️ Active Anxieties\x1b[0m");
          anxieties.forEach((a: string) => console.log(`  - ${a}`));
        }
      }

      if (data.scheduler) {
        const { pending, completed, parasitic } = data.scheduler;
        console.log("\n\x1b[1m✨ Sparks & Missions\x1b[0m");
        console.log(`  Pending:   \x1b[36m${pending}\x1b[0m`);
        console.log(`  Completed: \x1b[32m${completed}\x1b[0m`);
        if (parasitic > 0) {
          console.log(
            `  Parasitic: \x1b[31m${parasitic} (DECAY DETECTED)\x1b[0m`,
          );
        }
      }
      console.log("\x1b[35m──────────────────────────────────\x1b[0m\n");
    } catch (e) {
      console.log(
        `\n⚠️ Agent process (PID: ${pid}) is \x1b[33mUNRESPONSIVE\x1b[0m.`,
      );
      console.log(
        "It might be dreaming heavily, performing meditation, or hung.",
      );
    }
  } catch (e: any) {
    console.log("\x1b[31m💤 Agent is ASLEEP (Stale PID file cleaned).\x1b[0m");
    try {
      fs.unlinkSync(PID_FILE);
    } catch {}
  }
}

status();
