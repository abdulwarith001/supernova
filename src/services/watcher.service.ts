import fs from "fs";
import path from "path";

export class WatcherService {
  private watchers: Map<string, fs.FSWatcher> = new Map();

  constructor() {}

  watchDirectory(
    dirPath: string,
    callback: (event: string, filename: string) => void,
  ) {
    if (!fs.existsSync(dirPath)) return;

    if (this.watchers.has(dirPath)) {
      this.watchers.get(dirPath)?.close();
    }

    const watcher = fs.watch(
      dirPath,
      { recursive: true },
      (event, filename) => {
        if (filename) {
          callback(event, filename);
        }
      },
    );

    this.watchers.set(dirPath, watcher);
    console.log(`👁️ Watching directory: ${dirPath}`);
  }

  stopWatching(dirPath: string) {
    if (this.watchers.has(dirPath)) {
      this.watchers.get(dirPath)?.close();
      this.watchers.delete(dirPath);
      console.log(`👁️ Stopped watching: ${dirPath}`);
    }
  }

  stopAll() {
    for (const [path, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();
  }
}
