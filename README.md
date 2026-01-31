# Supernova - Integrated Cognitive Agent

**Supernova** is a powerful desktop automation tool that integrates a full browser experience directly into an Electron application. It uses advanced AI reasoning to perform web tasks with surgical precision, leveraging rich DOM metadata and native JavaScript execution.

## 🚀 Key Features

- **Integrated Browser View**: A native `WebContentsView` side-by-side with the chat interface for a seamless automation experience.
- **Rich DOM Observations**: The agent "sees" the page structure (IDs, classes, labels) automatically after every interaction.
- **JavaScript Superpowers**: An `execute_js` tool allows the agent to solve complex interaction problems using native browser scripts.
- **Precision Selectors**: Hardened logic that prioritizes stable CSS selectors (IDs, Data-TestIDs) over fragile text matches.
- **Real-Time Reasoning**: Watch the agent's OODA loop (Observe, Orient, Decide, Act) as it navigates, reflects, and executes.
- **Session Persistence**: Maintains logins and state across application restarts using native Electron sessions.

## 🛠️ Tech Stack

- **Framework**: [Electron](https://www.electronjs.org/) (Native `WebContentsView`)
- **Frontend**: [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/) + Vanilla CSS
- **AI/LLM**: [OpenAI](https://openai.com/) (GPT-4o) & [Groq](https://groq.com/) (LLaMA 3)
- **Vision**: Integrated OpenAI Vision for complex UI analysis.

## 📦 Installation

1.  **Clone the repository**

    ```bash
    git clone <repository-url>
    cd supernova
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

## 🎮 Usage

1.  **Environment Setup**
    Create a `.env` file or use the in-app settings to provide your API keys:
    - `OPENAI_API_KEY` (Required for Vision and GPT-4o)
    - `GROQ_API_KEY` (If using LLaMA 3)

2.  **Start the Application**

    ```bash
    npm start
    ```

3.  **Run a Task**
    - Type a command (e.g., "Join the waitlist on noteiq.live").
    - The browser view on the right will show the agent's progress in real-time.

## 📜 Scripts

- `npm start`: Starts the development server and Electron app.
- `npm run package`: Packages the app for production.
- `npm run make`: Creates distribution installers.

---

> [!TIP]
> **Pro Tip**: The agent is now trained to use `execute_js` for tricky forms. If it gets stuck, it might try to write its own selector logic in JavaScript!
