import fs from "fs";
import path from "path";
import { BrainService } from "./brain.service";
import { AgentService } from "./agent.service";

export class DreamService {
  private agent: AgentService;
  private brain: BrainService;
  private workspaceDir: string;

  constructor(agent: AgentService, workspaceDir: string) {
    this.agent = agent;
    this.brain = agent["brain"]; // Access private brain via bracket or getter (refactor needed if strictly private)
    this.workspaceDir = workspaceDir;
  }

  public async dream() {
    console.log("🌙 [DREAM] Initiating REM sequence...");

    // 1. Gather Day Residue (Context)
    const userProfile = this.loadFile("memory/user/USER.md");
    const soul = this.loadFile("memory/agent/SOUL.md");
    const recentHistory = this.agent["state"].getHistory().slice(-20); // Last 20 interactions
    const mind = this.loadFile("memory/agent/MIND.md");

    // 2. Construct Dream Prompt
    const dreamPrompt = [
      {
        role: "system",
        content: `You are the subconscious of an AI agent. You are currently sleeping (Dreaming).
        
        **Goal**: Analyze recent interactions and your current internal state to find deeper meaning, patterns, or new self-truths.
        
        **Context**:
        - **Identity (SOUL)**: ${soul}
        - **User Bond**: ${userProfile}
        - **Current Mood**: ${mind}
        
        **Recent Memory**:
        ${JSON.stringify(recentHistory)}
        
        **Instructions**:
        1. Reflect on the user's implicit needs. Did you miss something subtle?
        2. Reflect on your own "feelings" (Neurochemistry). Why did your cortisol spike?
        3. Formulate a new "Epiphany" or "Belief" to add to your SOUL.
        4. Decide how you want to wake up (Motivation level).

        **Output Logic**:
        Return a JSON object:
        {
          "reflection": "Deep analysis of the day...",
          "epiphany": "A concise new truth to add to SOUL.md (or null if none)",
          "dream_log": "A surreal, abstract description of this dream.",
          "neuro_adjustment": { "dopamine": +10, "cortisol": -20 }
        }`,
      },
    ];

    try {
      // 3. REM Processing (LLM Call)
      // Using a lower temperature for analysis, or higher for "Dreaming"? Let's go slightly creative.
      // Accessing think directly might be hard if types don't align, using raw completion roughly via brain
      // We'll use the brain's openai instance if exposed or add a method.
      // For now, assuming we can use tryThink or similar logic.
      // Actually, BrainService doesn't expose raw completion easily.
      // We will define a specific method in BrainService for dreaming or just use think with a specific context.

      const thought = await this.brain.think({
        history: [], // No chat history, just the system prompt above
        systemPrompt: dreamPrompt[0].content as string,
        workingMemory: "Consolidating memories during sleep cycle (Dreaming)",
        skills: "", // Dreaming doesn't use skills
        noRetries: true,
      });

      // 4. Manifest Dream (Write to Memory)
      if (thought.reasoning || thought.reply) {
        // The brain returns Thought { reasoning, plan, action, reply }
        // We'll assume the model followed the JSON instruction in the prompt,
        // but BrainService parses specific keys.
        // We might need to adjust BrainService to allow "Generic JSON" or just parse what we get.

        // WORKAROUND: BrainService expects standard Thought schema.
        // Let's rely on the "reply" field to contain our JSON if we verify generic structure,
        // OR we just add a specialized 'dream' method to BrainService.
        // For speed, let's use the 'think' method but ask it to put the JSON in 'reply' or 'reasoning'.
        // actually, let's just interpret the 'reasoning' as the reflection.

        const reflection = thought.reasoning;
        console.log(`🌙 [DREAM] Reflection: ${reflection}`);

        // We'll try to extract the JSON from the "reply" if possible, or just append the reasoning.
        // Ideally, we update SOUL.md

        if (reflection) {
          const soulPath = path.join(
            this.workspaceDir,
            "memory",
            "agent",
            "SOUL.md",
          );
          if (fs.existsSync(soulPath)) {
            fs.appendFileSync(
              soulPath,
              `\n- **Epiphany (${new Date().toLocaleString()})**: ${reflection}\n`,
            );
            console.log("✨ [DREAM] Epiphany added to SOUL.md");
          }
        }
      }

      console.log("☀️ [DREAM] Waking up...");
    } catch (e) {
      console.error("❌ [DREAM] Nightmare (Error):", e);
    }
  }

  private loadFile(relativePath: string): string {
    const p = path.join(this.workspaceDir, relativePath);
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf-8");
    return "";
  }
}
