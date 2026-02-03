import { Message, Memory } from "../types/cognitive";
import fs from "fs";
import path from "path";

export class StateService {
  private memory: Memory;
  private maxHistory: number = 20;
  private notifications: string[] = [];
  private persistencePath: string | undefined;

  constructor(persistencePath?: string) {
    this.persistencePath = persistencePath;
    this.memory = {
      shortTerm: [],
      working: "",
    };

    if (this.persistencePath) {
      this.load();
    }
  }

  private load() {
    if (!this.persistencePath || !fs.existsSync(this.persistencePath)) return;
    try {
      const data = fs.readFileSync(this.persistencePath, "utf-8");
      this.memory = JSON.parse(data);
      console.log(`📜 Loaded conversation state from ${this.persistencePath}`);
    } catch (e) {
      console.error("Failed to load state persistence:", e);
    }
  }

  private save() {
    if (!this.persistencePath) return;
    try {
      const dir = path.dirname(this.persistencePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        this.persistencePath,
        JSON.stringify(this.memory, null, 2),
        "utf-8",
      );
    } catch (e) {
      console.error("Failed to save state persistence:", e);
    }
  }

  // Add a message to short-term memory
  updateHistory(message: Message) {
    this.memory.shortTerm.push(message);
    this.save();
  }

  trimHistory(count: number) {
    this.memory.shortTerm = this.memory.shortTerm.slice(count);
    this.save();
  }

  // Set the current goal/working plan
  updateWorkingMemory(thought: string) {
    this.memory.working = thought;
    this.save();
  }

  getHistory(): Message[] {
    return this.memory.shortTerm;
  }

  getWorkingMemory(): string {
    return this.memory.working;
  }

  updateSummary(summary: string) {
    this.memory.summary = summary;
    this.save();
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
    this.save();
  }
}
