import { Message, Memory } from "../types/cognitive";

export class StateService {
  private memory: Memory;
  private maxHistory: number = 20;
  private notifications: string[] = [];
  constructor() {
    this.memory = {
      shortTerm: [],
      working: "", // Initially empty
    };
  }

  // Add a message to short-term memory
  updateHistory(message: Message) {
    this.memory.shortTerm.push(message);
    if (this.memory.shortTerm.length > this.maxHistory) {
    }
  }

  trimHistory(count: number) {
    this.memory.shortTerm = this.memory.shortTerm.slice(count);
  }

  // Set the current goal/working plan
  updateWorkingMemory(thought: string) {
    this.memory.working = thought;
  }

  getHistory(): Message[] {
    return this.memory.shortTerm;
  }

  getWorkingMemory(): string {
    return this.memory.working;
  }

  updateSummary(summary: string) {
    this.memory.summary = summary;
  }

  getSummary(): string | undefined {
    return this.memory.summary;
  }

  addNotification(msg: string) {
    this.notifications.push(msg);
  }

  getNotifications(): string[] {
    const n = [...this.notifications];
    this.notifications = []; // Clear after reading
    return n;
  }

  clear() {
    this.memory = {
      shortTerm: [],
      working: "",
    };
  }
}
