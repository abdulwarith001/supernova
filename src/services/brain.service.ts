import OpenAI from "openai";
import { CognitiveContext, Thought, Message } from "../types/cognitive";

export class BrainService {
  private openai: OpenAI;
  private primaryModel: string;
  private fallbackModels: string[] = ["gpt-4-turbo", "gpt-3.5-turbo"];

  constructor(
    apiKey: string,
    baseURL?: string,
    primaryModel: string = "gpt-4o",
  ) {
    this.openai = new OpenAI({
      apiKey,
      baseURL: baseURL,
      dangerouslyAllowBrowser: true,
    });
    this.primaryModel = primaryModel;
  }

  public getApiKey(): string {
    return this.openai.apiKey;
  }

  public getModel(): string {
    return this.primaryModel;
  }

  async think(context: CognitiveContext): Promise<Thought> {
    const messages: any[] = [
      {
        role: "system",
        content: context.systemPrompt || "You are a helpful AI assistant.",
      },
      ...context.history.map((m) => {
        const content =
          m.content === null
            ? null
            : typeof m.content === "string"
              ? m.content
              : JSON.stringify(m.content);
        const msg: any = { role: m.role, content };
        if (m.role === "function" || m.name) {
          msg.name = (m.name || "unknown_function").replace(
            /[^a-zA-Z0-9_-]/g,
            "_",
          );
        }
        if (m.function_call && m.function_call.name) {
          msg.function_call = {
            ...m.function_call,
            name: m.function_call.name.replace(/[^a-zA-Z0-9_-]/g, "_"),
          };
        }
        return msg;
      }),
    ];

    // Inject User Profile (if available)
    if (context.profile) {
      messages.splice(1, 0, {
        role: "system",
        content: `# USER PROFILE & PREFERENCES\n${context.profile}`,
      });
    }

    // Inject Context Fragments (Tiered Injection)
    if (context.fragments) {
      context.fragments.forEach((fragment, index) => {
        messages.splice(1 + index, 0, {
          role: "system",
          content: fragment,
        });
      });
    }

    // Add observation if exists
    if (context.lastObservation) {
      messages.push({
        role: "user",
        content: `Observation: ${context.lastObservation}`,
      });
    }

    // Add working memory as a reminder
    if (context.workingMemory) {
      messages.push({
        role: "system",
        content: `Current Goal: ${context.workingMemory}`,
      });
    }

    // Loop Detection
    const lastAction =
      context.history[context.history.length - 2]?.function_call;
    const secondLastAction =
      context.history[context.history.length - 4]?.function_call;

    if (
      lastAction &&
      secondLastAction &&
      lastAction.name === secondLastAction.name &&
      JSON.stringify(lastAction.arguments) ===
        JSON.stringify(secondLastAction.arguments)
    ) {
      messages.push({
        role: "system",
        content:
          "⚠️ LOOP DETECTED: You just performed the exact same action twice with no new result. DO NOT repeat the same action again. Try a different tool or explain to the user why you are stuck.",
      });
    }

    return this.tryThink(messages, this.primaryModel, 0, context.noRetries);
  }

  private async tryThink(
    messages: any[],
    model: string,
    attempt: number = 0,
    noRetries: boolean = false,
  ): Promise<Thought> {
    try {
      console.log(`🧠 Thinking with model: ${model}...`);
      const completion = await this.openai.chat.completions.create({
        messages,
        model,
        response_format: { type: "json_object" },
        max_tokens: 4096,
      });

      const choice = completion.choices[0];
      let content = choice.message.content;

      if (choice.finish_reason === "length") {
        throw new Error(
          "Response truncated due to length (max_tokens). The task payload might be too large for a single turn. Try breaking it down into smaller steps.",
        );
      }

      if (!content) throw new Error("No content received");

      // Clean Markdown Backticks if present
      content = content
        .replace(/^```json\n?/, "")
        .replace(/\n?```$/, "")
        .trim();

      const parsed = JSON.parse(content) as Thought;

      // Schema Validation & Self-Correction
      if (parsed.action && !parsed.action.name) {
        throw new Error(
          "Action validation failed: 'name' is missing from action object.",
        );
      }

      return parsed;
    } catch (error: any) {
      console.error(`🧠 Error with ${model}:`, error.message);

      // Self-Correction for JSON errors or Schema Validation errors
      if (
        (error instanceof SyntaxError ||
          error.message.includes("Action validation failed")) &&
        attempt < 3 &&
        !noRetries
      ) {
        console.warn(
          `⚠️ JSON/Schema Error (${error.message}). Retrying with a formatting reminder...`,
        );
        messages.push({
          role: "system",
          content:
            "ERROR: " +
            error.message +
            " Please correct your JSON structure. Ensure 'action' has a 'name' field.",
        });
        return this.tryThink(messages, model, attempt + 1, noRetries);
      }
      if (
        error.status === 404 ||
        error.status === 429 ||
        error.code === "model_not_found"
      ) {
        const nextModelIndex = attempt;
        if (nextModelIndex < this.fallbackModels.length) {
          console.warn(
            `⚠️ Switching to fallback model: ${this.fallbackModels[nextModelIndex]}`,
          );
          return this.tryThink(
            messages,
            this.fallbackModels[nextModelIndex],
            attempt + 1,
          );
        }
      }

      return {
        reasoning: "I encountered a critical error and could not think.",
        error: error.message,
        reply: "I'm sorry, my brain is offline. Please check my configuration.",
      };
    }
  }

