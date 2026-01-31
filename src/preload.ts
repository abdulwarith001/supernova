import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  generateSteps: (data: {
    prompt: string;
    apiKey: string;
    provider: string;
    model: string;
    openaiKey?: string;
    visionMode?: string;
    history?: any[];
  }) => ipcRenderer.invoke("generate-steps", data),
  stopGeneration: () => ipcRenderer.invoke("stop-generation"),
  onActionLog: (callback: (message: string) => void) =>
    ipcRenderer.on("action-log", (_event, value) => callback(value)),
});
