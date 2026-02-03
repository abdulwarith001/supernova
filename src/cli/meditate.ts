#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";
import { decrypt } from "../utils/crypto";
import { AgentService } from "../services/agent.service";

async function runMeditation() {
  console.log("🧘 Starting Manual Meditation...");

  try {
    const configPath = path.join(HOME, ".supernova", "config.json");
    if (!fs.existsSync(configPath)) {
      throw new Error("No config found. Run 'supernova onboard' first.");
    }

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const provider = config.SELECTED_PROVIDER || "openai";
    let apiKey = config[`${provider.toUpperCase()}_API_KEY`];

    if (!apiKey) {
      throw new Error(`No API key found for provider ${provider}`);
    }

    try {
      apiKey = decrypt(apiKey);
    } catch (e) {}

    const agent = new AgentService(apiKey, config.SELECTED_MODEL || "gpt-4o");

    // Explicitly call meditate
    await agent.meditate();

    console.log("✅ Meditation complete. Context consolidated.");
    process.exit(0);
  } catch (e: any) {
    console.error(`❌ Meditation failed: ${e.message}`);
    process.exit(1);
  }
}

const HOME = os.homedir();
runMeditation();
