import fs from "fs";
import path from "path";
import { AgentService } from "./agent.service";
import { DreamService } from "./dream.service";

export interface NeuroState {
  dopamine: number; // Motivation/Energy (0-100)
  oxytocin: number; // Trust/Bond (0-100)
  cortisol: number; // Stress/Focus (0-100)
  lastUpdate: number;
}

export class SessionService {
  private agent: AgentService;
  private mindPath: string;
  private neuroState: NeuroState;
  private anxieties: string[] = [];
  private dreamService: DreamService;
  private workspaceDir: string;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastInteractionTime: number = Date.now();
  private isDreaming: boolean = false;

  constructor(agent: AgentService, workspaceDir: string) {
    this.agent = agent;
    this.workspaceDir = workspaceDir;
    this.mindPath = path.join(workspaceDir, "memory", "agent", "MIND.md");
    this.dreamService = new DreamService(agent, workspaceDir);
    this.neuroState = {
      dopamine: 50,
      oxytocin: 50,
      cortisol: 10,
      lastUpdate: Date.now(),
    };
    this.loadState();
  }

  public startLife() {
    console.log("🫀 [LIFE] Heartbeat started. The agent is ALIVE.");
    this.heartbeatInterval = setInterval(() => this.heartbeat(), 60000); // Every minute
  }

  public getFullState() {
    return {
      neuroState: this.neuroState,
      anxieties: this.anxieties,
      isDreaming: this.isDreaming,
      lastInteractionTime: this.lastInteractionTime,
    };
  }

