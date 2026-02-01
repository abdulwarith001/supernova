import inquirer from "inquirer";
import fs from "fs";
import path from "path";
import os from "os";
import { TOOLS } from "./constants";
import { encrypt, decrypt } from "../utils/crypto";
import { google } from "googleapis";

const CONFIG_DIR = path.join(os.homedir(), ".supernova");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

async function main() {
  const args = process.argv.slice(2);
  const targetService = args[0];

  // Load Config
  let config: any = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    } catch (e) {}
  }

  if (targetService) {
    const service = TOOLS.find((t) => t.id === targetService);
    if (!service) {
      console.error(`❌ Unknown service: ${targetService}`);
      console.log(`Available services: ${TOOLS.map((t) => t.id).join(", ")}`);
      process.exit(1);
    }
    await setupService(service, config);
  } else {
    await listTools(config);
  }
}

async function listTools(config: any) {
  console.clear();
  console.log("🛠️  Supernova Tool Manager\n");

  const choices = TOOLS.map((tool) => {
    const isEnabled = tool.keys.every((key) => !!config[key]);
    const status = isEnabled ? "✅ [ENABLED]" : "❌ [DISABLED]";
    return {
      name: `${tool.name.padEnd(25)} ${status} - ${tool.description}`,
      value: tool,
    };
  });

  choices.push({ name: "🚪 Exit", value: "exit" as any });

  const { selected } = await inquirer.prompt([
    {
      type: "rawlist",
      name: "selected",
      message: "Select an integration to manage:",
      choices,
      pageSize: 15,
    },
  ]);

  if (selected === "exit") return;

  await setupService(selected, config);
}

function getSecret(config: any, key: string): string | null {
  const val = config[key];
  if (!val) return null;
  try {
    return decrypt(val);
  } catch (e) {
    return val;
  }
}

async function setupService(service: any, config: any) {
  console.clear();
  console.log(`⚙️  Managing ${service.name}...`);

  const isEnabled = service.keys.every((key: string) => !!config[key]);
  console.log(`Status: ${isEnabled ? "✅ ENABLED" : "❌ DISABLED"}\n`);

  const { action } = await inquirer.prompt([
    {
      type: "rawlist",
      name: "action",
      message: "What would you like to do?",
      choices: [
        {
          name: isEnabled ? "Update configuration" : "Enable integration",
          value: "setup",
        },
        { name: "Revoke / Delete integration", value: "revoke" },
        { name: "Back", value: "back" },
      ],
    },
  ]);

  if (action === "back") return listTools(config);

  if (action === "revoke") {
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: `Are you sure you want to revoke ${service.name}? This will delete all associated local keys.`,
        default: false,
      },
    ]);

    if (confirm) {
      service.keys.forEach((key: string) => delete config[key]);
      saveConfig(config);
      console.log(`\n🗑️  ${service.name} has been revoked.\n`);
    }
    return listTools(config);
  }

  if (service.id === "calendar" || service.id === "email") {
    await setupGoogleOAuth(config, service.id);
    saveConfig(config);
  } else {
    for (const key of service.keys) {
      const isSecret =
        key.endsWith("_KEY") ||
        key.endsWith("_SECRET") ||
        key.endsWith("_TOKEN") ||
        key.endsWith("_PASSWORD");

      const isBoolean = key.endsWith("_ENABLED");

      const { val } = await inquirer.prompt([
        {
          type: isSecret ? "password" : "input",
          name: "val",
          message: isBoolean ? `Enable ${key} (y/n):` : `Enter ${key}:`,
          default: isSecret ? undefined : getSecret(config, key),
          validate: (input: any) => {
            if (isBoolean) {
              const lower = input.toString().toLowerCase();
              if (["y", "n", "yes", "no", "true", "false"].includes(lower))
                return true;
              return "Please enter 'y' or 'n'.";
            }
            return input.toString().length > 0 ? true : `${key} is required`;
          },
          filter: (input: any) => {
            if (isBoolean) {
              const lower = input.toString().toLowerCase();
              if (["y", "yes", "true"].includes(lower)) return "true";
              if (["n", "no", "false"].includes(lower)) return "false";
            }
            return input;
          },
        },
      ]);
      // Only encrypt secrets
      config[key] = isSecret ? encrypt(val) : val;
    }
    saveConfig(config);
  }

  console.log(`\n✅ ${service.name} configuration updated!\n`);
  return listTools(config);
}

async function setupGoogleOAuth(config: any, serviceId: string) {
  console.log(
    "ℹ️  To use Google services, you need a Google Cloud Project with OAuth2 (Desktop App) enabled.",
  );
  console.log(
    "🔗 Get credentials at: https://console.cloud.google.com/apis/credentials\n",
  );

  const existingId = getSecret(config, "GOOGLE_CLIENT_ID");
  const existingSecret = getSecret(config, "GOOGLE_CLIENT_SECRET");

  const { clientId } = await inquirer.prompt([
    {
      type: "input",
      name: "clientId",
      message: "Enter GOOGLE_CLIENT_ID:",
      default: existingId,
      validate: (i) => i.length > 0,
    },
  ]);

  const { clientSecret } = await inquirer.prompt([
    {
      type: "password",
      name: "clientSecret",
      message: "Enter GOOGLE_CLIENT_SECRET:",
      default: existingSecret,
      validate: (i) => i.length > 0,
    },
  ]);

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "http://localhost:8080",
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/gmail.modify",
    ],
    prompt: "consent",
  });

  console.log(
    "\n🚀 ACTION REQUIRED: Visit this URL in your browser to authorize Supernova:",
  );
  console.log(`\n${authUrl}\n`);

  const { code } = await inquirer.prompt([
    {
      type: "input",
      name: "code",
      message: "Enter the code from the browser:",
      validate: (i) => i.length > 0,
    },
  ]);

  try {
    console.log("⏳ Exchanging code for tokens...");
    const { tokens } = await oauth2Client.getToken(code);

    config.GOOGLE_CLIENT_ID = encrypt(clientId);
    config.GOOGLE_CLIENT_SECRET = encrypt(clientSecret);

    if (tokens.access_token)
      config.GOOGLE_ACCESS_TOKEN = encrypt(tokens.access_token);
    if (tokens.refresh_token)
      config.GOOGLE_REFRESH_TOKEN = encrypt(tokens.refresh_token);

    // Explicitly enable only the requested service or both if they were both just re-authed
    if (serviceId === "calendar") config.GOOGLE_CALENDAR_ENABLED = "true";
    if (serviceId === "email") config.GOOGLE_EMAIL_ENABLED = "true";

    saveConfig(config);
    console.log("\n✅ Google authentication successful!");
  } catch (e: any) {
    console.error(`\n❌ Failed to authenticate: ${e.message}`);
  }
}

function saveConfig(config: any) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

main().catch(console.error);
