import { Message, Memory } from "../types/cognitive";
import { MemoryService } from "./memory.service";

export class StateService {
  private memory: Memory;
  private maxHistory: number = 20;
  private memoryService: MemoryService;

  constructor() {
    this.memoryService = new MemoryService();
    this.memory = {
      shortTerm: [],
      working: "", // Initially empty
    };
  }

  // Add a message to short-term memory
  updateHistory(message: Message) {
    this.memory.shortTerm.push(message);
    if (this.memory.shortTerm.length > this.maxHistory) {
      this.memory.shortTerm.shift(); // FIFO
    }
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

  getProfile(): string {
    return this.memoryService.getProfile();
  }

  clear() {
    this.memory = {
      shortTerm: [],
      working: "",
    };
  }

  getMemoryService(): MemoryService {
    return this.memoryService;
  }
}
