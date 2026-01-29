import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import { BrowserController } from "./controllers/browser.controller";
import { SystemController } from "./controllers/system.controller";
import { AgentService } from "./services/agent.service";

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let handWindow: BrowserWindow | null = null;
let currentAbortController: AbortController | null = null;

const browserController = new BrowserController();
const systemController = new SystemController(() => handWindow);

const createWindow = () => {
  const { screen } = require("electron");
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: 400,
    height: primaryDisplay.workAreaSize.height,
    x: width - 400,
    y: 0,
    frame: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  handWindow = new BrowserWindow({
    width: 60,
    height: 60,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    type: "panel",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  handWindow.setIgnoreMouseEvents(true);
  handWindow.hide();

  const handHtml = `
    <!doctype html>
    <html>
      <head>
        <style>
          body { margin: 0; padding: 0; overflow: hidden; background: transparent; display: flex; align-items: center; justify-content: center; height: 100vh; width: 100vw; }
          .hand-cursor { width: 60px; height: 60px; filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5)); transition: transform 0.1s ease-out; user-select: none; pointer-events: none; }
          .hand-cursor.clicking { transform: scale(0.8); }
          svg { width: 100%; height: 100%; }
        </style>
      </head>
      <body>
        <div id="hand" class="hand-cursor">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 21.5C6.7533 21.5 2.5 17.2467 2.5 12C2.5 6.7533 6.7533 2.5 12 2.5C17.2467 2.5 21.5 6.7533 21.5 12C21.5 17.2467 17.2467 21.5 12 21.5ZM12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4Z" fill="#38BDF8"/>
            <path d="M12 18C8.68629 18 6 15.3137 6 12C6 8.68629 8.68629 6 12 6C15.3137 6 18 8.68629 18 12C18 15.3137 15.3137 18 12 18ZM12 7.5C9.51472 7.5 7.5 9.51472 7.5 12C7.5 14.4853 9.51472 16.5 12 16.5C14.4853 16.5 16.5 14.4853 16.5 12C16.5 9.51472 14.4853 7.5 12 7.5Z" fill="#38BDF8"/>
            <circle cx="12" cy="12" r="3" fill="#38BDF8" />
          </svg>
        </div>
        <script>
          const hand = document.getElementById("hand");
          window.electronAPI.onActionLog((message) => {
            if (message === "hand-click-start") { hand.classList.add("clicking"); }
            else if (message === "hand-click-end") { hand.classList.remove("clicking"); }
          });
        </script>
      </body>
    </html>
  `;

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    handWindow.loadURL(
      "data:text/html;charset=utf-8," + encodeURIComponent(handHtml),
    );
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
    handWindow.loadURL(
      "data:text/html;charset=utf-8," + encodeURIComponent(handHtml),
    );
  }
};

ipcMain.handle(
  "generate-steps",
  async (event, { prompt, apiKey, history: existingHistory }) => {
    // Abort any existing task before starting a new one
    if (currentAbortController) {
      currentAbortController.abort();
    }
    currentAbortController = new AbortController();

    const agent = new AgentService(apiKey, browserController, systemController);

    const onLog = (msg: string) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("action-log", msg);
      }
    };

    try {
      return await agent.run(
        prompt,
        existingHistory,
        onLog,
        currentAbortController.signal,
      );
    } catch (error) {
      console.error("Execution Error:", error);
      throw new Error(error.message || "Failed to execute.");
    } finally {
      currentAbortController = null;
    }
  },
);

ipcMain.handle("stop-generation", async () => {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
    return true;
  }
  return false;
});

app.on("ready", createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
