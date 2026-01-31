import "./index.css";

interface AgentAction {
  tool: string;
  args: any;
  reasoning: string;
}

interface AgentResponse {
  action?: AgentAction;
  reply?: string;
  error?: string;
}

interface ElectronAPI {
  generateSteps: (data: {
    prompt: string;
    apiKey: string;
    provider: string;
    model: string;
    openaiKey?: string;
    visionMode?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  }) => Promise<AgentResponse>;
  stopGeneration: () => Promise<boolean>;
  onActionLog: (callback: (message: string) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

const messagesContainer = document.getElementById("messages") as HTMLElement;
const userInput = document.getElementById("user-input") as HTMLInputElement;
const sendBtn = document.getElementById("send-btn") as HTMLElement;
const stopBtn = document.getElementById("stop-btn") as HTMLElement;
const apiKeyInput = document.getElementById("api-key") as HTMLInputElement;
const providerSelect = document.getElementById(
  "provider-select",
) as HTMLSelectElement;
const modelSelect = document.getElementById(
  "model-select",
) as HTMLSelectElement;
const statusBadge = document.getElementById("extension-status") as HTMLElement;

// Hide Provider Select (It exists in HTML but we don't need it)
if (providerSelect) {
  providerSelect.style.display = "none";
}

// Poll for status removed as it's no longer needed for integrated browser

const OPENAI_MODELS = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"];

const updateModelOptions = () => {
  modelSelect.innerHTML = "";
  OPENAI_MODELS.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    modelSelect.appendChild(option);
  });

  const savedModel = localStorage.getItem(`openai_selected_model`);
  if (savedModel && OPENAI_MODELS.includes(savedModel)) {
    modelSelect.value = savedModel;
  }
};

updateModelOptions();

let isGenerating = false;
const chatHistory: Array<{ role: "user" | "assistant"; content: string }> = [];

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
  addMessage(message, "log");
});

const handleSend = async () => {
  if (isGenerating) return;

  const prompt = userInput.value.trim();
  const apiKey = apiKeyInput.value.trim();

  if (!prompt) return;
  if (!apiKey) {
    addMessage("⚠️ Please enter your OpenAI API Key.", "system");
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
  chatHistory.push({ role: "user", content: prompt });

  // Add loading state
  const loadingMsg = addMessage("🤖 Thinking...", "ai");

  try {
    const response = await window.electronAPI.generateSteps({
      prompt,
      apiKey,
      provider: "openai", // Hardcoded
      model: modelSelect.value,
      openaiKey: apiKey, // Use main key as openai key
      visionMode: "auto",
      history: chatHistory,
    });

    if (loadingMsg) loadingMsg.remove();

    if (response.reply) {
      addMessage(response.reply, "ai");
      chatHistory.push({ role: "assistant", content: response.reply });
    } else {
      addMessage("❌ No response.", "system");
    }
  } catch (error) {
    if (loadingMsg) loadingMsg.remove();
    addMessage(`❌ Error: ${error.message}`, "system");
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

// Load settings
const savedKey = localStorage.getItem(`openai_api_key`);
if (savedKey) {
  apiKeyInput.value = savedKey;
}

apiKeyInput.placeholder = "OpenAI API Key";

modelSelect.addEventListener("change", () => {
  localStorage.setItem(`openai_selected_model`, modelSelect.value);
});

apiKeyInput.addEventListener("change", () => {
  localStorage.setItem(`openai_api_key`, apiKeyInput.value.trim());
});
