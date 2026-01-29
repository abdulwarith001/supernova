import "./index.css";

interface AgentResponse {
  results?: string[];
  question?: string;
  history?: any[];
}

interface ElectronAPI {
  generateSteps: (data: {
    prompt: string;
    apiKey: string;
    history?: any[];
  }) => Promise<AgentResponse>;
  stopGeneration: () => Promise<boolean>;
  onActionLog: (callback: (message: string) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

const messagesContainer = document.getElementById("messages")!;
const userInput = document.getElementById("user-input") as HTMLInputElement;
const sendBtn = document.getElementById("send-btn")!;
const stopBtn = document.getElementById("stop-btn")!;
const apiKeyInput = document.getElementById("api-key") as HTMLInputElement;

let currentHistory: any[] | null = null;
let isGenerating = false;

const addMessage = (text: string, type: "user" | "ai" | "system" | "log") => {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${type}`;
  messageDiv.textContent = text;
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  return messageDiv;
};

// Listen for logs from the agent
window.electronAPI.onActionLog((message: string) => {
  try {
    const parsed = JSON.parse(message);
    if (parsed.type === "reasoning") {
      addReasoningStep(parsed.data);
      return;
    }
  } catch (e) {
    // Not JSON, treat as regular log
  }
  addMessage(message, "log");
});

const addReasoningStep = (data: {
  plan: string;
  reflection: string;
  thought: string;
}) => {
  const container = document.createElement("div");
  container.className = "reasoning-block";

  const sections = [
    { label: "🗺️ Plan", content: data.plan, class: "plan" },
    { label: "🤔 Reflection", content: data.reflection, class: "reflection" },
    { label: "💡 Thought", content: data.thought, class: "thought" },
  ];

  sections.forEach((s) => {
    if (s.content) {
      const sectionDiv = document.createElement("div");
      sectionDiv.className = `reasoning-section ${s.class}`;

      const label = document.createElement("div");
      label.className = "reasoning-label";
      label.textContent = s.label;

      const content = document.createElement("div");
      content.className = "reasoning-content";
      content.textContent = s.content;

      sectionDiv.appendChild(label);
      sectionDiv.appendChild(content);
      container.appendChild(sectionDiv);
    }
  });

  messagesContainer.appendChild(container);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
};

const addSteps = (steps: string[]) => {
  const messageDiv = document.createElement("div");
  messageDiv.className = "message ai";

  const title = document.createElement("div");
  title.style.fontWeight = "600";
  title.style.marginBottom = "1rem";
  title.style.color = "var(--accent-color)";
  title.textContent = "🏁 Task Complete:";
  messageDiv.appendChild(title);

  const list = document.createElement("ul");
  list.className = "steps-list";

  steps.forEach((step) => {
    const item = document.createElement("li");
    item.className = "step-item";

    const number = document.createElement("span");
    number.className = "step-number";
    number.textContent = "✓";

    const text = document.createElement("span");
    text.textContent = step;

    item.appendChild(number);
    item.appendChild(text);
    list.appendChild(item);
  });

  messageDiv.appendChild(list);
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
};

const handleSend = async () => {
  if (isGenerating) return;

  const prompt = userInput.value.trim();
  const apiKey = apiKeyInput.value.trim();

  if (!prompt) return;
  if (!apiKey) {
    addMessage("⚠️ Please enter your Groq API Key in the top right.", "system");
    return;
  }

  // Set generating state
  isGenerating = true;
  sendBtn.style.display = "none";
  stopBtn.style.display = "flex";

  // Clear input
  userInput.value = "";

  // Add user message
  addMessage(prompt, "user");

  // Add loading state
  const loadingMsg = addMessage("🤖 Agent is thinking...", "ai");

  try {
    const response = await window.electronAPI.generateSteps({
      prompt,
      apiKey,
      history: currentHistory || undefined,
    });

    if (loadingMsg) loadingMsg.remove();

    if (response.question) {
      addMessage(`🙋‍♂️ Question: ${response.question}`, "ai");
      currentHistory = response.history || null;
    } else if (response.results && response.results.length > 0) {
      addSteps(response.results);
      // If it reached max steps, preserve history so user can "continue"
      if (response.results[0].includes("max steps")) {
        currentHistory = response.history || null;
      } else {
        currentHistory = null;
      }
    } else {
      addMessage("❌ Sorry, I couldn't complete the action.", "system");
      currentHistory = null;
    }
  } catch (error) {
    if (loadingMsg) loadingMsg.remove();
    addMessage(`❌ Error: ${error.message}`, "system");
    currentHistory = null;
  } finally {
    isGenerating = false;
    sendBtn.style.display = "flex";
    stopBtn.style.display = "none";
  }
};

const handleStop = async () => {
  if (!isGenerating) return;
  await window.electronAPI.stopGeneration();
};

sendBtn.addEventListener("click", handleSend);
stopBtn.addEventListener("click", handleStop);
userInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") handleSend();
});

// Load API key from localStorage if it exists
const savedKey = localStorage.getItem("groq_api_key");
if (savedKey) {
  apiKeyInput.value = savedKey;
}

apiKeyInput.addEventListener("change", () => {
  localStorage.setItem("groq_api_key", apiKeyInput.value.trim());
});
