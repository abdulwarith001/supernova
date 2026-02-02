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
      q: query === "all" ? "" : query,
      maxResults: 10,
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

  async readEmail(id: string, format: "full" | "snippet" = "snippet") {
    if (!this.auth) throw new Error("Gmail not configured.");
    const gmail = google.gmail({ version: "v1", auth: this.auth });
    const res = await gmail.users.messages.get({
      userId: "me",
      id,
    });

    const headers = res.data.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === "Subject")?.value || "";
    const from = headers.find((h: any) => h.name === "From")?.value || "";
    const date = headers.find((h: any) => h.name === "Date")?.value || "";

    let body = res.data.snippet || "";
    if (format === "full") {
      body = this.extractBody(res.data.payload) || body;
    }

    return {
      id: res.data.id,
      from,
      subject,
      date,
      body,
      snippet: res.data.snippet,
    };
  }

  private extractBody(payload: any): string {
    if (!payload) return "";
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, "base64").toString("utf-8");
    }
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === "text/plain" && part.body?.data) {
          return Buffer.from(part.body.data, "base64").toString("utf-8");
        }
        if (part.parts) {
          const body = this.extractBody(part);
          if (body) return body;
        }
      }
    }
    return "";
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

  async trashEmail(id: string) {
    if (!this.auth) throw new Error("Gmail not configured.");
    const gmail = google.gmail({ version: "v1", auth: this.auth });
    const res = await gmail.users.messages.trash({
      userId: "me",
      id,
    });
    return res.data;
  }

  async archiveEmail(id: string) {
    if (!this.auth) throw new Error("Gmail not configured.");
    const gmail = google.gmail({ version: "v1", auth: this.auth });
    // Archiving in Gmail means removing the 'INBOX' label
    const res = await gmail.users.messages.modify({
      userId: "me",
      id,
      requestBody: {
        removeLabelIds: ["INBOX"],
      },
    });
    return res.data;
  }

  async modifyEmailLabels(
    id: string,
    addLabels: string[] = [],
    removeLabels: string[] = [],
  ) {
    if (!this.auth) throw new Error("Gmail not configured.");
    const gmail = google.gmail({ version: "v1", auth: this.auth });
    const res = await gmail.users.messages.modify({
      userId: "me",
      id,
      requestBody: {
        addLabelIds: addLabels,
        removeLabelIds: removeLabels,
      },
    });
    return res.data;
  }

  async untrashEmail(id: string) {
    if (!this.auth) throw new Error("Gmail not configured.");
    const gmail = google.gmail({ version: "v1", auth: this.auth });
    const res = await gmail.users.messages.untrash({
      userId: "me",
      id,
    });
    return res.data;
  }

  async listLabels() {
    if (!this.auth) throw new Error("Gmail not configured.");
    const gmail = google.gmail({ version: "v1", auth: this.auth });
    const res = await gmail.users.labels.list({
      userId: "me",
    });
    return res.data.labels;
  }

  async createDraft(
    to: string,
    subject: string,
    body: string,
    threadId?: string,
  ) {
    if (!this.auth) throw new Error("Gmail not configured.");
    const gmail = google.gmail({ version: "v1", auth: this.auth });

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

    const res = await gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          raw: encodedMail,
          threadId,
        },
      },
    });
    return res.data;
  }

  async listDrafts() {
    if (!this.auth) throw new Error("Gmail not configured.");
    const gmail = google.gmail({ version: "v1", auth: this.auth });
    const res = await gmail.users.drafts.list({
      userId: "me",
      maxResults: 10,
    });
    return res.data.drafts;
  }

  async sendDraft(id: string) {
    if (!this.auth) throw new Error("Gmail not configured.");
    const gmail = google.gmail({ version: "v1", auth: this.auth });
    const res = await gmail.users.drafts.send({
      userId: "me",
      requestBody: {
        id,
      },
    });
    return res.data;
  }

  async replyToEmail(threadId: string, body: string) {
    if (!this.auth) throw new Error("Gmail not configured.");
    const gmail = google.gmail({ version: "v1", auth: this.auth });

    // 1. Get thread info to find latest message and recipient
    const thread = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
    });

    const messages = thread.data.messages || [];
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) throw new Error("Thread not found or empty.");

    const headers = lastMsg.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === "Subject")?.value || "";
    const from = headers.find((h: any) => h.name === "From")?.value || "";
    const msgId =
      headers.find((h: any) => h.name === "Message-ID")?.value || "";

    // 2. Format reply
    const to = from; // Simple reply address
    const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;

    const str = [
      'Content-Type: text/plain; charset="UTF-8"\n',
      "MIME-Version: 1.0\n",
      "Content-Transfer-Encoding: 7bit\n",
      `to: ${to}\n`,
      `subject: ${replySubject}\n`,
      `In-Reply-To: ${msgId}\n`,
      `References: ${msgId}\n\n`,
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
        threadId,
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
