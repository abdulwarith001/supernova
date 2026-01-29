import { chromium, BrowserContext, Page } from "playwright";
import { app } from "electron";
import path from "node:path";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const randomDelay = () => delay(Math.floor(Math.random() * 2000) + 1000);

export class BrowserController {
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async init() {
    if (!this.context) {
      const { screen } = require("electron");
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.workAreaSize;

      const chromePath =
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
      const userDataDir = path.join(app.getPath("userData"), "chrome-profile");

      this.context = await chromium.launchPersistentContext(userDataDir, {
        executablePath: chromePath,
        headless: false,
        viewport: { width: width - 400, height },
        args: [
          `--window-position=0,0`,
          `--window-size=${width - 400},${height}`,
          "--disable-blink-features=AutomationControlled",
        ],
        ignoreDefaultArgs: ["--enable-automation"],
      });

      this.page = this.context.pages()[0] || (await this.context.newPage());

      await this.page.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      });
    }
    return this.page!;
  }

  async close() {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.page = null;
    }
  }

  async navigate(url: string) {
    const page = await this.init();
    await randomDelay();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    return `Navigated to ${url}`;
  }

  async searchWeb(query: string) {
    const page = await this.init();
    await randomDelay();
    await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`);
    await page
      .waitForSelector(".result__title", { timeout: 10000 })
      .catch(() => {});
    const results = await page.$$eval(".result__title", (nodes) =>
      nodes.slice(0, 5).map((n) => (n as HTMLElement).innerText),
    );
    return `DuckDuckGo results for "${query}":\n${results.join("\n")}`;
  }

  async getPageContent() {
    const page = await this.init();
    await randomDelay();
    const text = await page.evaluate(() => {
      return document.body.innerText.replace(/\s+/g, " ").slice(0, 3000);
    });
    return text;
  }

  async scroll(direction: "up" | "down") {
    const page = await this.init();
    await randomDelay();
    if (direction === "down") {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    } else {
      await page.evaluate(() => window.scrollBy(0, -window.innerHeight));
    }
    return `Scrolled ${direction}`;
  }

  async click(selector: string) {
    const page = await this.init();
    await randomDelay();
    await page.waitForSelector(selector, { state: "visible", timeout: 10000 });
    await page.locator(selector).scrollIntoViewIfNeeded();
    await page.click(selector, { delay: Math.random() * 200 });
    return `Successfully clicked: ${selector}`;
  }

  async fill(selector: string, value: string) {
    const page = await this.init();
    await randomDelay();
    try {
      await page.waitForSelector(selector, { state: "visible", timeout: 5000 });
      await page.locator(selector).scrollIntoViewIfNeeded();
      await page.click(selector, { clickCount: 3 });
      await page.keyboard.press("Backspace");
      await page.fill(selector, value);
      return `Successfully filled ${selector} with "${value}"`;
    } catch (err) {
      try {
        await page.focus(selector);
        await page.keyboard.type(value);
        return `Fill failed, but typed "${value}" into ${selector} instead.`;
      } catch (err2) {
        throw new Error(
          `Failed to fill or type into ${selector}: ${err.message}`,
        );
      }
    }
  }

  async getInteractiveElements() {
    const page = await this.init();
    await randomDelay();
    const elements = await page.evaluate(() => {
      const interactives = Array.from(
        document.querySelectorAll(
          'button, a, input, select, textarea, [role="button"], [role="link"]',
        ),
      );
      return interactives
        .map((el, index) => {
          const htmlEl = el as HTMLElement;
          const rect = htmlEl.getBoundingClientRect();
          return {
            index: index + 1,
            tag: htmlEl.tagName.toLowerCase(),
            text: (
              htmlEl.innerText ||
              (htmlEl as HTMLInputElement).value ||
              htmlEl.getAttribute("aria-label") ||
              ""
            )
              .slice(0, 50)
              .trim(),
            role: htmlEl.getAttribute("role") || "",
            type: (htmlEl as HTMLInputElement).type || "",
            placeholder: (htmlEl as HTMLInputElement).placeholder || "",
            isVisible: rect.width > 0 && rect.height > 0,
          };
        })
        .filter((el) => el.isVisible && (el.text || el.placeholder));
    });

    return `INTERACTIVE ELEMENTS:\n${elements.map((e) => `[${e.index}] ${e.tag}${e.role ? ` (role: ${e.role})` : ""}${e.type ? ` (type: ${e.type})` : ""}: "${e.text || e.placeholder}"`).join("\n")}`;
  }

  async clickByIndex(index: number): Promise<string> {
    const page = await this.init();
    await randomDelay();

    const selector = await page.evaluate((idx) => {
      const allInteractives = Array.from(
        document.querySelectorAll(
          'button, a, input, select, textarea, [role="button"], [role="link"]',
        ),
      ) as HTMLElement[];

      const filtered = allInteractives.filter((el) => {
        const rect = el.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;
        const textValue =
          el.innerText ||
          (el as HTMLInputElement).value ||
          el.getAttribute("aria-label") ||
          "";
        const placeholderValue = (el as HTMLInputElement).placeholder || "";
        return isVisible && (textValue.trim() || placeholderValue.trim());
      });

      const elementToClick = filtered[idx - 1];
      if (!elementToClick) return null;

      if (elementToClick.id) return "#" + elementToClick.id;
      if (elementToClick.tagName === "A" && elementToClick.getAttribute("href"))
        return 'a[href="' + elementToClick.getAttribute("href") + '"]';

      const tempId = "ai-click-" + Math.random().toString(36).slice(2, 9);
      elementToClick.setAttribute("data-ai-temp-id", tempId);
      return '[data-ai-temp-id="' + tempId + '"]';
    }, index);

    if (!selector) return `Error: Could not find element with index [${index}]`;

    await page.click(selector);
    return `Successfully clicked element [${index}]`;
  }
}
