export interface Reasoning {
  plan: string;
  reflection: string;
  thought: string;
}

export interface AgentAction {
  reasoning: Reasoning;
  tool: string;
  args: any[];
}

export interface AgentResponse {
  results?: string[];
  question?: string;
  history?: AgentHistory[];
}

export interface AgentHistory {
  role: "system" | "user" | "assistant";
  content: string;
}
