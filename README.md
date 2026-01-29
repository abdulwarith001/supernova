# Bot Test - AI Automation Agent

**Bot Test** is an intelligent desktop automation tool built with Electron. It combines a custom browser controller with AI reasoning (via Groq/LLaMA) to perform complex web interactions and system tasks autonomously.

> [!WARNING]
> **Experimental Status**: This project is currently in an early **Alpha** stage and is highly experimental. It contains known bugs, incomplete features, and may behave unpredictably. Use with caution!

## 🚀 Features

- **AI-Powered Automation**: Uses Large Language Models (LLaMA 3 via Groq) to plan and execute tasks.
- **Custom Browser Control**: Built-in `BrowserController` using Playwright for robust web interaction (navigation, clicking, filling forms).
- **Visual Feedback**: Includes a dedicated "Hand" window that visually mimics cursor movements and clicks.
- **System Integration**: Capable of system-level interactions (mouse movement, keyboard typing, app management).
- **Reasoning Visualization**: Displays the AI's thought process (Plan, Reflection, Thought) in real-time.

## 🛠️ Tech Stack

- **Framework**: [Electron](https://www.electronjs.org/)
- **Frontend**: [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Automation**: [Playwright](https://playwright.dev/)
- **AI/LLM**: [Groq SDK](https://console.groq.com/) (OpenAI-compatible)

## 📦 Installation

1.  **Clone the repository**

    ```bash
    git clone <repository-url>
    cd bot-test
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

## 🎮 Usage

1.  **Start the Application**

    ```bash
    npm start
    ```

2.  **Configure API Key**
    - Launch the app.
    - Enter your [Groq API Key](https://console.groq.com/keys) in the input field at the top right.

3.  **Run a Task**
    - Type a command in the input box (e.g., "Go to Google and search for the latest tech news").
    - Watch as the agent plans and executes the steps.

## 📜 Scripts

- `npm start`: Starts the application in development mode.
- `npm run package`: Packages the application for distribution.
- `npm run make`: Creates installers (zip, dmg, etc.).
- `npm run lint`: Lints the codebase using ESLint.

## 🤝 Contributing

1.  Fork the project
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request
