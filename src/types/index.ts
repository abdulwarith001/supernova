export * from "./cognitive";

export interface Question {
  text: string;
  target: "user" | "self";
}

export interface AgentAction {
  tool: string;
  args: any;
  reasoning: string;
}

export interface ProposedAction {
  description: string;
  tool: string;
  args: any;
}

export interface AgentResponse {
  action?: AgentAction;
  reply?: string;
  error?: string;
  proposedAction?: ProposedAction;
}

export interface AgentHistory {
  role: "system" | "user" | "assistant";
  content: string;
}
