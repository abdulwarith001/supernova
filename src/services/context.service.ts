import fs from "fs";
import path from "path";
import { Message } from "../types/cognitive";

export interface ContextFragment {
  id: string;
  title: string;
  content: string;
  location?: string;
  isEssential: boolean;
}

export class ContextService {
  private workspaceDir: string;

  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
  }

  public async assembleContext(options: {
    history: Message[];
    userProfile?: string;
    identity?: string;
    soul?: string;
    mind?: string;
    bootstrap?: string;
    skills?: string;
  }): Promise<string[]> {
    const { history, userProfile, identity, soul, mind, bootstrap, skills } =
      options;
    const fragments: string[] = [];

    // 1. Tier 0: The Rules (Essential)
    // These are handled by the core system prompt structure in prompts.ts

    // 2. Tier 1: Primary Consciousness (Full Injection)
    if (identity) {
      fragments.push(`## IDENTITY (Who You Are)\n${identity}`);
    }

    if (soul) {
      fragments.push(`## SOUL (Your Core Truths)\n${soul}`);
    }

    if (mind) {
      fragments.push(`## STATE OF MIND (Internal State)\n${mind}`);
    }

    // 3. Tier 2: Relational Metadata
    if (userProfile) {
      const nameMatch = userProfile.match(/- \*\*Name:\*\* (.*)/);
      const userName = nameMatch ? nameMatch[1] : "the human";
      fragments.push(
        `## Relationship\n- **Current Human**: ${userName}\n- **Context**: You are helping them in this workspace.`,
      );

      fragments.push(`## User Profile (The Human)\n${userProfile}`);
    }

    if (bootstrap) {
      fragments.push(
        `## Onboarding Status\nRef: memory/agent/BOOTSTRAP.md\nYou are currently in onboarding mode. Follow the bootstrap ritual to establish a name for yourself and the user.`,
      );
    }

    // 4. Tier 3: Domain Skills
    if (skills) {
      fragments.push(skills);
    }

    return fragments;
  }

  private loadFile(relativePath: string): string | undefined {
    const fullPath = path.join(this.workspaceDir, relativePath);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, "utf-8");
    }
    return undefined;
  }
}
