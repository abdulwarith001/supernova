import { WebContents } from "electron";

export class ElectronBrowserService {
  private static instance: ElectronBrowserService | null = null;
  private webContents: WebContents | null = null;

  private constructor() {}

  static getInstance(): ElectronBrowserService {
    if (!ElectronBrowserService.instance) {
      ElectronBrowserService.instance = new ElectronBrowserService();
    }
    return ElectronBrowserService.instance;
  }

  setWebContents(contents: WebContents) {
    this.webContents = contents;
  }

  async goto(url: string): Promise<string> {
    if (!this.webContents) return "Browser view not initialized.";
    console.log(`Navigating to: ${url}`);
    await this.webContents.loadURL(url);
    // Wait for a bit for the page to settle
    await new Promise((r) => setTimeout(r, 1000));
    return this.formatObservation(`Navigated to: ${url}`);
  }

  async getSnapshot() {
    if (!this.webContents) return { title: "N/A", content: "N/A" };

    const title = this.webContents.getTitle();
    const url = this.webContents.getURL();

    const metadata = await this.webContents.executeJavaScript(`
      (() => {
        const getSelector = (el) => {
          if (el.id) return '#' + el.id;
          if (el.getAttribute('data-testid')) return '[data-testid="' + el.getAttribute('data-testid') + '"]';
          if (el.name) return '[name="' + el.name + '"]';
          if (el.className && typeof el.className === 'string') {
            const firstClass = el.className.trim().split(/\\s+/)[0];
            if (firstClass) return '.' + firstClass;
          }
          return el.tagName.toLowerCase();
        };

        const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'))
          .map(el => ({
            text: el.innerText.trim(),
            selector: getSelector(el),
            tagName: el.tagName.toLowerCase(),
            id: el.id || '',
            classes: typeof el.className === 'string' ? el.className : ''
          }))
          .filter(b => b.text.length > 0 && b.text.length < 100);

        const inputs = Array.from(document.querySelectorAll('input, textarea, select'))
          .map(el => ({
            placeholder: el.placeholder || '',
            name: el.name || '',
            value: el.value || '',
            selector: getSelector(el),
            id: el.id || '',
            classes: typeof el.className === 'string' ? el.className : '',
            label: el.labels?.[0]?.innerText || ''
          }));

        return {
          buttons: buttons.slice(0, 30),
          inputs: inputs.slice(0, 30),
          text: document.body.innerText.substring(0, 3000)
        };
      })()
    `);

    return {
      title,
      url,
      ...metadata,
    };
  }

  public async formatObservation(actionResult: string): Promise<string> {
    const snapshot = await this.getSnapshot();
    let observation = `${actionResult}\n\n`;
    observation += `Current Page: ${snapshot.title} (${snapshot.url})\n`;

    if (snapshot.inputs && snapshot.inputs.length > 0) {
      observation +=
        `\nInputs Found:\n` +
        snapshot.inputs
          .map((i: any) => {
            const parts = [
              `- [${i.selector}] ${i.placeholder || i.name || "Input"}`,
            ];
            if (i.id) parts.push(`ID: ${i.id}`);
            if (i.classes)
              parts.push(`Classes: .${i.classes.replace(/ /g, ".")}`);
            if (i.label) parts.push(`Label: ${i.label}`);
            return parts.join(" | ");
          })
          .join("\n") +
        `\n`;
    }

    if (snapshot.buttons && snapshot.buttons.length > 0) {
      observation +=
        `\nButtons/Links Found:\n` +
        snapshot.buttons
          .map((b: any) => {
            const parts = [`- [${b.selector}] ${b.text}`];
            if (b.id) parts.push(`ID: ${b.id}`);
            if (b.classes)
              parts.push(`Classes: .${b.classes.replace(/ /g, ".")}`);
            return parts.join(" | ");
          })
          .join("\n") +
        `\n`;
    }

    observation += `\nContent Snippet:\n${(snapshot as any).text.substring(0, 700)}`;

    return observation;
  }

  async screenshot(): Promise<string> {
    if (!this.webContents) return "";
    const nativeImage = await this.webContents.capturePage();
    return nativeImage.toDataURL();
  }

  async click(selector: string): Promise<string> {
    if (!this.webContents) return "Browser view not initialized.";

    const success = await this.webContents.executeJavaScript(`
      (() => {
        const el = document.querySelector("${selector}") || 
                   Array.from(document.querySelectorAll("button, a, span, div")).find(e => e.innerText.trim().toLowerCase() === "${selector.toLowerCase()}" || e.innerText.trim().includes("${selector}"));
        if (el) {
          el.click();
          return true;
        }
        return false;
      })()
    `);

    if (!success) return `Could not find element to click: ${selector}`;

    // Wait for the UI to update
    await new Promise((r) => setTimeout(r, 1500));
    return this.formatObservation(`Clicked ${selector}`);
  }

  async type(selector: string, text: string): Promise<string> {
    if (!this.webContents) return "Browser view not initialized.";

    const success = await this.webContents.executeJavaScript(`
      (() => {
        const el = document.querySelector("${selector}") || 
                   Array.from(document.querySelectorAll("input, textarea")).find(e => e.placeholder?.includes("${selector}") || e.name === "${selector}" || e.labels?.[0]?.innerText.includes("${selector}"));
        if (el) {
          el.focus();
          el.value = "${text}";
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      })()
    `);

    if (!success) return `Could not find input to type into: ${selector}`;

    return this.formatObservation(`Typed "${text}" into ${selector}`);
  }

  async scroll(
    direction: "up" | "down",
    amount: number = 500,
  ): Promise<string> {
    if (!this.webContents) return "Browser view not initialized.";

    const scrollAmount = direction === "up" ? -amount : amount;
    await this.webContents.executeJavaScript(
      `window.scrollBy(0, ${scrollAmount})`,
    );

    return `Scrolled ${direction} by ${amount}px`;
  }

  async executeJS(script: string): Promise<string> {
    if (!this.webContents) return "Browser view not initialized.";
    try {
      const result = await this.webContents.executeJavaScript(script);
      const observation = await this.formatObservation(
        `Executed JS script: ${script.substring(0, 50)}...`,
      );
      return `Result: ${JSON.stringify(result)}\n\n${observation}`;
    } catch (e: any) {
      return `Error executing JS: ${e.message}`;
    }
  }
}
