import fs from "fs";
import path from "path";
const pdf = require("pdf-parse");
import mammoth from "mammoth";

export class ResumeService {
  async extractText(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === ".txt" || ext === ".md") {
      return fs.readFileSync(filePath, "utf-8");
    }

    if (ext === ".pdf") {
      const dataBuffer = fs.readFileSync(filePath);
      // @ts-ignore
      const data = await pdf(dataBuffer);
      return data.text;
    }

    if (ext === ".docx") {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    }

    throw new Error(`Unsupported file type: ${ext}`);
  }

  async parseResume(text: string, brain: any): Promise<any> {
    const prompt = `
      Extract the following information from this resume and return it as a JSON object:
      - Full Name
      - Email
      - Phone
      - Skills (Array)
      - Experience (Array of objects with title, company, duration, and summary)
      - Education (Array)
      
      Resume Text:
      ${text}
    `;

    // We'll use the brain.think or a specialized method to get JSON
    // For now, let's assume we call brain.think with this prompt.
    const thought = await brain.think({
      systemPrompt:
        "You are a professional recruiting assistant. Extract data accurately into JSON.",
      history: [{ role: "user", content: prompt }],
      workingMemory: "",
      skills: "",
    });

    return thought;
  }
}
