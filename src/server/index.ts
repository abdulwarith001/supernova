import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import os from "os";
import cors from "cors";
import { Server } from "socket.io";
import { AgentService } from "../services/agent.service";
import { Job } from "../services/scheduler.service";
import open from "open";
import { decrypt } from "../utils/crypto";
import { PROVIDERS } from "../cli/constants";
import { parseSkillManifest } from "../utils/parser";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files from Vite build (assuming they are in dist)
// For now, in dev, we might need to proxy to Vite dev server, but for this simplified setup we assume
// the user might run the dashboard separately or we serve a basic placeholder if not built.
const distPath = path.join(__dirname, "../../dist");
if (require("fs").existsSync(distPath)) {
  app.use(express.static(distPath));
} else {
  app.get("/", (req: express.Request, res: express.Response) => {
    res.send(
      "Supernova Dashboard API is running. Build the frontend to see the UI.",
    );
  });
}

// Global Agent Instance
let agentInstance: AgentService | null = null;
let lastApiKey: string | null = null;

const initAgentOnStart = () => {
  try {
    const configPath = path.join(os.homedir(), ".supernova", "config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      // Try to find an API key
      const provider = config.SELECTED_PROVIDER || "openai";
      let apiKey = config[`${provider.toUpperCase()}_API_KEY`];

      if (apiKey) {
        try {
          apiKey = decrypt(apiKey);
        } catch (e) {}
        console.log("🚀 Initializing Background Agent...");
        agentInstance = new AgentService(
          apiKey,
          config.SELECTED_MODEL || "gpt-4o",
          broadcastReminder,
        );
        lastApiKey = apiKey;
      }
    }
  } catch (e) {
    console.error("Failed to auto-start agent:", e);
  }
};

const broadcastReminder = async (job: Job) => {
  // Handle Auto-Execute Smart Tasks
  if (job.autoExecute && job.taskPrompt && agentInstance) {
    console.log(
      `🤖 AUTO-EXECUTE: Starting background mission: ${job.taskPrompt}`,
    );
    try {
      const { TaskAgent } = await import("../services/task.agent");
      const taskAgent = new TaskAgent(
        agentInstance.getApiKey(),
        agentInstance.getModel(),
        () => {},
      );

      const notificationEmail = agentInstance.getNotificationEmail();
      if (!notificationEmail) {
        console.warn(
          "⚠️ Silent Fail: No notification email configured. Aborting background task to prevent hallucination.",
        );
        return;
      }

      taskAgent.setNotificationEmail(notificationEmail);

      // We combine the task and the delivery intent into ONE single execution
      const fullPrompt = `TASK: ${job.taskPrompt}\n\nIMPORTANT: Once finished, summarize findings and email them specifically to ${notificationEmail}. Do NOT use any other email address.`;

      await taskAgent.executeAutonomousTask(fullPrompt, (msg: string) => {
        console.log(`[Background Agent] ${msg}`);
      });

      console.log(`✅ [TaskAgent] Mission Accomplished.`);
    } catch (err) {
      console.error("❌ Background mission failed (silent):", err);
    }
  } else {
    // ONLY emit UI notifications for standard (non-autoExecute) reminders
    io.emit("reminder-triggered", job);
    console.log(`📡 UI Notification: ${job.message}`);
  }
};

initAgentOnStart();

// Reminders API
app.get("/api/reminders", (req, res) => {
  if (!agentInstance) return res.json([]);
  const reminders = agentInstance.scheduler.listReminders();
  res.json(reminders);
});

app.delete("/api/reminders/:id", async (req, res) => {
  if (!agentInstance)
    return res.status(500).json({ error: "Agent not initialized" });
  await agentInstance.scheduler.deleteReminder(req.params.id);
  res.json({ success: true });
});

app.post("/api/reminders", async (req, res) => {
  if (!agentInstance)
    return res.status(500).json({ error: "Agent not initialized" });
  const { message, dueAt } = req.body;
  const job = await agentInstance.scheduler.createReminder(message, dueAt);
  res.json(job);
});

io.on("connection", (socket: any) => {
  console.log("Client connected");

  // Load Config & Send to Client
  try {
    const configPath = path.join(os.homedir(), ".supernova", "config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const providerVal = config.SELECTED_PROVIDER || "openai";
      const providerObj = PROVIDERS.find((p) => p.value === providerVal);

      // Check for missing skill keys
      const missingKeys: string[] = [];
      const skillsDir = path.join(process.cwd(), "skills");
      if (fs.existsSync(skillsDir)) {
        const files = fs
          .readdirSync(skillsDir)
          .filter((f: string) => f.endsWith(".md"));
        for (const file of files) {
          const content = fs.readFileSync(path.join(skillsDir, file), "utf-8");
          const manifest = parseSkillManifest(content);
          if (manifest?.secrets) {
            for (const secret of manifest.secrets) {
              if (!config[secret.name]) {
                missingKeys.push(`${secret.name} (${manifest.name})`);
              }
            }
          }
        }
      }

      socket.emit("init-config", {
        provider: providerObj ? providerObj.name : providerVal,
        model: config.SELECTED_MODEL || "gpt-4o",
        models: providerObj ? providerObj.models : ["gpt-4o"],
        persona: config.SELECTED_PERSONA || "default",
        missing_keys: missingKeys,
      });
    }
  } catch (e) {
    console.error("Init config error:", e);
  }

  socket.on("start-chat", async (data: any) => {
    const { prompt, history } = data;
    let { apiKey, model } = data;

    // Load Config from Onboarding
    try {
      const configPath = path.join(os.homedir(), ".supernova", "config.json");
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

        if (!model && config.SELECTED_MODEL) {
          model = config.SELECTED_MODEL;
        }

        if (!apiKey) {
          const provider = config.SELECTED_PROVIDER || "openai";
          const keyName = `${provider.toUpperCase()}_API_KEY`;
          if (config[keyName]) {
            // Try decrypting or using raw if not encrypted (onboard script handles encryption)
            // For now assuming onboard uses the same decrypt logic or we save plain/simple
            // Let's assume we need to try decrypt:
            try {
              apiKey = decrypt(config[keyName]);
              console.log(`🔓 Decrypted ${keyName} for chat`);
            } catch (e: any) {
              console.warn(
                `⚠️ Failed to decrypt ${keyName}, using raw value: ${e.message}`,
              );
              apiKey = config[keyName]; // Fallback to plain
            }
          }
        }
      }
    } catch (e) {
      console.error("Config load error:", e);
    }

    // Fallback defaults
    if (!model) model = "gpt-4o";

    if (!agentInstance || lastApiKey !== apiKey) {
      console.log("Creating new AgentService instance...");
      agentInstance = new AgentService(apiKey || "", model, broadcastReminder);
      lastApiKey = apiKey || "";
    }

    const onLog = (msg: string) => {
      socket.emit("action-log", msg);
    };

    try {
      if (!apiKey)
        throw new Error("No API Key found. Please run 'supernova onboard'.");
      const result = await agentInstance.run(prompt, history || [], onLog);
      socket.emit("chat-reply", result);
    } catch (e: any) {}
  });
});

server.listen(PORT, async () => {
  console.log(`\n🚀 Supernova Server running at http://localhost:${PORT}`);
  console.log("Opening dashboard...");
  // await open(`http://localhost:${PORT}`);
  // Commented out open for now to avoid popping windows in test environment, but strictly required for CLI.
  if (process.env.NODE_ENV !== "test") {
    import("open").then((op) => op.default(`http://localhost:${PORT}`));
  }
});
