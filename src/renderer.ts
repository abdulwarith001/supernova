import "./index.css";
import { io } from "socket.io-client";
import { marked } from "marked";

const socket = io(); // Connects to same origin by default

// Configure marked for safety/options if needed
marked.use({
  breaks: true,
  gfm: true,
});

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

const messagesContainer = document.getElementById("messages") as HTMLElement;
const userInput = document.getElementById("user-input") as HTMLInputElement;
const sendBtn = document.getElementById("send-btn") as HTMLElement;
const stopBtn = document.getElementById("stop-btn") as HTMLElement;
const modelSelect = document.getElementById(
  "model-select",
) as HTMLSelectElement;

const OPENAI_MODELS = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"];

const updateModelOptions = () => {
  modelSelect.innerHTML = "";
  OPENAI_MODELS.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    modelSelect.appendChild(option);
  });
};

updateModelOptions();

let isGenerating = false;
const chatHistory: Array<{ role: "user" | "assistant"; content: string }> = [];

const addMessage = (text: string, type: "user" | "ai" | "system" | "log") => {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${type}`;

  if (type === "ai") {
    // Parse Markdown for AI responses
    // Using a wrapper div to contain markdown content
    const contentWrapper = document.createElement("div");
    contentWrapper.className = "markdown-content";
    contentWrapper.innerHTML = marked.parse(text) as string;
    messageDiv.appendChild(contentWrapper);
  } else {
    messageDiv.textContent = text;
  }

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  return messageDiv;
};

// Listen for logs from the agent via Socket.IO
socket.on("action-log", (message: string) => {
  addMessage(message, "log");
});

socket.on("chat-reply", (response: AgentResponse) => {
  // Remove loading message if exists
  const loaders = document.querySelectorAll(".message.ai");
  loaders.forEach((l) => {
    if (l.textContent === "🤖 Thinking...") l.remove();
  });

  if (response.reply) {
    addMessage(response.reply, "ai");
    chatHistory.push({ role: "assistant", content: response.reply });
  } else if (response.error) {
    addMessage(`❌ Error: ${response.error}`, "system");
  }

  isGenerating = false;
  sendBtn.style.display = "flex";
  stopBtn.style.display = "none";
});

socket.on("init-config", (config: any) => {
  const providerEl = document.getElementById("current-provider");
  if (providerEl) {
    providerEl.textContent = config.provider;
  }

  const personaEl = document.getElementById("active-persona");
  if (personaEl) {
    const emojis: Record<string, string> = {
      butler: "🎩 Butler",
      pirate: "🏴‍☠️ Pirate",
      romantic: "❤️ Romantic",
      wild: "👹 Wild",
      local: "🇳🇬 Local",
      fun: "🥳 Fun",
      default: "🤖 Default",
    };
    personaEl.textContent = emojis[config.persona as string] || "🤖 Default";
  }

  if (config.missing_keys && config.missing_keys.length > 0) {
    const keys = config.missing_keys.join(", ");
    addMessage(
      `⚠️ **Action Required**: Some skills are missing API keys: ${keys}. Please run \`supernova keys\` in your terminal to configure them.`,
      "system",
    );
  }

  modelSelect.value = config.model;
});

// --- Hunter Dashboard UI ---

socket.on("error", (msg: string) => {
  addMessage(`❌ Error: ${msg}`, "system");
  isGenerating = false;
  sendBtn.style.display = "flex";
  stopBtn.style.display = "none";
});

// --- Reminder Notifications ---
socket.on("reminder-triggered", (job: any) => {
  console.log("🔔 Reminder Triggered:", job);

  // 1. Browser Notification
  if (Notification.permission === "granted") {
    new Notification("Supernova Reminder", {
      body: job.message,
      icon: "/icon.png", // specific icon if available
    });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        new Notification("Supernova Reminder", {
          body: job.message,
        });
      }
    });
  }

  // 2. Audio Alert (Simple Beep)
  const audioContext = new (
    window.AudioContext || (window as any).webkitAudioContext
  )();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4
  gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);

  oscillator.start();
  setTimeout(() => oscillator.stop(), 500); // 0.5s beep

  // 3. UI Alert (Modal or Toast)
  addMessage(`⏰ **REMINDER**: ${job.message}`, "system");
  alert(`⏰ REMINDER: ${job.message}`);
});

