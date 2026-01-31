import { app, BrowserWindow, ipcMain, screen, WebContentsView } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import { AgentService } from "./services/agent.service";
import { ElectronBrowserService } from "./services/electron-browser.service";

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let browserView: WebContentsView | null = null;

const createWindow = () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } =
    primaryDisplay.workAreaSize;

  const WINDOW_WIDTH = 1400;
  const CHAT_WIDTH = 400;

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: screenHeight,
    x: screenWidth - WINDOW_WIDTH,
    y: 0,
    frame: true,
    alwaysOnTop: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Create Browser View
  browserView = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.contentView.addChildView(browserView);

  // Layout: Chat on the left (400px), Browser on the right (remaining)
  const updateLayout = () => {
    if (!mainWindow || !browserView) return;
    const { width, height } = mainWindow.getContentBounds();
    browserView.setBounds({
      x: CHAT_WIDTH,
      y: 0,
      width: width - CHAT_WIDTH,
      height: height,
    });
  };

  mainWindow.on("resize", updateLayout);
  updateLayout();

  browserView.webContents.loadURL("about:blank");
  ElectronBrowserService.getInstance().setWebContents(browserView.webContents);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

// Global Agent Instance
let agentInstance: AgentService | null = null;
let lastApiKey: string | null = null;

ipcMain.handle(
  "generate-steps",
  async (
    event,
    { prompt, apiKey, provider, model, openaiKey, visionMode, history },
  ) => {
    // Re-instantiate only if configuration changes
    if (!agentInstance || lastApiKey !== apiKey) {
      console.log("Creating new AgentService instance...");
      agentInstance = new AgentService(
        apiKey,
        model,
        openaiKey,
        visionMode || "auto",
      );
      lastApiKey = apiKey;
    }

    const onLog = (msg: string) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("action-log", msg);
      }
    };

    try {
      // Pass the prompt to the persistent agent
      return await agentInstance.run(prompt, history || [], onLog);
    } catch (error) {
      console.error("Execution Error:", error);
      throw new Error(error.message || "Failed to execute.");
    }
  },
);

ipcMain.handle("stop-generation", async () => {
  return true;
});

app.on("ready", () => {
  createWindow();
});

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
