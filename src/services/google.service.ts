import { google } from "googleapis";
import { decrypt } from "../utils/crypto";
import fs from "fs";
import path from "path";
import os from "os";

export class GoogleService {
  private auth: any;
  private config: any;

  constructor() {
    this.loadConfig();
    this.initAuth();
  }

  private loadConfig() {
    const CONFIG_FILE = path.join(os.homedir(), ".supernova", "config.json");
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        this.config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      } catch (e) {
        this.config = {};
      }
    } else {
      this.config = {};
    }
  }

  private initAuth() {
    const clientId = this.getSecret("GOOGLE_CLIENT_ID");
    const clientSecret = this.getSecret("GOOGLE_CLIENT_SECRET");
    const refreshToken = this.getSecret("GOOGLE_REFRESH_TOKEN");
    const accessToken = this.getSecret("GOOGLE_ACCESS_TOKEN");

    if (!clientId || !clientSecret) return;

    this.auth = new google.auth.OAuth2(
      clientId,
      clientSecret,
      "http://localhost:3000/auth/callback", // Default callback
    );

    if (refreshToken || accessToken) {
      this.auth.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    }
  }

  isCalendarEnabled(): boolean {
    return !!this.auth && !!this.config["GOOGLE_CALENDAR_ENABLED"];
  }

  isEmailEnabled(): boolean {
    return !!this.auth && !!this.config["GOOGLE_EMAIL_ENABLED"];
  }

  private getSecret(key: string): string | null {
    const val = this.config[key];
    if (!val) return null;
    try {
      return decrypt(val);
    } catch (e) {
      return val; // Fallback to plain text if not encrypted
    }
  }

  async listCalendarEvents(timeMin?: string) {
    if (!this.auth) throw new Error("Google Calendar not configured.");
    const calendar = google.calendar({ version: "v3", auth: this.auth });
    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: timeMin || new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: "startTime",
    });
    return res.data.items;
  }

  async createCalendarEvent(event: any) {
    if (!this.auth) throw new Error("Google Calendar not configured.");
    const calendar = google.calendar({ version: "v3", auth: this.auth });
    const res = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
    });
    return res.data;
  }

  async searchEmails(query: string = "is:unread") {
    if (!this.auth) throw new Error("Gmail not configured.");
    const gmail = google.gmail({ version: "v1", auth: this.auth });
    const res = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 5,
    });

    if (!res.data.messages) return [];

    const detailedMessages = await Promise.all(
      res.data.messages.map(async (msg: any) => {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "metadata",
          metadataHeaders: ["Subject", "From", "Date"],
        });

        const headers = detail.data.payload?.headers || [];
        const subject =
          headers.find((h: any) => h.name === "Subject")?.value ||
          "(No Subject)";
        const from =
          headers.find((h: any) => h.name === "From")?.value || "Unknown";

        return {
          id: msg.id,
          threadId: msg.threadId,
          subject,
          from,
          snippet: detail.data.snippet,
        };
      }),
    );

    return detailedMessages;
  }

  async readEmail(id: string) {
    if (!this.auth) throw new Error("Gmail not configured.");
    const gmail = google.gmail({ version: "v1", auth: this.auth });
    const res = await gmail.users.messages.get({
      userId: "me",
      id,
    });

    const headers = res.data.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === "Subject")?.value || "";
    const from = headers.find((h: any) => h.name === "From")?.value || "";
    const body = res.data.snippet || ""; // Simplification for now to avoid huge base64 body parsing

    return {
      id: res.data.id,
      from,
      subject,
      snippet: res.data.snippet,
      historyId: res.data.historyId,
    };
  }

  async sendEmail(to: string, subject: string, body: string) {
    if (!this.auth) throw new Error("Gmail not configured.");
    const gmail = google.gmail({ version: "v1", auth: this.auth });

    // Simple base64 encoding for Gmail format
    const str = [
      'Content-Type: text/plain; charset="UTF-8"\n',
      "MIME-Version: 1.0\n",
      "Content-Transfer-Encoding: 7bit\n",
      `to: ${to}\n`,
      `subject: ${subject}\n\n`,
      body,
    ].join("");

    const encodedMail = Buffer.from(str)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMail,
      },
    });
    return res.data;
  }

  async getUserProfile() {
    if (!this.auth) return null;
    const oauth2 = google.oauth2({ version: "v2", auth: this.auth });
    try {
      const { data } = await oauth2.userinfo.get();
      return data;
    } catch (e: any) {
      console.warn(
        "⚠️ GoogleService: Failed to fetch user profile.",
        e.message,
      );
      return null;
    }
  }
}
