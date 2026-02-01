export const PROVIDERS = [
  {
    type: "free",
    name: "Ollama (Local)",
    value: "ollama",
    models: ["llama3", "mistral", "gemma"],
    requiresKey: false,
    baseUrl: "http://localhost:11434",
  },
  {
    type: "free",
    name: "Groq",
    value: "groq",
    models: ["llama3-8b-8192", "llama3-70b-8192", "mixtral-8x7b-32768"],
    requiresKey: true,
  },
  {
    type: "paid",
    name: "OpenAI",
    value: "openai",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-5", "gpt-4-turbo", "gpt-3.5-turbo"],
    requiresKey: true,
  },
  {
    type: "paid",
    name: "Anthropic",
    value: "anthropic",
    models: ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"],
    requiresKey: true,
  },
  {
    type: "paid",
    name: "Gemini",
    value: "gemini",
    models: ["gemini-pro", "gemini-1.5-flash"],
    requiresKey: true,
  },
];

export const TOOLS = [
  {
    id: "calendar",
    name: "Google Calendar",
    description: "Read, create, and manage calendar events.",
    keys: [
      "GOOGLE_CALENDAR_ENABLED",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_ACCESS_TOKEN",
    ],
  },
  {
    id: "email",
    name: "Google Email (Gmail)",
    description: "Search, read, and send emails.",
    keys: [
      "GOOGLE_EMAIL_ENABLED",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_ACCESS_TOKEN",
    ],
  },
  {
    id: "search",
    name: "Web Search",
    description:
      "Search the web via Serper API (Required for 'Web Search' skill).",
    keys: ["SERPER_API_KEY"],
  },
  {
    id: "reminders",
    name: "Reminders & Notifications",
    description:
      "Enable the agent to schedule reminders and send email notifications.",
    keys: ["REMINDERS_ENABLED", "REMINDER_EMAIL"],
  },
];