const handleSend = async () => {
  if (isGenerating) return;

  const prompt = userInput.value.trim();
  // No client-side API Key check. Server handles it from config.

  if (!prompt) return;

  // Set generating state
  isGenerating = true;
  sendBtn.style.display = "none";
  stopBtn.style.display = "flex";

  // Clear input
  userInput.value = "";

  // Add user message
  addMessage(prompt, "user");
  chatHistory.push({ role: "user", content: prompt });

  // Emit event to server
  socket.emit("start-chat", {
    prompt,
    apiKey: "", // Server will load from config
    model: modelSelect.value,
    history: chatHistory,
  });
};

const handleStop = async () => {
  if (!isGenerating) return;
  socket.emit("stop-chat");
  isGenerating = false;
  sendBtn.style.display = "flex";
  stopBtn.style.display = "none";
};

sendBtn.addEventListener("click", handleSend);
stopBtn.addEventListener("click", handleStop);
userInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") handleSend();
});

// Load settings for model only
const savedModel = localStorage.getItem(`openai_selected_model`);
if (savedModel) {
  modelSelect.value = savedModel;
}

modelSelect.addEventListener("change", () => {
  localStorage.setItem(`openai_selected_model`, modelSelect.value);
});

// --- Reminders UI ---

const remindersBtn = document.getElementById(
  "reminders-btn",
) as HTMLButtonElement;
const remindersModal = document.getElementById(
  "reminders-modal",
) as HTMLDialogElement;
const closeRemindersBtn = document.getElementById(
  "close-reminders-btn",
) as HTMLButtonElement;
const remindersList = document.getElementById(
  "reminders-list",
) as HTMLUListElement;

const fetchReminders = async () => {
  try {
    const res = await fetch("/api/reminders"); // Endpoint hosted by server/index.ts
    const reminders = await res.json();
    renderReminders(reminders);
  } catch (e) {
    console.error("Failed to fetch reminders:", e);
    // If running dev without server proxy, this might fail unless we mock or have correct proxy
    // If running dev without server proxy, this might fail unless we mock or have correct proxy
    /* if (import.meta.env.DEV) {
       console.warn("Dev mode: Fake reminders for testing if API fails.");
    } */
  }
};

const renderReminders = (reminders: any[]) => {
  remindersList.innerHTML = "";
  if (reminders.length === 0) {
    remindersList.innerHTML = `<li style="text-align:center;color:#71717a;padding:2rem;">No reminders set.</li>`;
    return;
  }

  // Sort: Pending first, then by date
  // Actually simpler: sort by dueAt desc
  reminders.sort((a, b) => a.dueAt - b.dueAt);

  reminders.forEach((r) => {
    const li = document.createElement("li");
    li.className = "reminder-item";

    const isCompleted = r.status === "completed";
    const dateStr = new Date(r.dueAt).toLocaleString();

    li.innerHTML = `
      <div class="reminder-info">
        <span class="reminder-msg ${isCompleted ? "completed" : ""}">${r.message}</span>
        <span class="reminder-time">${isCompleted ? "✅ Completed" : "⏰ " + dateStr}</span>
      </div>
      <button class="delete-reminder-btn" data-id="${r.id}" title="Delete">✕</button>
    `;
    remindersList.appendChild(li);
  });

  // Attach delete handlers
  document.querySelectorAll(".delete-reminder-btn").forEach((btn) => {
    btn.addEventListener("click", async (e: any) => {
      const id = e.target.closest("button").dataset.id;
      if (confirm("Delete this reminder?")) {
        await fetch(`/api/reminders/${id}`, { method: "DELETE" });
        fetchReminders();
      }
    });
  });
};

if (remindersBtn && remindersModal) {
  remindersBtn.addEventListener("click", () => {
    remindersModal.showModal();
    fetchReminders();
  });

  closeRemindersBtn.addEventListener("click", () => {
    remindersModal.close();
  });
}
