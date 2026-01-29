import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  generateSteps: (data: { prompt: string; apiKey: string; history?: any[] }) =>
    ipcRenderer.invoke("generate-steps", data),
  stopGeneration: () => ipcRenderer.invoke("stop-generation"),
  onActionLog: (callback: (message: string) => void) =>
    ipcRenderer.on("action-log", (_event, value) => callback(value)),
});
