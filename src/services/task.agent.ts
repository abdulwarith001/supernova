import { AgentService } from "./agent.service";

/**
 * TaskAgent is a specialized sub-agent instance designed for
 * autonomous background execution of tasks.
 */
export class TaskAgent extends AgentService {
  private notificationEmail?: string;

  public setNotificationEmail(email: string) {
    this.notificationEmail = email;
  }

  /**
   * Run a background task autonomously.
   * This is a "fire-and-forget" or background-process version of the agent's run loop.
   */
  async executeAutonomousTask(
    prompt: string,
    logCallback?: (msg: string) => void,
  ): Promise<string> {
    console.log(`🚀 [TaskAgent] Starting autonomous task: ${prompt}`);

    // We run the agent without a chat history for a fresh execution context
    // and use a specialized system instruction modifier if needed.
    const emailInfo = this.notificationEmail
      ? `NOTE: The user's default email is: ${this.notificationEmail}. If the user explicitly specifies a DIFFERENT recipient in their task prompt, you MUST email ONLY that specific recipient. Do NOT send to both. Use the default email ONLY as a fallback if no recipient is mentioned.`
      : "No default email configured. You MUST extract a recipient from the task prompt to send any emails.";

    const systemModifier = `
Execute this task autonomously as a background sub-agent.
You ARE authorized to use any tools independently (including 'send_email') as part of this background process.
${emailInfo}
MISSION: 
1. Use relevant tools to fulfill the user's prompt.
2. Summarize the findings concisely.
3. If an email address is provided above, deliver the summary ONLY to that address.
`;

    try {
      // We leverage the existing run method but ensure logs are tagged correctly
      const result = await this.run(
        `${systemModifier}\nTask: ${prompt}`,
        [],
        (msg) => {
          if (logCallback) logCallback(`[TaskAgent] ${msg}`);
          else console.log(`[TaskAgent] ${msg}`);
        },
        true,
      );

      console.log(`✅ [TaskAgent] Task completed.`);
      const finalReply =
        typeof result.reply === "string"
          ? result.reply
          : JSON.stringify(result.reply);
      return finalReply || "Task executed successfully (no reply).";
    } catch (e: any) {
      console.error(`❌ [TaskAgent] Execution failed: ${e.message}`);
      throw e;
    }
  }
}
