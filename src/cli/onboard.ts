import inquirer from "inquirer";
import fs from "fs";
import path from "path";
import os from "os";
import { PROVIDERS } from "./constants";
import { encrypt } from "../utils/crypto";

// Re-implement simple encryption for CLI if utils/crypto is too heavy or use imports if ts-node handles it.
// Since we are running via ts-node, we can import from src/utils/crypto.

const CONFIG_DIR = path.join(os.homedir(), ".supernova");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

async function onboard() {
  try {
    console.clear();
    console.log("🚀 Welcome to Supernova Onboarding!\n");

    // Step 1: Select Tier
    const { providerType } = await inquirer.prompt([
      {
        type: "select",
        name: "providerType",
        message: "Do you want to use a Free or Paid provider?",
        choices: [
          { name: "Free (Groq, Ollama)", value: "free" },
          { name: "Paid (OpenAI, Anthropic, Gemini)", value: "paid" },
        ],
      },
    ]);

    // Filter Providers
    const availableProviders = PROVIDERS.filter((p) => p.type === providerType);

    // Step 2: Select Provider
    const { providerId } = await inquirer.prompt([
      {
        type: "select",
        name: "providerId",
        message: "Select a Provider:",
        choices: availableProviders.map((p) => ({
          name: p.name,
          value: p.value,
        })),
      },
    ]);

    const provider = PROVIDERS.find((p) => p.value === providerId);
    if (!provider) throw new Error("Provider not found");

    let apiKey = "";
    if (provider.requiresKey) {
      const response = await inquirer.prompt([
        {
          type: "password",
          name: "apiKey",
          message: `Enter your ${provider.name} API Key:`,
          validate: (input) =>
            input.length > 0 ? true : "API Key is required",
        },
      ]);
      apiKey = response.apiKey;
    }

    // Step 3: Select Model (Dropdown of available models)
    console.log("\n"); // Spacer
    // Small delay to ensure TTY is ready after password input
    await new Promise((resolve) => setTimeout(resolve, 500));

    const { model } = await inquirer.prompt([
      {
        type: "select",
        name: "model",
        message: `Select a default model for ${provider.name} (Use arrow keys):`,
        choices: provider.models.map((m: string) => ({ name: m, value: m })),
        pageSize: 10,
      },
    ]);

    // Save Configuration
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    let config: any = {};
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
      } catch (e) {}
    }

    if (apiKey) {
      try {
        config[`${provider.value.toUpperCase()}_API_KEY`] = encrypt(apiKey);
      } catch (e) {
        console.error("Encryption error, saving plain text (fallback) - WARN");
        config[`${provider.value.toUpperCase()}_API_KEY`] = apiKey;
      }
    }

    config.SELECTED_PROVIDER = provider.value;
    config.SELECTED_MODEL = model;

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

    console.log("\n✅ Configuration Saved!");
    console.log(`Provider: ${provider.name}`);
    console.log(`Model: ${model}`);

    console.log("\n🎉 You are all set!");
    console.log("\nNext Steps:");
    console.log("1. Add Skills:    supernova skills add");
    console.log("2. View Commands: supernova help");
    console.log("3. Start Agent:   supernova dashboard\n");
  } catch (error: any) {
    if (
      error.message.includes("closed the prompt") ||
      error.name === "ExitPromptError"
    ) {
      console.log("\n👋 Onboarding cancelled.");
      process.exit(0);
    } else {
      console.error("\n❌ An error occurred:", error.message);
      process.exit(1);
    }
  }
}

onboard();
