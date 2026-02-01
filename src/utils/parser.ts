export interface SkillManifest {
  name: string;
  description: string;
  secrets?: Array<{
    name: string;
    description: string;
    link?: string;
  }>;
}

export function parseSkillManifest(content: string): SkillManifest | null {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\n---\r?\n/m;
  const match = content.match(frontmatterRegex);

  if (!match) return null;

  const yamlBlock = match[1];
  const manifest: any = {};

  // Very simple YAML-like parsing for name, description, and nested secrets
  const lines = yamlBlock.split("\n");
  let currentField = "";

  for (const line of lines) {
    if (line.startsWith("name:")) {
      manifest.name = line.replace("name:", "").trim();
    } else if (line.startsWith("description:")) {
      manifest.description = line.replace("description:", "").trim();
    } else if (line.startsWith("secrets:")) {
      manifest.secrets = [];
      currentField = "secrets";
    } else if (
      currentField === "secrets" &&
      line.trim().startsWith("- name:")
    ) {
      manifest.secrets.push({ name: line.replace("- name:", "").trim() });
    } else if (
      currentField === "secrets" &&
      line.trim().startsWith("description:")
    ) {
      const lastSecret = manifest.secrets[manifest.secrets.length - 1];
      if (lastSecret)
        lastSecret.description = line.replace("description:", "").trim();
    } else if (currentField === "secrets" && line.trim().startsWith("link:")) {
      const lastSecret = manifest.secrets[manifest.secrets.length - 1];
      if (lastSecret)
        lastSecret.link = line
          .replace("link:", "")
          .trim()
          .replace(/^["']|["']$/g, "");
    }
  }

  return manifest as SkillManifest;
}
