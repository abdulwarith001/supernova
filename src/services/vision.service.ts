import OpenAI from "openai";

export interface VisionAction {
  action: "click" | "type" | "scroll" | "navigate" | "done";
  coordinates?: { x: number; y: number };
  inputIndex?: number; // 0 = first input, 1 = second, etc.
  selector?: string;
  text?: string;
  url?: string;
  reasoning: string;
}

export class VisionService {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true,
    });
  }

  async analyzeScreenshot(
    base64Image: string,
    goal: string,
    pageContext?: {
      url?: string;
      title?: string;
      previousActions?: string[];
    },
  ): Promise<VisionAction> {
    const contextStr = pageContext
      ? `Current URL: ${pageContext.url || "unknown"}
Page Title: ${pageContext.title || "unknown"}
Previous Actions: ${pageContext.previousActions?.join(", ") || "none"}`
      : "";

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a **Vision Analyst** for web pages. Your job is to EXTRACT INFORMATION from screenshots.

CRITICAL: DO NOT suggest clicking. We analyze pages visually only.

YOUR TASKS:
1. **EXTRACT URLS**: If you see search results or links, extract the ACTUAL URLs visible on the page
2. **EXTRACT CONTENT**: Summarize relevant text, headlines, data visible on the page  
3. **IDENTIFY OBSTACLES**: Note CAPTCHAs, paywalls, login walls, or errors
4. **FIND ANSWERS**: If the answer to the goal is visible, extract it completely

FOR SEARCH RESULTS PAGES:
- Look for article titles and their URLs
- Extract the full URL if visible (look in the green text under titles on Google/Bing)
- Format: "Title: [title] | URL: [full url]"

FOR ARTICLE PAGES:
- Extract the main content, key points, headlines
- Summarize what you see

${contextStr}

OUTPUT (JSON only):
{
  "action": "done",
  "reasoning": "Detailed description of what I see on the page",
  "extracted_urls": ["https://example.com/article1", "https://example.com/article2"],
  "extracted_content": "Summary of relevant visible content",
  "obstacles": "None" | "CAPTCHA detected" | "Paywall detected"
}`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `GOAL: ${goal}\n\nAnalyze this screenshot and tell me the next action:`,
            },
            {
              type: "image_url",
              image_url: {
                url: base64Image.startsWith("data:")
                  ? base64Image
                  : `data:image/jpeg;base64,${base64Image}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_tokens: 500,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      return {
        action: "done",
        reasoning: "No response from vision model.",
      };
    }

    try {
      return JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse vision response", e);
      return {
        action: "done",
        reasoning: "Failed to parse vision response.",
      };
    }
  }

  async detectLoadingState(base64Image: string): Promise<boolean> {
    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a Loading State Detector. Look at the screenshot and determine if the page is currently loading.
          
SIGNS OF LOADING:
- Spinners / circular loaders
- Skeleton screens (gray bars)
- "Loading..." text
- Blank white screen with just a header
- Progress bars

OUTPUT JSON ONLY:
{ "isLoading": true/false, "reason": "I see a spinner in the center" }`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Is this page loading?" },
            {
              type: "image_url",
              image_url: {
                url: base64Image.startsWith("data:")
                  ? base64Image
                  : `data:image/jpeg;base64,${base64Image}`,
                detail: "low",
              },
            },
          ],
        },
      ],
      max_tokens: 50,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) return false;

    try {
      const result = JSON.parse(content);
      return result.isLoading === true;
    } catch {
      return false;
    }
  }

  async describeElement(
    base64Image: string,
    description: string,
  ): Promise<{ x: number; y: number; found: boolean; reasoning: string }> {
    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a visual element locator. Given a screenshot and an element description, find the element and return its approximate center coordinates.

OUTPUT FORMAT (JSON only):
{
  "found": true | false,
  "x": 500,
  "y": 300,
  "reasoning": "Found the blue button labeled 'Submit' in the bottom right..."
}

Coordinates are relative to a 1920x1080 viewport.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Find this element: "${description}"`,
            },
            {
              type: "image_url",
              image_url: {
                url: base64Image.startsWith("data:")
                  ? base64Image
                  : `data:image/jpeg;base64,${base64Image}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_tokens: 300,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      return { found: false, x: 0, y: 0, reasoning: "No response" };
    }

    try {
      return JSON.parse(content);
    } catch (e) {
      return { found: false, x: 0, y: 0, reasoning: `Parse error: ${content}` };
    }
  }
}
