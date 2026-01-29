import { exec } from "node:child_process";
import { promisify } from "node:util";
import { BrowserWindow } from "electron";

const execAsync = promisify(exec);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class SystemController {
  private getHandWindow: () => BrowserWindow | null;

  constructor(getHandWindow: () => BrowserWindow | null) {
    this.getHandWindow = getHandWindow;
  }

  async listApps() {
    const { stdout } = await execAsync("ls /Applications");
    const apps = stdout
      .split("\n")
      .filter((line) => line.endsWith(".app"))
      .map((app) => app.replace(".app", ""));
    return `Installed Apps: ${apps.slice(0, 20).join(", ")} (total ${apps.length})`;
  }

  async openApp(appName: string) {
    await execAsync(`open -a "${appName}"`);
    return `Opened application: ${appName}`;
  }

  async runAppleScript(script: string) {
    const escapedScript = script.replace(/"/g, '\\"');
    const { stdout } = await execAsync(`osascript -e "${escapedScript}"`);
    return `AppleScript Result: ${stdout.trim()}`;
  }

  async getSystemState() {
    const script = `
      tell application "System Events"
        set activeApps to name of every process whose background only is false
        set frontApp to name of first process whose frontmost is true
        set windowInfo to {}
        try
          tell process frontApp
            set winList to every window
            repeat with win in winList
              set winTitle to name of win
              set winPos to position of win
              set winSize to size of win
              set end of windowInfo to {app: frontApp, window: winTitle, pos: winPos, size: winSize}
            end repeat
          end tell
        end try
        return {activeApps: activeApps, frontApp: frontApp, windows: windowInfo}
      end tell
    `;
    const { stdout } = await execAsync(`osascript -e '${script}'`);
    return `System State: ${stdout.trim()}`;
  }

  async mouseMove(x: number, y: number) {
    const handWindow = this.getHandWindow();
    if (handWindow) {
      handWindow.show();
      handWindow.setPosition(Math.round(x - 30), Math.round(y - 30));
    }
    return `Moved hand to ${x}, ${y}`;
  }

  async mouseClick(x: number, y: number) {
    await this.mouseMove(x, y);
    const handWindow = this.getHandWindow();
    if (handWindow)
      handWindow.webContents.send("action-log", "hand-click-start");
    await execAsync(
      `osascript -e 'tell application "System Events" to click at {${x}, ${y}}'`,
    );
    await delay(200);
    if (handWindow) handWindow.webContents.send("action-log", "hand-click-end");
    return `Pointed and clicked at ${x}, ${y}`;
  }

  async keyboardType(text: string) {
    const escapedText = text.replace(/"/g, '\\"');
    const script = `
      try
        tell application "System Events"
          if not (UI elements enabled) then
            return "ERROR: Accessibility permissions not granted"
          end if
          set frontAppName to name of first process whose frontmost is true
          tell process frontAppName
            set frontmost to true
            keystroke "${escapedText}"
          end tell
          return "Typed: ${text}"
        end tell
      on error errMsg
        return "ERROR: " & errMsg
      end try
    `;
    const { stdout } = await execAsync(`osascript -e '${script}'`);
    const result = stdout.trim();
    if (result.startsWith("ERROR:")) {
      throw new Error(result);
    }
    return result;
  }

  async wait(ms: number) {
    await delay(ms);
    return `Waited for ${ms}ms`;
  }
}
