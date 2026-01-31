import { AgentResponse, AgentHistory, Thought } from "../types";
import { BrainService } from "./brain.service";
import { StateService } from "./state.service";
import { ElectronBrowserService } from "./electron-browser.service";
import { VisionService } from "./vision.service";
import { getCognitiveSystemPrompt } from "./prompts";
import fs from "fs";
import path from "path";

export class AgentService {
  private brain: BrainService;
  private state: StateService;
  private browser: ElectronBrowserService;
  private visionService: VisionService | null = null;

  constructor(
    apiKey: string,
    model: string = "gpt-4o",
    openaiApiKey?: string,
    visionMode: "off" | "auto" | "always" = "auto",
  ) {
    this.brain = new BrainService(apiKey, undefined, model);
    this.state = new StateService();
    this.browser = ElectronBrowserService.getInstance();

    if (openaiApiKey) {
      this.visionService = new VisionService(openaiApiKey);
    }
  }

  private loadSkills(): string {
    try {
      const skillsDir = path.join(process.cwd(), "skills");
      if (!fs.existsSync(skillsDir)) return "";
      const files = fs.readdirSync(skillsDir);
      return files
        .filter((f) => f.endsWith(".md"))
        .map((f) => fs.readFileSync(path.join(skillsDir, f), "utf-8"))
        .join("\n\n---\n\n");
    } catch (e) {
      console.error("Failed to load skills:", e);
      return "";
    }
  }

  async run(
    prompt: string,
    history: AgentHistory[],
    onLog?: (msg: string) => void,
  ): Promise<AgentResponse> {
    const sendLog = (msg: string) => onLog && onLog(msg);

    // 1. Observe (Update State and get initial browser context)
    this.state.updateHistory({ role: "user", content: prompt });

    let initialObservation = "";
    try {
      const snapshot = await this.browser.getSnapshot();
      if (snapshot.url && snapshot.url !== "about:blank") {
        initialObservation = await this.browser.formatObservation(
          "Initial Browser State",
        );
      }
    } catch (e) {
      console.error("Initial observation failed:", e);
    }

    if (initialObservation) {
      this.state.updateHistory({ role: "user", content: initialObservation });
    }

    sendLog(`🧠 Thinking...`);

    let turns = 0;
    const maxTurns = 10; // OODA Loop Limit

    while (turns < maxTurns) {
      turns++;

      // 2. Orient & Decide (Brain)
      const context = {
        history: this.state.getHistory(),
        workingMemory: this.state.getWorkingMemory(),
        skills: "", // Load skills if needed
        systemPrompt: getCognitiveSystemPrompt(this.loadSkills()),
        profile: this.state.getProfile(),
      };

      const thought: Thought = await this.brain.think(context);

      // Log reasoning
      if (thought.reasoning) {
        sendLog(`💭 ${thought.reasoning}`);
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
          content: `Executing ${action.name}...`,
        });
        this.state.updateHistory({
          role: "user",
          content: `Observation: ${result}`,
        });
      }
    }

    return { reply: "I'm tired. I reached my turn limit." };
  }

  private async executeTool(
    action: any,
    sendLog: (msg: string) => void,
  ): Promise<string> {
    const { name, arguments: args } = action;

    if (name === "search_web") {
      const url = `https://www.bing.com/search?q=${encodeURIComponent(args.query)}`;
      return await this.browser.goto(url);
    }

    if (name === "visit_page") {
      return await this.browser.goto(args.url);
    }

    if (name === "check_current_page") {
      return await this.browser.formatObservation(
        `Current page status checked.`,
      );
    }

    if (name === "click_element") {
      const result = await this.browser.click(args.selector);
      return result;
    }

    if (name === "type_in_input") {
      const result = await this.browser.type(args.selector, args.text);
      return result;
    }

    if (name === "scroll_page") {
      const result = await this.browser.scroll(
        args.direction || "down",
        args.amount || 500,
      );
      return result;
    }

    if (name === "execute_js") {
      const result = await this.browser.executeJS(args.script);
      return result;
    }

    if (name === "remember_fact") {
      const mem = this.state
        .getMemoryService()
        .addMemory(args.category, args.fact, args.description, args.tags);
      return `Fact remembered: ${mem.fact} (ID: ${mem.id})`;
    }

    if (name === "search_memory") {
      const results = this.state.getMemoryService().searchMemories(args.query);
      return `Found ${results.length} memories:\n${JSON.stringify(results.slice(0, 5), null, 2)}`;
    }

    if (name === "list_memories") {
      const results = this.state.getMemoryService().listMemories(args.category);
      return `Memories (${args.category || "all"}):\n${JSON.stringify(results.slice(0, 10), null, 2)}`;
    }

    if (name === "take_screenshot") {
      const screenshot = await this.browser.screenshot();
      return `Screenshot captured. (Base64 data omitted for brevity)`;
    }

    if (name === "use_vision" || name === "analyze_page") {
      if (!this.visionService)
        return "Vision service not available (missing OpenAI key).";

      if (name === "analyze_page" && args.url) {
        await this.browser.goto(args.url);
      }

      const screenshot = await this.browser.screenshot();
      const goal = args.goal || "Describe this page.";

      sendLog(`🔍 Analyzing page state...`);

      const analysis = await this.visionService.analyzeScreenshot(
        screenshot,
        goal,
        {
          url: "current", // TODO: Get actual URL
          previousActions: [],
        },
      );

      return `Vision Analysis:\n${JSON.stringify(analysis, null, 2)}`;
    }

    return "Unknown tool.";
  }
}