  async summarize(
    messages: Message[],
    existingSummary?: string,
  ): Promise<string> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: this.primaryModel,
        messages: [
          {
            role: "system",
            content:
              "You are a master of conciseness and context prioritization. Summarize the conversation into a single, highly dense paragraph. \n\n" +
              (existingSummary
                ? `**EXISTING CONTEXT**: ${existingSummary}\n\nIntegrate the new messages below into this existing summary to create one unified, dense update of the conversation state.\n\n`
                : "") +
              "**STRICT RULES**:\n" +
              "1. **Prune Stale Topics**: If a topic (e.g., questions about celebrities, past searches) is resolved or no longer the focus, omit it or condense it to a single word.\n" +
              "2. **Highlight Key Facts**: Focus on user details (name, preferences), agent identity, and current pending goals.\n" +
              "3. **State of Being**: Clearly state what has been done and what the current immediate task is.",
          },
          ...messages.map((m) => {
            const msg: any = { role: m.role, content: m.content };

            // OpenAI requires 'name' for 'function' role
            if (m.role === "function" || m.name) {
              msg.name = (m.name || "unknown_function").replace(
                /[^a-zA-Z0-9_-]/g,
                "_",
              );
            }

            if (m.function_call && m.function_call.name) {
              msg.function_call = {
                ...m.function_call,
                name: m.function_call.name.replace(/[^a-zA-Z0-9_-]/g, "_"),
              };
            }
            return msg;
          }),
        ],
      });

      return completion.choices[0].message.content || "No summary generated.";
    } catch (error: any) {
      console.error("Summarization error:", error.message);
      return "Error generating summary.";
    }
  }

  async extractFacts(
    messages: Message[],
    currentContext: { user?: string; soul?: string; identity?: string },
  ): Promise<{
    user_md?: string;
    soul_md?: string;
    identity_md?: string;
  }> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: this.primaryModel,
        messages: [
          {
            role: "system",
            content:
              "You are the memory architect for a bio-digital agent. Your goal is to integrate NEW information into EXISTING memory files.\n\n" +
              "**EXISTING CONTENT**:\n" +
              `USER.md: ${currentContext.user || "Empty"}\n` +
              `SOUL.md: ${currentContext.soul || "Empty"}\n` +
              `IDENTITY.md: ${currentContext.identity || "Empty"}\n\n` +
              "**CRITICAL RULES**:\n" +
              "1. **Deduplicate**: If info (like an email) is already there, do NOT add it again.\n" +
              "2. **Ignore Transients & Tasks**: Do NOT extract one-off requests or background monitoring tasks. (e.g., 'remind me to check Afrobeats news every 2 minutes' is a TASK, not a USER trait. Do NOT save it to USER.md).\n" +
              "3. **Merge Structure**: Keep the existing markdown headers. Update sections like 'Notes' or 'Context' within the file content provided.\n" +
              "4. **Strict Separation**: You MUST return the full content of each file in its OWN unique JSON key. Never append SOUL content to USER_MD.\n" +
              "5. **Format**: Return ONLY the full updated content for each file.\n\n" +
              "Output RAW JSON ONLY:\n" +
              '{"user_md": "Full cleaned USER.md content", "soul_md": "Full cleaned SOUL.md content", "identity_md": "Full cleaned IDENTITY.md content"}',
          },
          ...messages.map((m) => {
            const msg: any = { role: m.role, content: m.content };
            if (m.role === "function" || m.name) {
              msg.name = (m.name || "unknown_function").replace(
                /[^a-zA-Z0-9_-]/g,
                "_",
              );
            }
            if (m.function_call && m.function_call.name) {
              msg.function_call = {
                ...m.function_call,
                name: m.function_call.name.replace(/[^a-zA-Z0-9_-]/g, "_"),
              };
            }
            return msg;
          }),
        ],
        response_format: { type: "json_object" },
      });

      const content = completion.choices[0].message.content || "{}";
      return JSON.parse(content);
    } catch (e) {
      console.error("Fact extraction error:", e);
      return {};
    }
  }
}
