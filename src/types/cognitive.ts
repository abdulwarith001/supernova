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
  contextSummary?: string;
  noRetries?: boolean;
}

export interface Message {
  role: "system" | "user" | "assistant" | "function";
  content: string | null;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

export interface Memory {
  shortTerm: Message[];
  working: string; // The current "goal" or "plan"
  summary?: string; // Summary of compressed history
  longTerm?: string[]; // Vector DB or similar (future)
}
