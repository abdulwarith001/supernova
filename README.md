# Supernova - The Autonomous Cognitive Engine 🚀

**Supernova** is a state-of-the-art autonomous agent system designed to handle complex tasks, reminders, and background missions. It features a sleek web-based dashboard and a powerful background execution engine that dispatches results directly to your inbox.

## 🌟 Core Concepts

- **Interactive Dashboard**: A modern, real-time web interface powered by Socket.IO to chat with your agent and manage tasks.
- **Smart Tasks (Autonomous Missions)**: Scheduled or recurring tasks that go beyond simple alerts. Supernova uses an OODA-loop agent to perform actions (e.g., "Every morning, fetch tech news and email me a summary").
- **Skills System**: Extensible capability system using Markdown-based manifests. Define new tools for the agent by simply adding `.md` files to the `skills/` directory.
- **Persistence**: Your agent lives in the background. Reminders and workspace data survive server restarts.

## 🛠️ Tech Stack

- **Server**: Node.js + Express + Socket.IO (for real-time dashboard communication)
- **Frontend**: Vite + React + Vanilla CSS (Glassmorphism & Rich Typography)
- **AI Brain**: Google Generative AI (Gemini) or OpenAI (GPT-4o)
- **Automation**: Custom cognitive architecture with tool-calling and long-term memory.

## 📦 Getting Started

### 1. Installation

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd supernova
npm install
```

### 2. Shell Configuration

To use the `supernova` command globally, add the following to your shell profile (`~/.zshrc` or `~/.bash_profile`):

```bash
alias supernova="node /absolute/path/to/supernova/bin/supernova.js"
```

_Run `source ~/.zshrc` to apply._

### 3. Onboarding & Setup

Run the interactive onboarding wizard to configure your agent:

```bash
supernova onboard
```

Alternatively, manage specific integrations:

```bash
supernova setup
```

Set the following critical keys in `supernova onboard` or `supernova keys`:

- `OPENAI_API_KEY` or `GEMINI_API_KEY`: Your primary AI brain.
- `REMINDER_EMAIL`: The inbox where autonomous summaries and alerts will be sent.
- `SERPER_API_KEY`: Required for web-searching capabilities.

## 🎮 Usage

### Launch the Dashboard

Start the cognitive server and open the web interface:

```bash
supernova dashboard
```

Accessible at: `http://localhost:3000`

### Smart Task Examples

Tell the agent to handle the future for you:

- _"Remind me to pick up laundry in 2 hours."_ (Simple Alert)
- _"Every morning at 8am, search for the latest tech news and email me the summary."_ (Autonomous Mission)
- _"In 5 minutes, check if the website noteiq.live is up and alert me."_

### Skills Management

Supernova's power comes from its **Skills**. You can manage them via the CLI:

- `supernova skills list`: List all installed capabilities.
- `supernova skills info <name>`: View details of a specific skill.
- `supernova skills add`: Add a new skill from a URL or local file.
- `supernova skills remove <name>`: Remove a skill.

## 📜 CLI Reference

- `supernova onboard`: Comprehensive setup wizard.
- `supernova dashboard`: Launch the web GUI.
- `supernova setup`: Manage integrations (Calendar, Email, etc.).
- `supernova keys`: View and update specific API keys.
- `supernova mode [persona]`: Switch between agent personalities (e.g., Chaos, Butler, Pirate).
- `supernova skills`: Manage agent capabilities.

## 📂 Project Structure

- `bin/`: CLI wrapper.
- `src/cli/`: Implementation of CLI commands.
- `src/services/`: Core logic (Brain, Scheduler, Agent, etc.).
- `src/server/`: Express and Socket.IO server implementation.
- `skills/`: Markdown-based skill definitions.
- `memory/`: Persistent user and agent memory.

---

> [!IMPORTANT]
> **Privacy First**: Background missions are executed in isolated "Task Agent" instances. They prioritize focus and security, ensuring autonomous tasks operate within their specific context.
