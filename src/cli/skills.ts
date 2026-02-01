import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import { spawn } from "child_process";

const SKILLS_DIR = path.join(process.cwd(), "skills");
const REGISTRY_FILE = path.join(SKILLS_DIR, "overview.md");

const args = process.argv.slice(2);
const command = args[0]; // list, info, add
const param = args[1]; // filename

async function main() {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }

  switch (command) {
    case "list":
      await listSkills();
      break;
    case "info":
      await showSkillInfo(param);
      break;
    case "add":
      await addSkill();
      break;
    case "remove":
      await removeSkill(param);
      break;
    default:
      console.log("Usage:");
      console.log("  supernova skills list");
      console.log("  supernova skills info <file_name>");
      console.log("  supernova skills add");
      console.log("  supernova skills remove <file_name>");
      break;
  }
}

async function removeSkill(name: string) {
  if (!name) {
    console.error("❌ Please specify the skill name to remove.");
    return;
  }

  const fileName = name.endsWith(".md") ? name : `${name}.md`;
  const filePath = path.join(SKILLS_DIR, fileName);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`🗑️  Deleted skill file: ${fileName}`);
  } else {
    console.log(`⚠️  File ${fileName} not found (only cleaning registry).`);
  }

  if (fs.existsSync(REGISTRY_FILE)) {
    const content = fs.readFileSync(REGISTRY_FILE, "utf-8");
    const lines = content.split("\n");
    const newLines = lines.filter(
      (line) => !line.includes(`skills/${fileName}`),
    );

    if (lines.length !== newLines.length) {
      fs.writeFileSync(REGISTRY_FILE, newLines.join("\n"));
      console.log(`✅ Removed from registry.`);
    } else {
      console.log(`ℹ️  Skill was not in registry.`);
    }
  }
}

async function listSkills() {
  console.log("\n🧩 Installed Skills:\n");
  if (fs.existsSync(REGISTRY_FILE)) {
    const content = fs.readFileSync(REGISTRY_FILE, "utf-8");
    // Simple parse to show lines starting with -
    const lines = content
      .split("\n")
      .filter((line) => line.trim().startsWith("-"));
    if (lines.length === 0) {
      console.log("  (No skills found in registry)");
    } else {
      lines.forEach((line) => console.log(`  ${line.trim()}`));
    }
  } else {
    console.log("  (Registry file not found)");
  }
  console.log("");
}

async function showSkillInfo(fileName: string) {
  if (!fileName) {
    console.error("❌ Please specify a file name.");
    return;
  }

  // Clean filename
  if (!fileName.endsWith(".md")) fileName += ".md";
  // Security check to prevent path traversal
  const safeName = path.basename(fileName);
  const filePath = path.join(SKILLS_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Skill file '${safeName}' not found.`);
    return;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  console.log(`\n📄 Content of ${safeName}:\n`);
  console.log("----------------------------------------");
  console.log(content);
  console.log("----------------------------------------\n");
}

async function addSkill() {
  console.log("\n➕ Add New Skill\n");

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "name",
      message: "Enter Skill File Name (e.g. email-sender):",
      validate: (input) =>
        /^[a-zA-Z0-9-_]+$/.test(input)
          ? true
          : "Use alphanumeric, dashes or underscores only.",
    },
    {
      type: "input",
      name: "description",
      message: "Enter Short Description (for the agent):",
      validate: (input) => (input.length > 5 ? true : "Description too short."),
    },
  ]);

  const fileName = answers.name.endsWith(".md")
    ? answers.name
    : `${answers.name}.md`;
  const filePath = path.join(SKILLS_DIR, fileName);

  // Single prompt for Source (URL or Path)
  const { source } = await inquirer.prompt([
    {
      type: "input",
      name: "source",
      message: "Enter Skill Source (URL or Local File Path):",
      validate: (input) => {
        if (!input.trim()) return "Source is required.";
        return true;
      },
    },
  ]);

  let finalContent = "";
  const isUrl = source.startsWith("http://") || source.startsWith("https://");

  if (isUrl) {
    console.log("⏳ Fetching from URL...");
    try {
      finalContent = await new Promise((resolve, reject) => {
        const https = require("https");
        https
          .get(source, (res: any) => {
            if (res.statusCode !== 200) {
              reject(new Error(`Status Code: ${res.statusCode}`));
              return;
            }
            let data = "";
            res.on("data", (chunk: any) => (data += chunk));
            res.on("end", () => resolve(data));
          })
          .on("error", reject);
      });
    } catch (e: any) {
      console.error(`❌ Failed to fetch URL: ${e.message}`);
      return;
    }
  } else {
    // Treat as local file
    const localPath = path.resolve(source); // Support relative paths

    if (!fs.existsSync(localPath)) {
      console.error(`❌ File not found: ${localPath}`);
      return;
    }

    // Validation check for .md
    if (!source.toLowerCase().endsWith(".md")) {
      console.log("⚠️  Warning: Source file does not have .md extension.");
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: "Continue anyway?",
          default: false,
        },
      ]);
      if (!confirm) return;
    }
    finalContent = fs.readFileSync(localPath, "utf-8");
  }

  if (finalContent && finalContent.trim().length > 0) {
    // Ensure frontmatter exists if imported from raw text
    if (!finalContent.includes(`name: ${answers.name}`)) {
      const header = `---\nname: ${answers.name}\ndescription: ${answers.description}\n---\n\n`;
      if (!finalContent.startsWith("---")) {
        finalContent = header + finalContent;
      }
    }

    fs.writeFileSync(filePath, finalContent);
    console.log(`\n✅ Skill file saved to: skills/${fileName}`);
    updateRegistry(fileName, answers.name, answers.description);
  } else {
    console.log(
      "\n⚠️  No content provided or empty source. Skill creation cancelled.",
    );
  }
}

function updateRegistry(fileName: string, name: string, desc: string) {
  let content = "";
  if (fs.existsSync(REGISTRY_FILE)) {
    content = fs.readFileSync(REGISTRY_FILE, "utf-8");
  } else {
    content = "# Installed Skills Registry\n\n## Added Skills\n";
  }

  // Check if already in registry
  if (content.includes(fileName)) {
    console.log("ℹ️ Registry already contains this skill reference.");
  } else {
    // Append
    const entry = `- **${name}**: \`skills/${fileName}\` (${desc})`;

    // Ensure we append to correct section or just EOF
    if (!content.endsWith("\n")) content += "\n";
    content += `${entry}\n`;

    fs.writeFileSync(REGISTRY_FILE, content);
    console.log("✅ Registry updated!");
  }
}

main();
