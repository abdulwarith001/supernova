import OpenAI from "openai";
import { CognitiveContext, Thought } from "../types/cognitive";

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

  async think(context: CognitiveContext): Promise<Thought> {
    const messages: any[] = [
      {
        role: "system",
        content: context.systemPrompt || "You are a helpful AI assistant.",
      },
      ...context.history.map((m) => ({ role: m.role, content: m.content })),
    ];

    // Inject User Profile (if available)
    if (context.profile) {
      messages.splice(1, 0, {
        role: "system",
        content: `# USER PROFILE & PREFERENCES\n${context.profile}`,
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

    return this.tryThink(messages, this.primaryModel);
  }

  private async tryThink(
    messages: any[],
    model: string,
    attempt: number = 0,
  ): Promise<Thought> {
    try {
      console.log(`🧠 Thinking with model: ${model}...`);
      const completion = await this.openai.chat.completions.create({
        messages,
        model,
        response_format: { type: "json_object" },
      });

      const content = completion.choices[0].message.content;
      if (!content) throw new Error("No content received");

      return JSON.parse(content) as Thought;
    } catch (error: any) {
      console.error(`🧠 Error with ${model}:`, error.message);

      // Recursive Fallback
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
}