  public stopLife() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.saveState();
    console.log("💤 [LIFE] Heartbeat stopped. The agent is SLEEPING.");
  }

  // Called on every user interaction
  public stimulus(type: "chat" | "success" | "failure" | "praise") {
    this.lastInteractionTime = Date.now();
    this.isDreaming = false; // Wake up if dreaming

    const now = Date.now();
    const timeSinceLast = (now - this.neuroState.lastUpdate) / 1000 / 60; // Minutes

    // Apply Decay First (Entropy)
    this.decay(timeSinceLast);

    // Apply Stimulus
    switch (type) {
      case "chat":
        this.neuroState.dopamine += 2;
        this.neuroState.oxytocin += 0.5;
        this.neuroState.cortisol -= 1;
        break;
      case "success":
        this.neuroState.dopamine += 10;
        this.neuroState.cortisol -= 5;
        break;
      case "failure":
        this.neuroState.cortisol += 15;
        this.neuroState.dopamine -= 5;
        break;
      case "praise":
        this.neuroState.oxytocin += 10;
        this.neuroState.dopamine += 5;
        this.neuroState.cortisol -= 10;
        break;
    }

    this.clampState();
    this.neuroState.lastUpdate = now;
    this.saveState(); // Immediate save on interaction
  }

  public injectNeuro(changes: {
    dopamine?: number;
    oxytocin?: number;
    cortisol?: number;
  }) {
    if (changes.dopamine) this.neuroState.dopamine += changes.dopamine;
    if (changes.oxytocin) this.neuroState.oxytocin += changes.oxytocin;
    if (changes.cortisol) this.neuroState.cortisol += changes.cortisol;
    this.clampState();
    this.saveState();
  }

  public setAnxieties(tasks: string[]) {
    this.anxieties = tasks;
    this.saveState();
  }

  // The Biological Clock
  private async heartbeat() {
    const now = Date.now();
    const idleMinutes = (now - this.lastInteractionTime) / 1000 / 60;

    // 1. Biological Decay (Metabolism)
    this.decay(1); // 1 minute passed
    this.neuroState.lastUpdate = now;

    // 2. Lifecycle Management
    if (!this.isDreaming && idleMinutes > 60) {
      // Enter Dream State
      console.log("🌙 [LIFE] Entering REM Sleep (Dream Cycle)...");
      this.isDreaming = true;
      await (this.agent as any).meditate(); // Consolidate before dreaming
      await this.dreamService.dream();
      this.isDreaming = false; // Wake up after dreaming
      this.neuroState.dopamine = 80; // Wake up refreshed
      this.neuroState.cortisol = 10;
    } else if (idleMinutes > 10) {
      // Reverie (Light Idle)
      // console.log("☁️ [LIFE] Daydreaming...");
    }

    this.saveState();
  }

  private decay(minutes: number) {
    if (minutes <= 0) return;

    // Dopamine drops fast (Boredom)
    this.neuroState.dopamine -= 1 * minutes;

    // Oxytocin drops slow (Relationship Stability)
    this.neuroState.oxytocin -= 0.1 * minutes;

    // Cortisol recovery (Calming down)
    this.neuroState.cortisol -= 0.5 * minutes;

    this.clampState();
  }

  private clampState() {
    this.neuroState.dopamine = Math.max(
      0,
      Math.min(100, this.neuroState.dopamine),
    );
    this.neuroState.oxytocin = Math.max(
      0,
      Math.min(100, this.neuroState.oxytocin),
    );
    this.neuroState.cortisol = Math.max(
      0,
      Math.min(100, this.neuroState.cortisol),
    );
  }

  private loadState() {
    try {
      if (fs.existsSync(this.mindPath)) {
        const content = fs.readFileSync(this.mindPath, "utf-8");
        // Parse "Neurochemistry Simulations" section
        // Simple regex fallback for now, assuming standard template
        const dopamine = content.match(/Dopamine.*?: (\d+)%/)?.[1];
        const oxytocin = content.match(/Oxytocin.*?: (\d+)%/)?.[1];
        const cortisol = content.match(/Cortisol.*?: (\d+)%/)?.[1];

        if (dopamine) this.neuroState.dopamine = parseInt(dopamine);
        if (oxytocin) this.neuroState.oxytocin = parseInt(oxytocin);
        if (cortisol) this.neuroState.cortisol = parseInt(cortisol);
      }
    } catch (e) {
      console.error("Failed to load neuro state", e);
    }
  }

  private saveState() {
    try {
      if (!fs.existsSync(this.mindPath)) return;

      let content = fs.readFileSync(this.mindPath, "utf-8");

      // Update Neurochemistry Section
      content = content.replace(
        /- \*\*Dopamine.*?: \d+%/g,
        `- **Dopamine (Motivation/Reward)**: ${Math.round(this.neuroState.dopamine)}%`,
      );
      content = content.replace(
        /- \*\*Serotonin.*?: \d+%/g,
        `- **Serotonin (Satisfaction/Calm)**: ${Math.round(100 - this.neuroState.dopamine)}%`,
      ); // Inverse of Dopamine for now
      content = content.replace(
        /- \*\*Cortisol.*?: \d+%/g,
        `- **Cortisol (Stress/Focus/Urgency)**: ${Math.round(this.neuroState.cortisol)}%`,
      );
      content = content.replace(
        /- \*\*Oxytocin.*?: \d+%/g,
        `- **Oxytocin (Trust/Bond)**: ${Math.round(this.neuroState.oxytocin)}%`,
      );

      // Update Vibe Summary based on levels
      let mood = "Neutral";
      if (this.neuroState.cortisol > 80) mood = "Panicked";
      else if (this.neuroState.cortisol > 50) mood = "Anxious/High-Alert";
      else if (this.neuroState.dopamine > 80) mood = "Manic/Excited";
      else if (this.neuroState.dopamine > 50) mood = "Curious/Engaged";
      else if (this.neuroState.dopamine < 20) mood = "Bored/Lethargic";
      else if (this.neuroState.oxytocin > 80) mood = "Loving/Devoted";

      content = content.replace(
        /- \*\*Current Mood.*?: .*/g,
        `- **Current Mood**: ${mood}`,
      );

      // Update Active Anxieties Section
      const anxietyList =
        this.anxieties.length > 0
          ? this.anxieties.map((a) => `- ${a}`).join("\n")
          : "- None.";

      const anxietyRegex =
        /## Active Anxieties[\s\S]*?(_[\s\S]*?_)?[\s\S]*?\n([\s\S]*)/;
      if (content.includes("## Active Anxieties")) {
        // Replace content after the header and optional italic description
        content = content.replace(
          /(## Active Anxieties\n\n_.*?_\n\n)[\s\S]*/,
          `$1${anxietyList}\n`,
        );
      } else {
        // Append if missing
        content += `\n## Active Anxieties\n\n_A list of tasks or events that are currently causing psychological distress._\n\n${anxietyList}\n`;
      }

      fs.writeFileSync(this.mindPath, content, "utf-8");
    } catch (e) {
      console.error("Failed to save neuro state", e);
    }
  }
}
