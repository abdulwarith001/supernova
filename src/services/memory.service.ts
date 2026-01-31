import fs from "fs";
import path from "path";

export interface MemoryItem {
  id: string;
  category: string;
  fact: string;
  description: string;
  tags: string[];
  timestamp: string;
}

export class MemoryService {
  private memoryPath: string;
  private memories: MemoryItem[] = [];

  constructor() {
    this.memoryPath = path.join(process.cwd(), "memory", "user_memory.json");
    this.ensureMemoryFile();
    this.loadMemories();
  }

  private ensureMemoryFile() {
    const dir = path.dirname(this.memoryPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.memoryPath)) {
      fs.writeFileSync(this.memoryPath, "[]", "utf-8");
    }
  }

  private loadMemories() {
    try {
      const data = fs.readFileSync(this.memoryPath, "utf-8");
      this.memories = JSON.parse(data);
    } catch (e) {
      console.error("Failed to load memories:", e);
      this.memories = [];
    }
  }

  private saveMemories() {
    try {
      fs.writeFileSync(
        this.memoryPath,
        JSON.stringify(this.memories, null, 2),
        "utf-8",
      );
    } catch (e) {
      console.error("Failed to save memories:", e);
    }
  }

  addMemory(
    category: string,
    fact: string,
    description: string,
    tags: string[] = [],
  ): MemoryItem {
    const memory: MemoryItem = {
      id: Math.random().toString(36).substring(7),
      category,
      fact,
      description,
      tags,
      timestamp: new Date().toISOString(),
    };

    this.memories.push(memory);
    this.saveMemories();
    return memory;
  }

  searchMemories(query: string): MemoryItem[] {
    const q = query.toLowerCase();
    return this.memories.filter(
      (m) =>
        m.fact.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q)) ||
        m.category.toLowerCase().includes(q),
    );
  }

  listMemories(category?: string): MemoryItem[] {
    if (category) {
      return this.memories.filter((m) => m.category === category);
    }
    return this.memories;
  }

  getProfile(): string {
    const identity = this.listMemories("identity")
      .map((m) => `- ${m.fact}`)
      .join("\n");
    const preferences = this.listMemories("preferences")
      .map((m) => `- ${m.fact}`)
      .join("\n");
    const self = this.listMemories("self")
      .map((m) => `- ${m.fact}`)
      .join("\n");

    let profile = "";
    if (identity) profile += `\n### Identity\n${identity}`;
    if (preferences) profile += `\n### Preferences\n${preferences}`;
    if (self) profile += `\n### Self Knowledge\n${self}`;

    return profile ? profile : "No profile data yet.";
  }
}
