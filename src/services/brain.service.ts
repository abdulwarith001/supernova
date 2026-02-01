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
          typeof m.content === "string" ? m.content : JSON.stringify(m.content);
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

    // Inject Context Summary (if available)
    if (context.contextSummary) {
      messages.splice(context.profile ? 2 : 1, 0, {
        role: "system",
        content: `# CONVERSATION SUMMARY (PAST CONTEXT)\n${context.contextSummary}`,
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
        max_tokens: 2048,
      });

      const choice = completion.choices[0];
      let content = choice.message.content;

      if (choice.finish_reason === "length") {
        throw new Error(
          "Response truncated due to length (max_tokens). Context might be too large.",
        );
      }

      if (!content) throw new Error("No content received");

      // Clean Markdown Backticks if present
      content = content
        .replace(/^```json\n?/, "")
        .replace(/\n?```$/, "")
        .trim();

      return JSON.parse(content) as Thought;
    } catch (error: any) {
      console.error(`🧠 Error with ${model}:`, error.message);

      // Self-Correction for JSON errors
      if (error instanceof SyntaxError && attempt < 3 && !noRetries) {
        console.warn(
          "⚠️ JSON Parse Error. Retrying with a formatting reminder...",
        );
        messages.push({
          role: "system",
          content:
            "ERROR: Your last response was invalid JSON. Please ensure your response is a raw JSON object only. No markdown formatting, no backticks, no extra text.",
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

  async summarize(messages: Message[]): Promise<string> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: this.primaryModel,
        messages: [
          {
            role: "system",
            content:
              "You are a master of conciseness. Your job is to summarize the following conversation history into a single, highly dense paragraph that captures all key decisions, facts, and the current state of the conversation. Focus on WHAT was done and WHAT the current goals are.",
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
}
