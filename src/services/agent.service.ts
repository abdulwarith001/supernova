import OpenAI from "openai";
import { BrowserController } from "../controllers/browser.controller";
import { SystemController } from "../controllers/system.controller";
import { AgentHistory, AgentResponse, AgentAction } from "../types";
import { getSystemPrompt } from "./prompts";

export class AgentService {
  private openai: OpenAI;
  private browser: BrowserController;
  private system: SystemController;

  constructor(
    apiKey: string,
    browser: BrowserController,
    system: SystemController,
  ) {
    this.openai = new OpenAI({
      apiKey: apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
    this.browser = browser;
    this.system = system;
  }

  private parseResponse(content: string): AgentAction {
    try {
      // 1. Clean up potential markdown fences
      let cleaned = content
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      // 2. Remove comments (lines starting with # or // inside the string, but be careful with URLs)
      // A more robust way is to remove anything after # or // if it's not inside a string
      // For now, let's do a simple line-by-line cleanup for the most common failure: comments at the end of lines
      cleaned = cleaned
        .split("\n")
        .map((line) => {
          const commentIndex = line.indexOf(" #");
          if (commentIndex !== -1) return line.slice(0, commentIndex).trim();
          const slashCommentIndex = line.indexOf(" //");
          if (slashCommentIndex !== -1)
            return line.slice(0, slashCommentIndex).trim();
          return line;
        })
        .join("\n");

      return JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse agent response:", content);
      throw new Error(
        "AI returned invalid JSON. Content: " + content.slice(0, 100),
      );
    }
  }

  private truncateHistory(history: AgentHistory[]) {
    if (history.length <= 6) return history;
    const systemMsg = history[0];
    const recentMsgs = history.slice(-4);
    const middleMsgs = history.slice(1, -4);

    const truncatedMiddle = middleMsgs.map((msg) => {
      if (msg.role === "user" && msg.content.startsWith("Observation:")) {
        return {
          ...msg,
          content: msg.content.slice(0, 500) + "... [truncated]",
        };
      }
      return msg;
    });

    return [systemMsg, ...truncatedMiddle, ...recentMsgs];
  }

  async run(
    prompt: string,
    existingHistory?: AgentHistory[],
    onLog?: (msg: string) => void,
    signal?: AbortSignal,
  ): Promise<AgentResponse> {
    const history: AgentHistory[] = existingHistory || [
      { role: "system", content: getSystemPrompt(prompt) },
    ];

    if (existingHistory && existingHistory.length > 0) {
      history.push({ role: "user", content: prompt });
    }

    const sendLog = (msg: string) => onLog && onLog(msg);

    for (let i = 0; i < 10; i++) {
      if (signal?.aborted) {
        sendLog("🛑 Task stopped by user.");
        return { results: ["Task cancelled by user."], history };
      }
      try {
        const truncatedHistory = this.truncateHistory(history);
        const completion = await this.openai.chat.completions.create({
          messages: truncatedHistory as any,
          model: "llama-3.1-8b-instant",
          response_format: { type: "json_object" },
        });

        if (!completion.choices || completion.choices.length === 0) {
          throw new Error("AI returned an empty response.");
        }

        const content = completion.choices[0].message.content!;
        history.push({ role: "assistant", content });

        const action = this.parseResponse(content);

        if (action.reasoning) {
          sendLog(
            JSON.stringify({ type: "reasoning", data: action.reasoning }),
          );
        } else {
          sendLog(`🧠 Thinking...`);
        }

        if (action.tool === "ask_user") {
          return { question: action.args[0], history };
        }

        if (action.tool === "finish") {
          return { results: [action.args[0]], history: [] };
        }

        sendLog(`🔧 Executing ${action.tool}...`);
        let result = "";

        switch (action.tool) {
          case "navigate":
            result = await this.browser.navigate(action.args[0]);
            break;
          case "search_web":
            result = await this.browser.searchWeb(action.args[0]);
            break;
          case "get_interactive_elements":
            result = await this.browser.getInteractiveElements();
            break;
          case "click_by_index":
            result = await this.browser.clickByIndex(Number(action.args[0]));
            break;
          case "click":
            result = await this.browser.click(action.args[0]);
            break;
          case "fill":
            result = await this.browser.fill(action.args[0], action.args[1]);
            break;
          case "get_page_content":
            result = await this.browser.getPageContent();
            break;
          case "scroll":
            result = await this.browser.scroll(action.args[0]);
            break;
          case "get_system_state":
            result = await this.system.getSystemState();
            break;
          case "mouse_move":
            result = await this.system.mouseMove(
              Number(action.args[0]),
              Number(action.args[1]),
            );
            break;
          case "mouse_click":
            result = await this.system.mouseClick(
              Number(action.args[0]),
              Number(action.args[1]),
            );
            break;
          case "keyboard_type":
            result = await this.system.keyboardType(action.args[0]);
            break;
          case "list_apps":
            result = await this.system.listApps();
            break;
          case "open_app":
            result = await this.system.openApp(action.args[0]);
            break;
          case "run_applescript":
            result = await this.system.runAppleScript(action.args[0]);
            break;
          case "wait":
            result = await this.system.wait(Number(action.args[0]));
            break;
          case "say":
            sendLog(`💬 AI: ${action.args[0]}`);
            result = `Sent message to user: ${action.args[0]}`;
            break;
          default:
            result = `Unknown tool: ${action.tool}`;
        }

        sendLog(`👁 Observed: ${result.slice(0, 150)}...`);
        history.push({ role: "user", content: `Observation: ${result}` });
      } catch (error) {
        if (error.status === 429) {
          sendLog("⚠️ Rate limit reached. Waiting 10 seconds...");
          await new Promise((r) => setTimeout(r, 10000));
          i--; // Don't count this as a step
          continue;
        }
        const errorMsg = `Error: ${error.message}`;
        sendLog(`⚠️ ${errorMsg}`);
        history.push({ role: "user", content: `Observation: ${errorMsg}` });
      }
    }

    return {
      results: ["Agent reached max steps. You can type 'continue' to proceed."],
      history,
    };
  }
}
