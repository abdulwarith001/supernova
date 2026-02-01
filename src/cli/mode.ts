import inquirer from "inquirer";
import fs from "fs";
import path from "path";
import os from "os";

const CONFIG_DIR = path.join(os.homedir(), ".supernova");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

async function main() {
  const args = process.argv.slice(2);
  let persona = args[0]; // optional argument

  if (!persona) {
    // Interactive Selection
    const answer = await inquirer.prompt([
      {
        type: "select",
        name: "persona",
        message: "Select Agent Persona:",
        choices: [
          { name: "Default (Professional)", value: "default" },
          { name: "🎩 Butler (Formal, Precise)", value: "butler" },
          { name: "🏴‍☠️ Pirate (Nautical, RP)", value: "pirate" },
          { name: "❤️ Romantic (Poetic, Charming)", value: "romantic" },
          { name: "👹 Wild (High-energy, Raw)", value: "wild" },
          { name: "🇳🇬 Local (Pidgin, Slang)", value: "local" },
          { name: "🥳 Fun (Playful, Witty)", value: "fun" },
        ],
      },
    ]);
    persona = answer.persona;
  }

  if (
    ![
      "default",
      "butler",
      "pirate",
      "romantic",
      "wild",
      "local",
      "fun",
    ].includes(persona)
  ) {
    console.error(
      "❌ Invalid persona. Options: default, butler, pirate, romantic, wild, local, fun",
    );
    return;
  }

  // Update Config
  let config: any = {};
  if (fs.existsSync(CONFIG_FILE)) {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  }

  config.SELECTED_PERSONA = persona;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

  console.log(`\n✅ Agent Persona switched to: ${persona.toUpperCase()}`);
  console.log("Restart the dashboard to apply changes.\n");
}

main();
