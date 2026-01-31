export interface ToolCall {
  name: string;
  arguments: any;
}

export interface Thought {
  reasoning: string;
  plan?: string[];
  action?: ToolCall;
  reply?: string;
  error?: string;
}

export interface CognitiveContext {
  history: Message[];
  workingMemory: string;
  skills: string;
  lastObservation?: string;
  systemPrompt?: string;
  profile?: string;
}

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Memory {
  shortTerm: Message[];
  working: string; // The current "goal" or "plan"
  longTerm?: string[]; // Vector DB or similar (future)
}
