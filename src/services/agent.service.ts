import { AgentResponse, Message, Thought } from "../types";
import { BrainService } from "./brain.service";
import { StateService } from "./state.service";
import { WatcherService } from "./watcher.service";
import { getCognitiveSystemPrompt } from "./prompts";
import { SchedulerService, Job } from "./scheduler.service";
import { GoogleService } from "./google.service";
import { ResumeService } from "./resume.service";
import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import util from "util";
import clipboardy from "clipboardy";
import notifier from "node-notifier";
import { decrypt } from "../utils/crypto";
import { parseSkillManifest } from "../utils/parser";
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

  constructor(
    apiKey: string,
    model: string = "gpt-4o",
    onReminder?: (job: Job) => void,
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

    // 2. Initialize env
    this.env = { ...process.env };
    console.log("DEBUG: AgentService initialized this.env", typeof this.env);

    // 3. Initialize Services
    this.brain = new BrainService(apiKey, undefined, model);
    this.state = new StateService();
    this.watcher = new WatcherService();
    this.google = new GoogleService();
    this.resume = new ResumeService();
    this.scheduler = new SchedulerService(
      this.workspaceDir,
      this.google,
      onReminder,
    );
    // Start Watcher
    this.watcher.watchDirectory(this.workspaceDir, (event, filename) => {
      this.state.addNotification(`File ${event}: ${filename}`);
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

      const files = fs.readdirSync(skillsDir).filter((f) => f.endsWith(".md"));
      let allSkills = "";

      for (const file of files) {
        const content = fs.readFileSync(path.join(skillsDir, file), "utf-8");
        allSkills += `\n--- FILE: ${file} ---\n${content}\n`;
      }

      return allSkills || "No skills installed.";
    } catch (e) {
      console.error("Failed to load skills:", e);
      return "";
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

    // 4. Summarize History if too long
    const historyToKeep = 20;
    const currentHistory = this.state.getHistory();
    if (currentHistory.length > historyToKeep + 10) {
      sendLog("📝 Summarizing conversation history to save context...");
      const messagesToSummarize = currentHistory.slice(0, 10);
      const summary = await this.brain.summarize(messagesToSummarize);
      this.state.updateSummary(
        (this.state.getSummary() || "") + "\n" + summary,
      );
      this.state.trimHistory(10);
      sendLog("✅ History summarized.");
    }

    let turns = 0;
    const maxTurns = 15; // OODA Loop Limit

    while (turns < maxTurns) {
      turns++;

      // 2. Orient & Decide (Brain)
      const context = {
        history: this.state.getHistory(),
        workingMemory: this.state.getWorkingMemory(),
        contextSummary: this.state.getSummary(),
        skills: this.loadSkills(), // Load skills if needed
        systemPrompt:
          getCognitiveSystemPrompt(
            this.loadSkills(),
            this.persona,
            new Date().toLocaleString(),
          ) +
          `\n\nYour dedicated workspace directory is: ${this.workspaceDir}. You have access to secure API keys via environment variables (e.g. SERPER_API_KEY) if configured.`,
        profile: this.state.getCoreContext(),
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
        return { reply: thought.reply || "I encountered an error." };
      }

      if (thought.reply) {
        this.state.updateHistory({ role: "assistant", content: thought.reply });
        return { reply: thought.reply };
      }

      if (thought.action) {
        const action = thought.action;

        if (!action.name) {
          sendLog("❌ Error: Action requested without a name.");
          this.state.updateHistory({
            role: "assistant",
            content:
              "Error: You requested an action but did not specify the 'name' field.",
          });
          continue;
        }

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
        }

        this.state.updateHistory({
          role: "assistant",
          content: null,
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
        }
        continue;
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

    // --- Memory Tools ---
    if (name === "remember_fact") {
      const mem = await this.state
        .getMemoryService()
        .addMemoryAsync(
          args.category,
          args.fact,
          args.description,
          args.importance || 5,
          args.tags,
        );
      return `Fact remembered: ${mem.fact} (ID: ${mem.id}, Importance: ${mem.importance})`;
    }

    if (name === "search_memory") {
      const results = await this.state
        .getMemoryService()
        .searchMemoriesSemantic(args.query);
      return `Found ${results.length} memories:\n${JSON.stringify(results.slice(0, 5), null, 2)}`;
    }

    if (name === "list_memories") {
      const results = this.state.getMemoryService().listMemories(args.category);
      return `Memories (${args.category || "all"}):\n${JSON.stringify(results.slice(0, 10), null, 2)}`;
    }

    if (name === "create_skill") {
      const skillsDir = path.join(process.cwd(), "skills");
      if (!fs.existsSync(skillsDir))
        fs.mkdirSync(skillsDir, { recursive: true });

      const skillPath = path.join(skillsDir, args.filename);
      const content = `---
name: ${args.name}
description: ${args.description}
---

${args.instructions}`;

      fs.writeFileSync(skillPath, content);
      return `New skill '${args.name}' created and saved to '${args.filename}'.`;
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
      return fs.readFileSync(p, "utf-8");
    }

    if (name === "write_file") {
      const p = this.resolvePath(args.path);
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(p, args.content);
      return `File written to ${p}`;
    }

    if (name === "move_file") {
      const src = this.resolvePath(args.source);
      const dest = this.resolvePath(args.destination);
      if (!fs.existsSync(src)) return "Source file not found.";
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
      return `Files in ${p}:\n` + files.join("\n");
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
        const email = await this.google.readEmail(args.id);
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
        let autoExecute = args.autoExecute;
        let taskPrompt = args.taskPrompt;
        const msg = args.message.toLowerCase();
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

    return "Unknown tool.";
  }
}
