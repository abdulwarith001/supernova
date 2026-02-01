import inquirer from "inquirer";
import fs from "fs";
import path from "path";
import os from "os";
import { parseSkillManifest } from "../utils/parser";
import { encrypt, decrypt } from "../utils/crypto";

const CONFIG_DIR = path.join(os.homedir(), ".supernova");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const SKILLS_DIR = path.join(process.cwd(), "skills");

async function main() {
  console.clear();
  console.log("🔑 Supernova Skill Key Manager\n");

  const skillFiles = fs
    .readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith(".md") && f !== "overview.md");
  const allSecrets: any[] = [];

  for (const file of skillFiles) {
    const content = fs.readFileSync(path.join(SKILLS_DIR, file), "utf-8");
    const manifest = parseSkillManifest(content);
    if (manifest?.secrets) {
      manifest.secrets.forEach((s) => {
        allSecrets.push({ ...s, skillName: manifest.name });
      });
    }
  }

  if (allSecrets.length === 0) {
    console.log("No skills found with required keys.\n");
    return;
  }

  // Load Config
  let config: any = {};
  if (fs.existsSync(CONFIG_FILE)) {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  }

  const manage = async () => {
    const choices = allSecrets.map((s) => {
      const isSet = !!config[s.name];
      const status = isSet ? "✅ Set" : "❌ Missing";
      return {
        name: `${s.name.padEnd(20)} [${status}] (${s.skillName})`,
        value: s,
      };
    });

    choices.push({ name: "🚪 Exit", value: "exit" as any });

    const { selected } = await inquirer.prompt([
      {
        type: "select",
        name: "selected",
        message: "Select a key to manage:",
        choices,
        pageSize: 15,
      },
    ]);

    if (selected === "exit") return;

    const { action } = await inquirer.prompt([
      {
        type: "select",
        name: "action",
        message: `Action for ${selected.name}:`,
        choices: [
          { name: "Update Key", value: "update" },
          { name: "Show Description", value: "info" },
          { name: "Go Back", value: "back" },
        ],
      },
    ]);

    if (action === "info") {
      console.log(`\n📝 Description: ${selected.description}`);
      if (selected.link) console.log(`🔗 Link: ${selected.link}`);
      console.log("\n(Press Enter to continue)");
      await new Promise((r) => process.stdin.once("data", r));
      await manage();
    } else if (action === "update") {
      const { newValue } = await inquirer.prompt([
        {
          type: "password",
          name: "newValue",
          message: `Enter value for ${selected.name}:`,
          validate: (input) =>
            input.length > 0 ? true : "Value cannot be empty",
        },
      ]);

      config[selected.name] = encrypt(newValue);
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
      console.log(`\n✅ Key ${selected.name} updated!\n`);
      await manage();
    } else {
      await manage();
    }
  };

  await manage();
}

main().catch(console.error);
