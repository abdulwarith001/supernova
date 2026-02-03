import { AgentResponse, Message, Thought } from "../types";
import { BrainService } from "./brain.service";
import { StateService } from "./state.service";
import { WatcherService } from "./watcher.service";
import { getCognitiveSystemPrompt } from "./prompts";
import { SchedulerService, Spark } from "./scheduler.service";
import { GoogleService } from "./google.service";
import { ResumeService } from "./resume.service";
import fs from "fs";
import path from "path";
import os from "os";
import { exec, execSync } from "child_process";
import util from "util";
import clipboardy from "clipboardy";
import notifier from "node-notifier";
import { decrypt, encrypt } from "../utils/crypto";
import { parseSkillManifest } from "../utils/parser";
import { ContextService } from "./context.service";
import { SessionService } from "./session.service";
const execPromise = util.promisify(exec);

export class AgentService {
  private brain: BrainService;
  private state: StateService;
  private watcher: WatcherService;
  private workspaceDir: string;
  private env: NodeJS.ProcessEnv = {};
  private persona: string = "default";
  private google: GoogleService;
  private resume: ResumeService;
  public scheduler: SchedulerService;
  private contextManager: ContextService;
  public session: SessionService;

  constructor(
    apiKey: string,
    model: string = "gpt-4o",
    onReminder?: (job: Spark) => void,
  ) {
    // 1. Initialize Workspace First (Required for other services)
    this.workspaceDir = path.join(os.homedir(), "supernova_workspace");
    if (!fs.existsSync(this.workspaceDir)) {
      try {
        fs.mkdirSync(this.workspaceDir, { recursive: true });
        console.log(`Created workspace directory at: ${this.workspaceDir}`);
      } catch (e) {
        console.error("Failed to create workspace directory:", e);
      }
    }

    // 1.1 Initialize Memory Files (BOOTSTRAP, IDENTITY, USER, SOUL)
    const memoryDir = path.join(this.workspaceDir, "memory");
    const userDir = path.join(memoryDir, "user");
    const agentDir = path.join(memoryDir, "agent");
    const identityPath = path.join(agentDir, "IDENTITY.md");
    const userPath = path.join(userDir, "USER.md");
    const soulPath = path.join(agentDir, "SOUL.md");
    const mindPath = path.join(agentDir, "MIND.md");
    const bootstrapPath = path.join(agentDir, "BOOTSTRAP.md");

    if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
    if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true });

    // MIGRATION: Move old root files to /agent/
    const oldRootPaths = {
      "IDENTITY.md": path.join(memoryDir, "IDENTITY.md"),
      "SOUL.md": path.join(memoryDir, "SOUL.md"),
      "BOOTSTRAP.md": path.join(memoryDir, "BOOTSTRAP.md"),
    };

    for (const [name, oldPath] of Object.entries(oldRootPaths)) {
      const newPath = path.join(agentDir, name);
      if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
        try {
          fs.renameSync(oldPath, newPath);
          console.log(`Migrated ${name} to: ${newPath}`);
        } catch (e) {
          console.error(`Failed to migrate ${name}:`, e);
        }
      }
    }

    const initFile = (targetPath: string, templateName: string) => {
      if (!fs.existsSync(targetPath)) {
        const templatePath = path.join(
          process.cwd(),
          "templates",
          templateName,
        );
        if (fs.existsSync(templatePath)) {
          fs.writeFileSync(
            targetPath,
            fs.readFileSync(templatePath, "utf-8"),
            "utf-8",
          );
          console.log(`Initialized ${templateName} at: ${targetPath}`);
        }
      }
    };

    if (!fs.existsSync(identityPath)) {
      initFile(bootstrapPath, "BOOTSTRAP.md");
    }

    initFile(userPath, "USER.md");
    initFile(identityPath, "IDENTITY.md");
    initFile(soulPath, "SOUL.md");
    initFile(mindPath, "MIND.md");

    // 2. Initialize env
    this.env = { ...process.env };
    console.log("DEBUG: AgentService initialized this.env", typeof this.env);

    // 3. Initialize Services
    this.brain = new BrainService(apiKey, undefined, model);
    this.state = new StateService(
      path.join(this.workspaceDir, "memory", "agent", "history.json"),
    );
    this.watcher = new WatcherService();
    this.google = new GoogleService();
    this.resume = new ResumeService();
    this.scheduler = new SchedulerService(
      this.workspaceDir,
      this.google,
      onReminder,
    );
    this.contextManager = new ContextService(this.workspaceDir);
    this.session = new SessionService(this, this.workspaceDir);
    this.session.startLife();

    // Connect Hive Mind (Spark Engine)
    this.scheduler.setSession(this.session);

    // Start Watcher with Signal-to-Noise Filtering
    this.watcher.watchDirectory(this.workspaceDir, (event, filename) => {
      // 🕵️ Filter Noise: Ignore internal agent files and system junk
      const isInternal =
        filename.startsWith("memory") ||
        filename.includes(".DS_Store") ||
        filename === "reminders.json" ||
        filename.startsWith(".git");

      if (!isInternal) {
        this.state.addNotification(`File ${event}: ${filename}`);
      }
    });

    // Load & Decrypt Configuration
    const CONFIG_FILE = path.join(os.homedir(), ".supernova", "config.json");
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));

        // Load Persona
        if (config.SELECTED_PERSONA) {
          this.persona = config.SELECTED_PERSONA;
        }

        // --- Dynamic Secret Injection ---
        const skillsDir = path.join(process.cwd(), "skills");
        if (fs.existsSync(skillsDir)) {
          const files = fs
            .readdirSync(skillsDir)
            .filter((f) => f.endsWith(".md"));
          for (const file of files) {
            const content = fs.readFileSync(
              path.join(skillsDir, file),
              "utf-8",
            );
            const manifest = parseSkillManifest(content);
            if (manifest?.secrets) {
              for (const secret of manifest.secrets) {
                if (config[secret.name]) {
                  try {
                    this.env[secret.name] = decrypt(config[secret.name]);
                    console.log(`🔓 Loaded secret: ${secret.name}`);
                  } catch (e: any) {
                    console.warn(
                      `⚠️ Failed to decrypt secret ${secret.name}: ${e.message}`,
                    );
                    // Fallback to raw value if it doesn't look like encrypted or if it's an email
                    if (
                      config[secret.name].length < 32 ||
                      secret.name.includes("EMAIL")
                    ) {
                      this.env[secret.name] = config[secret.name];
                      console.log(
                        `📂 Loaded raw secret (fallback): ${secret.name}`,
                      );
                    } else {
                      console.warn(
                        `Skipping fallback for ${secret.name} as it appears to be an encrypted string that failed to decrypt.`,
                      );
                    }
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.error("Failed to load secure config:", e);
      }
    }

    // 4. Initial Protection Pass
    this.protectMemoryFiles();
  }

  private protectMemoryFiles() {
    const memoryFiles = [
      path.join(this.workspaceDir, "memory", "user", "USER.md"),
      path.join(this.workspaceDir, "memory", "agent", "IDENTITY.md"),
      path.join(this.workspaceDir, "memory", "agent", "SOUL.md"),
      path.join(this.workspaceDir, "memory", "agent", "MIND.md"),
      path.join(this.workspaceDir, "memory", "agent", "BOOTSTRAP.md"),
      path.join(this.workspaceDir, "memory", "agent", "history.json"),
    ];

    for (const file of memoryFiles) {
      if (fs.existsSync(file)) {
        this.setFileImmutable(file, true);
      }
    }
  }

  private isProtectedPath(filePath: string): boolean {
    const normalized = path.normalize(filePath);
    const relative = path.relative(this.workspaceDir, normalized);
    return (
      (relative.startsWith(path.join("memory", "agent")) ||
        relative.startsWith(path.join("memory", "user"))) &&
      (normalized.endsWith(".md") || normalized.endsWith(".json"))
    );
  }

  private setFileImmutable(filePath: string, immutable: boolean) {
    try {
      if (process.platform === "darwin") {
        const flag = immutable ? "uchg" : "nouchg";
        execSync(`chflags ${flag} "${filePath}"`);
      } else {
        // Fallback for Linux/Windows: chmod -w / +w
        const mode = immutable ? 0o444 : 0o644;
        fs.chmodSync(filePath, mode);
      }
    } catch (e) {
      console.error(
        `Failed to set immutable flag (${immutable}) on ${filePath}:`,
        e,
      );
    }
  }

  public destroy() {
    console.log("🛑 Destroying AgentService instance...");
    this.scheduler.destroy();
    this.watcher.stopAll();
  }

  public getApiKey(): string {
    return this.brain.getApiKey();
  }

  public getModel(): string {
    return this.brain.getModel();
  }

  public getNotificationEmail(): string | undefined {
    return (
      this.env["REMINDER_EMAIL"] ||
      this.env["EMAIL"] ||
      this.env["REMINDER_NOTIFICATION_EMAIL"]
    );
  }

  private loadSkills(): string {
    try {
      const skillsDir = path.join(process.cwd(), "skills");
      if (!fs.existsSync(skillsDir)) return "No skills installed.";

      const manifestPath = path.join(skillsDir, "skills.json");
      let skillManifest: any[] = [];
      if (fs.existsSync(manifestPath)) {
        skillManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      }

      const items = fs.readdirSync(skillsDir, { withFileTypes: true });
      let allSkills = "Available Skills (Summaries):\n";
      let count = 0;

      for (const item of items) {
        if (item.isDirectory()) {
          const skillFilePath = path.join(skillsDir, item.name, "SKILL.md");
          if (fs.existsSync(skillFilePath)) {
            // Find description from manifest if available
            const manifestEntry = skillManifest.find(
              (s: any) =>
                s.name.toLowerCase() === item.name.replace(/_/g, " ") ||
                s.path.includes(item.name),
            );
            const description =
              manifestEntry?.description || "No description available.";
            allSkills += `- ${item.name}: ${description} (Use 'get_skill_details' with skill_name: '${item.name}' for full instructions)\n`;
            count++;
          }
        }
      }

      return count > 0 ? allSkills : "No skills with SKILL.md found.";
    } catch (e) {
      console.error("Failed to load skills:", e);
      return "Error loading skills.";
    }
  }

  async run(
    prompt: string,
    history: Message[],
    onLog?: (msg: string) => void,
    noRetries: boolean = false,
  ): Promise<AgentResponse> {
    const sendLog = (msg: string) => onLog && onLog(msg);

    // 1. Observe (Update State)
    this.state.updateHistory({ role: "user", content: prompt });

    // Show notifications from watcher
    const notifications = this.state.getNotifications();
    notifications.forEach((n) => sendLog(`🔔 Notification: ${n}`));

    sendLog(`🧠 Thinking...`);

    // 4. Meditate (Fact Extraction & History Purging) if too long
    const historyToKeep = 20;
    const currentHistory = this.state.getHistory();
    if (currentHistory.length > historyToKeep + 10) {
      this.meditate();
    }

    let turns = 0;
    const maxTurns = 15; // OODA Loop Limit

    while (turns < maxTurns) {
      turns++;

      // 2. Orient & Decide (Brain)
      const fragments = await this.contextManager.assembleContext({
        history: this.state.getHistory(),
        userProfile: this.loadUser(),
        identity: this.loadMemoryFile("IDENTITY.md"),
        soul: this.loadMemoryFile("SOUL.md"),
        mind: this.loadMemoryFile("MIND.md"),
        bootstrap: this.loadMemoryFile("BOOTSTRAP.md"),
        skills: this.loadSkills(),
      });

      const context = {
        history: this.state.getHistory(),
        workingMemory: this.state.getWorkingMemory(),
        contextSummary: this.state.getSummary(),
        skills: this.loadSkills(),
        systemPrompt: getCognitiveSystemPrompt({
          skills: this.loadSkills(),
          persona: this.persona,
          currentDate: new Date().toLocaleString(),
          workspaceDir: this.workspaceDir,
          profilePath: path.join(
            this.workspaceDir,
            "memory",
            "user",
            "USER.md",
          ),
          envKeys: Object.keys(this.env),
        }),
        fragments,
        noRetries,
      };

      const thought: Thought = await this.brain.think(context);

      // Log reasoning with Persona Flavor
      if (thought.reasoning) {
        let prefix = "💭 Thinking...";
        if (this.persona === "butler") prefix = "🎩 Very well, Sir:";
        if (this.persona === "pirate") prefix = "🏴‍☠️ Scallywag Thoughts:";
        if (this.persona === "romantic") prefix = "❤️ Romantic Reflection:";
        if (this.persona === "wild") prefix = "👹 Wild Instinct:";
        if (this.persona === "local") prefix = "🇳🇬 Local Gist:";
        if (this.persona === "fun") prefix = "🥳 Playful Thought:";

        sendLog(`${prefix} ${thought.reasoning}`);
      }

      // Log & Update Plan
      if (thought.plan && thought.plan.length > 0) {
        this.state.updateWorkingMemory(thought.plan.join(" -> "));
        sendLog(`📋 Plan: ${thought.plan.join(" ➔ ")}`);
      }

      // 3. Act
      if (thought.error) {
        sendLog(`❌ Error: ${thought.error}`);
        this.session.stimulus("failure");
        return { reply: thought.reply || "I encountered an error." };
      }

      // Handle Action FIRST if present
      if (thought.action) {
        const action = thought.action;

        if (!action.name) {
          sendLog("❌ Error: Action requested without a name.");
          this.state.updateHistory({
            role: "assistant",
            content:
              "Error: You requested an action but did not specify the 'name' field.",
          });
        } else {
          // Sanitize Action Name (OpenAI regex requirement)
          action.name = action.name.replace(/[^a-zA-Z0-9_-]/g, "_");

          sendLog(
            `⚡ Action: ${action.name} (${JSON.stringify(action.arguments)})`,
          );

          // Execute Tool
          let result = "";
          try {
            result = await this.executeTool(action, sendLog);
          } catch (e: any) {
            result = `Error executing tool: ${e.message}`;
            this.session.stimulus("failure");
          }

          this.state.updateHistory({
            role: "assistant",
            content: thought.reply || null, // Keep the reply if provided!
            function_call: {
              name: action.name,
              arguments: JSON.stringify(action.arguments || {}),
            },
          });

          if (result) {
            this.state.updateHistory({
              role: "function",
              name: action.name,
              content: result,
            });
            this.session.stimulus("success");
          }
        }

        // If the model also provided a reply, it's already saved to history in the assistant turn above.
        // We continue the OODA loop so the model can generate a final communicative response
        // after processing the action result.
        continue;
      }

      // If NO action, just handle the reply
      if (thought.reply) {
        this.state.updateHistory({ role: "assistant", content: thought.reply });
        this.session.stimulus("chat");
        return { reply: thought.reply };
      }

      // If we reach here, the model returned a JSON but it lacked both 'reply' and 'action'
      sendLog(
        "⚠️ System: I'm having trouble deciding on the next step. I'll try one more time with more focus.",
      );
      this.state.updateHistory({
        role: "system",
        content:
          "Error: You must provide either a 'reply' to the user OR an 'action' to execute. Do not return empty thoughts.",
      });
    }

    return {
      reply:
        "I've reached my thinking limit (15 turns) or I'm unable to decide on the next action. Please try rephrasing your request.",
    };
  }

  public async meditate() {
    console.log("🧘 [MEDITATION] Entering deep reflection cycle...");
    const history = this.state.getHistory();
    const messagesToProcess = history.slice(0, 10);

    const memoryDir = path.join(this.workspaceDir, "memory");
    const userPath = path.join(memoryDir, "user", "USER.md");
    const soulPath = path.join(memoryDir, "agent", "SOUL.md");
    const identityPath = path.join(memoryDir, "agent", "IDENTITY.md");

    // 1. Read Current Context
    const currentContext = {
      user: fs.existsSync(userPath) ? fs.readFileSync(userPath, "utf-8") : "",
      soul: fs.existsSync(soulPath) ? fs.readFileSync(soulPath, "utf-8") : "",
      identity: fs.existsSync(identityPath)
        ? fs.readFileSync(identityPath, "utf-8")
        : "",
    };

    // 2. Extract and Merge Facts
    const updates = await this.brain.extractFacts(
      messagesToProcess,
      currentContext,
    );

    // 3. Apply Updates (Full Overwrite for structure preservation)
    const writeIfDefined = (filePath: string, content: string | undefined) => {
      if (content && content.trim() !== "" && content !== "Empty") {
        try {
          const isProtected = this.isProtectedPath(filePath);
          if (isProtected) this.setFileImmutable(filePath, false);
          fs.writeFileSync(filePath, content, "utf-8");
          if (isProtected) this.setFileImmutable(filePath, true);
          console.log(`✨ [MEDITATION] Updated ${path.basename(filePath)}.`);
        } catch (e) {
          console.error(`Failed to update ${path.basename(filePath)}:`, e);
        }
      }
    };

    writeIfDefined(userPath, updates.user_md);
    writeIfDefined(soulPath, updates.soul_md);
    writeIfDefined(identityPath, updates.identity_md);

    // 4. Summarize and Purge
    const currentSummary = this.state.getSummary();
    const newSummary = await this.brain.summarize(
      messagesToProcess,
      currentSummary,
    );
    this.state.updateSummary(newSummary);
    this.state.trimHistory(10);

    console.log("🕉️ [MEDITATION] Context consolidated and memory refined.");
  }

  private loadMemoryFile(filename: string): string | undefined {
    try {
      // Check in /agent/ first, then fallback to root /memory/
      const agentPath = path.join(
        this.workspaceDir,
        "memory",
        "agent",
        filename,
      );
      const rootPath = path.join(this.workspaceDir, "memory", filename);
      const filePath = fs.existsSync(agentPath) ? agentPath : rootPath;

      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, "utf-8");
      }
    } catch (e) {
      console.error(`Failed to load ${filename}:`, e);
    }
    return undefined;
  }

  private loadUser(): string {
    try {
      const userPath = path.join(
        this.workspaceDir,
        "memory",
        "user",
        "USER.md",
      );
      if (fs.existsSync(userPath)) {
        return fs.readFileSync(userPath, "utf-8");
      }
      return "No user profile available yet.";
    } catch (e) {
      console.error("Failed to load user profile:", e);
      return "Error loading user profile.";
    }
  }

  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.workspaceDir, filePath);
  }

  private async executeTool(
    action: any,
    sendLog: (msg: string) => void,
  ): Promise<string> {
    const { name, arguments: args } = action;

    // Skill Guard: Prevent calling skills as tools
    const skillsDir = path.join(process.cwd(), "skills");
    if (fs.existsSync(path.join(skillsDir, name, "SKILL.md"))) {
      return `Error: '${name}' is a skill, not a tool. You MUST use 'get_skill_details' with skill_name: '${name}' to retrieve the actual tool schemas and instructions first.`;
    }

    // Memory tools removed in favor of Soul Protocol (Direct SOUL.md interaction)

    if (name === "create_skill") {
      const skillNameSlug = args.name.toLowerCase().replace(/\s+/g, "_");
      const skillsDir = path.join(process.cwd(), "skills", skillNameSlug);
      if (!fs.existsSync(skillsDir))
        fs.mkdirSync(skillsDir, { recursive: true });

      const skillPath = path.join(skillsDir, "SKILL.md");

      const templatePath = path.join(process.cwd(), "templates", "SKILL.md");
      let content = "";
      if (fs.existsSync(templatePath)) {
        content = fs
          .readFileSync(templatePath, "utf-8")
          .replace("{{name}}", args.name)
          .replace("{{description}}", args.description)
          .replace("{{instructions}}", args.instructions);
      } else {
        // Fallback if template missing
        content = `---\nname: ${args.name}\ndescription: ${args.description}\n---\n\n${args.instructions}`;
      }

      fs.writeFileSync(skillPath, content);

      // Update manifest
      const manifestPath = path.join(process.cwd(), "skills", "skills.json");
      let manifest = [];
      if (fs.existsSync(manifestPath)) {
        manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      }

      // Update or add entry
      const existingIndex = manifest.findIndex((s: any) =>
        s.path.includes(skillNameSlug),
      );
      const entry = {
        name: args.name,
        description: args.description,
        path: `skills/${skillNameSlug}/SKILL.md`,
      };

      if (existingIndex >= 0) {
        manifest[existingIndex] = entry;
      } else {
        manifest.push(entry);
      }

      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      return `New skill '${args.name}' created in folder '${skillNameSlug}/SKILL.md' and added to manifest.`;
    }

    if (name === "get_skill_details") {
      // args.skill_name could be the folder name or the full path
      const folderName = args.skill_name.replace("skills/", "").split("/")[0];
      const skillPath = path.join(
        process.cwd(),
        "skills",
        folderName,
        "SKILL.md",
      );

      if (!fs.existsSync(skillPath)) {
        return `Skill folder '${folderName}' does not contain a SKILL.md file.`;
      }
      return fs.readFileSync(skillPath, "utf-8");
    }

    // --- System / Shell Tools ---
    if (name === "run_command") {
      try {
        // Inject env with secrets into the shell execution
        const { stdout, stderr } = await execPromise(args.command, {
          cwd: this.workspaceDir,
          env: this.env,
        });
        return stdout || stderr || "Command executed with no output.";
      } catch (e: any) {
        return `Command failed: ${e.message}\nStderr: ${e.stderr}`;
      }
    }

    if (name === "get_system_info") {
      return `OS: ${os.type()} ${os.release()} (${os.arch()})\nMemory: ${os.totalmem()} bytes\nWorkspace: ${this.workspaceDir}`;
    }

    if (name === "get_current_time") {
      return new Date().toLocaleString();
    }

    // --- File System Tools ---
    if (name === "read_file") {
      const p = this.resolvePath(args.path);
      if (!fs.existsSync(p)) return "File not found.";
      const stats = fs.statSync(p);
      const maxSize = 100 * 1024; // 100KB safety cap

      if (stats.size > maxSize) {
        const content = fs.readFileSync(p, "utf-8").substring(0, maxSize);
        return `⚠️ [TRUNCATED] File is too large (${(stats.size / 1024).toFixed(1)}KB). Showing first 100KB:\n\n${content}`;
      }
      return fs.readFileSync(p, "utf-8");
    }

    if (name === "write_file") {
      const p = this.resolvePath(args.path);
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      if (args.append) {
        let contentToAppend = args.content;
        const isProtected = this.isProtectedPath(p);
        if (isProtected) this.setFileImmutable(p, false);

        if (fs.existsSync(p)) {
          const currentContent = fs.readFileSync(p, "utf-8");
          if (currentContent && !currentContent.endsWith("\n")) {
            contentToAppend = "\n" + contentToAppend;
          }
        }
        fs.appendFileSync(p, contentToAppend, "utf-8");
        if (isProtected) this.setFileImmutable(p, true);
        return `Content appended to ${p}`;
      } else {
        const isProtected = this.isProtectedPath(p);
        if (isProtected) this.setFileImmutable(p, false);
        fs.writeFileSync(p, args.content, "utf-8");
        if (isProtected) this.setFileImmutable(p, true);
        return `File written to ${p}`;
      }
    }

    if (name === "move_file") {
      const src = this.resolvePath(args.source);
      const dest = this.resolvePath(args.destination);
      if (!fs.existsSync(src)) return "Source file not found.";
      if (this.isProtectedPath(src)) {
        return `Error: Cannot move protected memory file ${src}. These files are essential for system integrity.`;
      }
      fs.renameSync(src, dest);
      return `Moved ${src} to ${dest}`;
    }

    if (name === "copy_file") {
      const src = this.resolvePath(args.source);
      const dest = this.resolvePath(args.destination);
      if (!fs.existsSync(src)) return "Source file not found.";
      fs.copyFileSync(src, dest);
      return `Copied ${src} to ${dest}`;
    }

    if (name === "delete_file") {
      const p = this.resolvePath(args.path);
      if (!fs.existsSync(p)) return "File not found.";
      if (this.isProtectedPath(p)) {
        return `Error: Cannot delete protected memory file ${p}. These files are essential for system integrity.`;
      }
      fs.unlinkSync(p);
      return `Deleted ${p}`;
    }

    if (name === "make_directory") {
      const p = this.resolvePath(args.path);
      fs.mkdirSync(p, { recursive: true });
      return `Directory created at ${p}`;
    }

    if (name === "list_directory") {
      const p = this.resolvePath(args.path || ".");
      if (!fs.existsSync(p)) return "Directory not found.";
      const files = fs.readdirSync(p);
      const total = files.length;
      const limitedFiles = files.slice(0, 50);

      let output =
        `Files in ${p} (Total: ${total}):\n` + limitedFiles.join("\n");
      if (total > 50) {
        output += `\n... and ${total - 50} more items.`;
      }
      return output;
    }

    // --- App / Desktop Tools ---
    if (name === "open_app") {
      // macOS specific for now
      if (process.platform === "darwin") {
        await execPromise(`open -a "${args.app_name}"`);
        return `Opened ${args.app_name}`;
      }
      return "open_app is only supported on macOS for now.";
    }

    if (name === "close_app") {
      // macOS specific
      if (process.platform === "darwin") {
        await execPromise(`osascript -e 'quit app "${args.app_name}"'`);
        return `Closed ${args.app_name}`;
      }
      return "close_app is only supported on macOS for now.";
    }

    if (name === "get_clipboard_content") {
      try {
        return clipboardy.readSync();
      } catch (e) {
        return "Failed to read clipboard.";
      }
    }

    if (name === "set_clipboard_content") {
      try {
        clipboardy.writeSync(args.content);
        return "Clipboard updated.";
      } catch (e) {
        return "Failed to write to clipboard.";
      }
    }

    if (name === "send_notification") {
      notifier.notify({
        title: args.title,
        message: args.message,
      });
      return "Notification sent.";
    }

    if (name === "list_calendar_events") {
      if (!this.google.isCalendarEnabled())
        return "Calendar integration is disabled. Enable it with 'supernova setup calendar'.";
      try {
        const events = await this.google.listCalendarEvents(args.timeMin);
        return JSON.stringify(events, null, 2);
      } catch (e: any) {
        return `Calendar error: ${e.message}`;
      }
    }

    if (name === "create_calendar_event") {
      if (!this.google.isCalendarEnabled())
        return "Calendar integration is disabled. Enable it with 'supernova setup calendar'.";
      try {
        const event = await this.google.createCalendarEvent({
          summary: args.summary,
          description: args.description,
          start: { dateTime: args.start },
          end: { dateTime: args.end },
        });
        return `Event created: ${event.htmlLink}`;
      } catch (e: any) {
        return `Calendar error: ${e.message}`;
      }
    }

    if (name === "search_emails") {
      if (!this.google.isEmailEnabled())
        return "Email integration is disabled. Enable it with 'supernova setup email'.";
      try {
        const emails = await this.google.searchEmails(args.query);
        return JSON.stringify(emails, null, 2);
      } catch (e: any) {
        return `Gmail error: ${e.message}`;
      }
    }

    if (name === "read_email") {
      if (!this.google.isEmailEnabled())
        return "Email integration is disabled. Enable it with 'supernova setup email'.";
      try {
        const email = await this.google.readEmail(args.id, args.format);
        return JSON.stringify(email, null, 2);
      } catch (e: any) {
        return `Gmail error: ${e.message}`;
      }
    }

    if (name === "send_email") {
      if (!this.google.isEmailEnabled())
        return "Email integration is disabled. Enable it with 'supernova setup email'.";
      try {
        console.log(
          `📧 AGENT SENDING EMAIL: To: ${args.to}, Subject: ${args.subject}`,
        );
        await this.google.sendEmail(args.to, args.subject, args.body);
        return `Email successfully sent to ${args.to}`;
      } catch (e: any) {
        return `Gmail error: ${e.message}`;
      }
    }

    if (name === "trash_email") {
      if (!this.google.isEmailEnabled())
        return "Email integration is disabled. Enable it with 'supernova setup email'.";
      try {
        await this.google.trashEmail(args.id);
        return `Email ${args.id} moved to trash.`;
      } catch (e: any) {
        return `Gmail error: ${e.message}`;
      }
    }

    if (name === "archive_email") {
      if (!this.google.isEmailEnabled())
        return "Email integration is disabled. Enable it with 'supernova setup email'.";
      try {
        await this.google.archiveEmail(args.id);
        return `Email ${args.id} archived.`;
      } catch (e: any) {
        return `Gmail error: ${e.message}`;
      }
    }

    if (name === "modify_email_labels") {
      if (!this.google.isEmailEnabled())
        return "Email integration is disabled. Enable it with 'supernova setup email'.";
      try {
        await this.google.modifyEmailLabels(
          args.id,
          args.addLabels,
          args.removeLabels,
        );
        return `Labels updated for email ${args.id}.`;
      } catch (e: any) {
        return `Gmail error: ${e.message}`;
      }
    }

    if (name === "untrash_email") {
      if (!this.google.isEmailEnabled())
        return "Email integration is disabled. Enable it with 'supernova setup email'.";
      try {
        await this.google.untrashEmail(args.id);
        return `Email ${args.id} recovered from trash.`;
      } catch (e: any) {
        return `Gmail error: ${e.message}`;
      }
    }

    if (name === "list_labels") {
      if (!this.google.isEmailEnabled())
        return "Email integration is disabled. Enable it with 'supernova setup email'.";
      try {
        const labels = await this.google.listLabels();
        return JSON.stringify(labels, null, 2);
      } catch (e: any) {
        return `Gmail error: ${e.message}`;
      }
    }

    if (name === "create_draft") {
      if (!this.google.isEmailEnabled())
        return "Email integration is disabled. Enable it with 'supernova setup email'.";
      try {
        const draft = await this.google.createDraft(
          args.to,
          args.subject,
          args.body,
          args.threadId,
        );
        return `Draft created successfully (ID: ${draft.id}).`;
      } catch (e: any) {
        return `Gmail error: ${e.message}`;
      }
    }

    if (name === "list_drafts") {
      if (!this.google.isEmailEnabled())
        return "Email integration is disabled. Enable it with 'supernova setup email'.";
      try {
        const drafts = await this.google.listDrafts();
        return JSON.stringify(drafts, null, 2);
      } catch (e: any) {
        return `Gmail error: ${e.message}`;
      }
    }

    if (name === "send_draft") {
      if (!this.google.isEmailEnabled())
        return "Email integration is disabled. Enable it with 'supernova setup email'.";
      try {
        await this.google.sendDraft(args.id);
        return `Draft ${args.id} sent successfully.`;
      } catch (e: any) {
        return `Gmail error: ${e.message}`;
      }
    }

    if (name === "reply_to_email") {
      if (!this.google.isEmailEnabled())
        return "Email integration is disabled. Enable it with 'supernova setup email'.";
      try {
        await this.google.replyToEmail(args.threadId, args.body);
        return `Reply sent to thread ${args.threadId}.`;
      } catch (e: any) {
        return `Gmail error: ${e.message}`;
      }
    }

    if (name === "analyze_resume") {
      try {
        const text = await this.resume.extractText(args.path);
        const analysis = await this.resume.parseResume(text, this.brain);
        return `Resume parsed successfully. Summary:\n${JSON.stringify(analysis, null, 2)}`;
      } catch (e: any) {
        return `Resume parsing error: ${e.message}`;
      }
    }

    if (name === "search_jobs") {
      // For now, leverage existing run_command or browse skill
      // But we'll provide a cleaner search query
      const query = `site:linkedin.com/jobs OR site:indeed.com/jobs OR site:glassdoor.com ${args.query}`;
      return `Searching for jobs with query: ${query}\nPlease use the 'browse' skill or 'run_command' with 'curl' to fetch results. (Implementation in progress)`;
    }

    if (name === "draft_job_application") {
      const prompt = `
        Draft a hyper-tailored cover letter for the following job:
        Company: ${args.company}
        Description: ${args.job_description}
        
        Use my professional background stored in memory to make it personal.
      `;
      const thought = await this.brain.think({
        systemPrompt:
          "You are a world-class career coach. Draft compelling, concise cover letters.",
        history: [{ role: "user", content: prompt }],
        workingMemory: "",
        skills: "",
      });
      return thought.reply || "Failed to generate draft.";
    }

    if (name === "draft_social_post") {
      const topic = args.topic;
      const platform = args.platform || "linkedin";

      const prompt = `You are a professional Ghostwriter.
Task: Write a high-engagement social media post for ${platform}.
Topic: ${topic}
Style: Professional, insightful, slightly provocative (in a thought leadership way).
Format: Return ONLY the post text. No "Here is the post" preamble.`;

      const thought = await this.brain.think({
        history: [{ role: "user", content: prompt }],
        workingMemory: "Drafting social media content",
        skills: "Copywriting, Content Marketing",
      });

      const draft = thought.reply || "Draft generation failed.";
      const filename = `draft_${platform}_${Date.now()}.md`;
      const draftPath = path.join(
        this.workspaceDir,
        "content_drafts",
        filename,
      );

      if (!fs.existsSync(path.dirname(draftPath))) {
        fs.mkdirSync(path.dirname(draftPath), { recursive: true });
      }
      fs.writeFileSync(draftPath, draft);

      return `✅ Draft created at ${draftPath}\n\n${draft}`;
    }

    if (name === "create_reminder") {
      try {
        let dueAt: number | undefined = undefined;
        if (args.dueAt) {
          const currentYear = new Date().getFullYear();
          let targetDate = new Date(args.dueAt);

          // Robust Year Sanity Check
          if (
            isNaN(targetDate.getTime()) ||
            targetDate.getFullYear() < currentYear
          ) {
            console.log(
              `⚠️ Correcting year/invalid date from ${args.dueAt} to ${currentYear}`,
            );
            if (!isNaN(targetDate.getTime())) {
              targetDate.setFullYear(currentYear);
            } else {
              throw new Error("Invalid date format. Please use ISO 8601.");
            }
          }
          // Compensatory fix: Subtract 1 hour
          dueAt = targetDate.getTime() - 3600000;
        }

        // Helper: Convert informal repeat strings to simple cron
        let cronExpression = args.repeat;
        if (cronExpression) {
          const lower = cronExpression.toLowerCase();
          // Handle "every X minutes"
          const minuteMatch = lower.match(/every (\d+) minutes?/);
          const hourMatch = lower.match(/every (\d+) hours?/);

          if (minuteMatch) {
            cronExpression = `*/${minuteMatch[1]} * * * *`;
          } else if (hourMatch) {
            cronExpression = `0 */${hourMatch[1]} * * *`;
          } else if (lower.includes("minute")) {
            cronExpression = "* * * * *";
          } else if (lower.includes("hour")) {
            cronExpression = "0 * * * *";
          } else if (lower.includes("daily") || lower.includes("day")) {
            cronExpression = "0 9 * * *";
          } else if (lower.includes("weekly") || lower.includes("week")) {
            cronExpression = "0 9 * * 1";
          }
        }

        // SMART DETECTION: If the message looks like an action, force autoExecute
        // SMART DETECTION: If the message looks like an action, force autoExecute
        let autoExecute = args.autoExecute;
        let taskPrompt = args.taskPrompt;

        // Validation / Fallback: If message missing but taskPrompt exists, use taskPrompt as message
        if (!args.message && taskPrompt) {
          args.message = taskPrompt;
        }

        const msg = (args.message || "").toLowerCase();

        // Expanded action keywords
        const actionKeywords = [
          "fetch",
          "get",
          "search",
          "send",
          "check",
          "read",
          "email",
          "news",
          "update",
          "find",
          "notify",
          "tell",
          "browse",
          "scan",
          "analyze",
        ];

        if (
          !autoExecute &&
          (actionKeywords.some((k) => msg.includes(k)) || taskPrompt)
        ) {
          console.log(
            `🤖 Smart Discovery: Treating "${args.message}" as an Autonomous Task.`,
          );
          autoExecute = true;
          if (!taskPrompt) taskPrompt = args.message;
        }

        const result = await this.scheduler.createReminder(
          args.message,
          dueAt,
          {
            cronExpression,
            autoExecute,
            taskPrompt,
          },
        );

        if (result.isDuplicate) {
          return `⚠️ A reminder matches this time exactly ("${args.message}"). Please ask the user if they want to reschedule or keep it.`;
        }

        const timeStr = dueAt
          ? new Date(dueAt).toLocaleString()
          : cronExpression;
        return `✅ Reminder set (${timeStr}): "${args.message}" (ID: ${result.job.id}) ${args.autoExecute ? "[Auto-Execute Enabled]" : ""}`;
      } catch (e: any) {
        return `Failed to create reminder: ${e.message}`;
      }
    }

    if (name === "list_reminders") {
      const reminders = this.scheduler.listReminders(args.status);
      if (reminders.length === 0) return "No reminders found.";
      return JSON.stringify(reminders, null, 2);
    }

    if (name === "update_reminder") {
      const updates: any = {
        message: args.message,
        cronExpression: args.repeat,
        autoExecute: args.autoExecute,
        taskPrompt: args.taskPrompt,
      };
      if (args.dueAt) {
        const targetDate = new Date(args.dueAt);
        if (targetDate.getFullYear() < new Date().getFullYear()) {
          targetDate.setFullYear(new Date().getFullYear());
        }
        updates.dueAt = targetDate.getTime() - 3600000;
      }
      const updated = await this.scheduler.updateReminder(args.id, updates);
      if (!updated) return `Reminder with ID ${args.id} not found.`;
      return `✅ Reminder updated: ${JSON.stringify(updated)}`;
    }

    if (name === "delete_reminder") {
      const deleted = await this.scheduler.deleteReminder(args.id);
      if (!deleted) return `Reminder with ID ${args.id} not found.`;
      return `✅ Reminder deleted.`;
    }

    if (name === "update_config") {
      try {
        const configDir = path.join(os.homedir(), ".supernova");
        const configFile = path.join(configDir, "config.json");

        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }

        let config: any = {};
        if (fs.existsSync(configFile)) {
          try {
            config = JSON.parse(fs.readFileSync(configFile, "utf8"));
          } catch (e) {}
        }

        const key = args.key.toUpperCase();
        let valueToSave = args.value;

        if (args.isSecret) {
          try {
            valueToSave = encrypt(args.value);
          } catch (e) {
            console.error("Encryption failed, saving plain text");
          }
        }

        config[key] = valueToSave;
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

        // Update current process environment so it's usable immediately
        this.env[key] = args.value;
        process.env[key] = args.value;

        return `✅ Configuration updated: ${key} has been saved ${args.isSecret ? "(encrypted)" : ""}. It is now available in your environment.`;
      } catch (e: any) {
        return `Failed to update config: ${e.message}`;
      }
    }

    return "Unknown tool.";
  }
}
