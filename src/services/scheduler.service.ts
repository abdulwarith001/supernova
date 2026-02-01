import fs from "fs";
import path from "path";
import os from "os";
import { GoogleService } from "./google.service";
import * as cron from "node-cron";

export interface Job {
  id: string;
  type: "email_reminder" | "notification";
  message: string;
  cronExpression?: string;
  dueAt?: number;
  status: "pending" | "completed";
  completedAt?: number;
  autoExecute?: boolean;
  taskPrompt?: string;
}

export class SchedulerService {
  private jobs: Job[] = [];
  private persistenceFile: string;
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private google: GoogleService;
  private config: any = {};

  private onReminder?: (job: Job) => void;

  constructor(
    workspaceDir: string,
    googleService: GoogleService,
    onReminder?: (job: Job) => void,
  ) {
    this.persistenceFile = path.join(workspaceDir, "reminders.json");
    this.google = googleService;
    this.onReminder = onReminder;
    this.loadConfig();
    this.loadJobs();

    // Start Cleanup Task (Runs every hour)
    cron.schedule("0 * * * *", () => this.cleanup());
  }

  private loadConfig() {
    const CONFIG_FILE = path.join(os.homedir(), ".supernova", "config.json");
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        this.config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      } catch (e) {
        console.error("Scheduler: Failed to load config", e);
      }
    }
  }

  private loadJobs() {
    if (fs.existsSync(this.persistenceFile)) {
      try {
        const rawJobs = JSON.parse(
          fs.readFileSync(this.persistenceFile, "utf-8"),
        );
        // Filter out very old completed jobs immediately on load if desired,
        // but let's just load them and rely on cleanup()
        this.jobs = rawJobs;

        // Reschedule pending jobs
        this.jobs.forEach((job) => {
          if (job.status === "pending") {
            this.scheduleCron(job);
          }
        });
      } catch (e) {
        console.error("Scheduler: Failed to load jobs", e);
        this.jobs = [];
      }
    }
  }

  private saveJobs() {
    try {
      fs.writeFileSync(
        this.persistenceFile,
        JSON.stringify(this.jobs, null, 2),
      );
    } catch (e) {
      console.error("Scheduler: Failed to save jobs", e);
    }
  }

  private scheduleCron(job: Job) {
    if (job.status !== "pending") return;

    let cronTime = "";

    if (job.cronExpression) {
      cronTime = job.cronExpression;
    } else if (job.dueAt && job.dueAt > Date.now()) {
      const date = new Date(job.dueAt);
      cronTime = `${date.getSeconds()} ${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} *`;
    }

    if (cronTime) {
      if (!cron.validate(cronTime)) {
        console.error(`Invalid cron expression for job ${job.id}: ${cronTime}`);
        return;
      }

      const task = cron.schedule(cronTime, () => {
        this.executeJob(job);
        // Stop and Cleanup if NOT recurring
        if (!job.cronExpression) {
          task.stop();
          this.tasks.delete(job.id);
        }
      });

      this.tasks.set(job.id, task);
    } else if (job.dueAt && job.dueAt <= Date.now()) {
      console.log(`Job ${job.id} is past due, executing now.`);
      this.executeJob(job);
    }
  }

  async createReminder(
    message: string,
    dueAt?: number,
    options: {
      cronExpression?: string;
      autoExecute?: boolean;
      taskPrompt?: string;
    } = {},
  ): Promise<{ job: Job; isDuplicate: boolean }> {
    if (dueAt && dueAt < Date.now()) {
      throw new Error(
        "Reminder time is in the past. Please check the current time.",
      );
    }
    const job: Job = {
      id: Math.random().toString(36).substring(7),
      type: "email_reminder",
      message,
      dueAt,
      cronExpression: options.cronExpression,
      autoExecute: options.autoExecute,
      taskPrompt: options.taskPrompt,
      status: "pending",
    };

    // Check for duplicates
    const existing = this.jobs.find(
      (j) =>
        j.status === "pending" &&
        j.message === message &&
        ((j.dueAt && dueAt && Math.abs(j.dueAt - dueAt) < 60000) ||
          (j.cronExpression && j.cronExpression === options.cronExpression)),
    );
    if (existing) {
      console.log(`⚠️ Reminder already exists for "${message}" at this time.`);
      return { job: existing, isDuplicate: true };
    }

    this.jobs.push(job);
    this.saveJobs();
    this.scheduleCron(job);

    const timeInfo = options.cronExpression
      ? `recurring (${options.cronExpression})`
      : `for ${dueAt ? new Date(dueAt).toLocaleString() : "now"}`;

    console.log(`📅 Reminder created: "${message}" ${timeInfo}`);
    return { job, isDuplicate: false };
  }

  async updateReminder(id: string, updates: Partial<Job>): Promise<Job | null> {
    const index = this.jobs.findIndex((j) => j.id === id);
    if (index === -1) return null;

    // Stop existing cron task if it exists
    if (this.tasks.has(id)) {
      this.tasks.get(id)?.stop();
      this.tasks.delete(id);
    }

    this.jobs[index] = { ...this.jobs[index], ...updates };
    // If status reverted to pending or time changed, reschedule
    if (this.jobs[index].status === "pending") {
      this.scheduleCron(this.jobs[index]);
    }

    this.saveJobs();
    return this.jobs[index];
  }

  async deleteReminder(id: string): Promise<boolean> {
    const index = this.jobs.findIndex((j) => j.id === id);
    if (index === -1) return false;

    if (this.tasks.has(id)) {
      this.tasks.get(id)?.stop();
      this.tasks.delete(id);
    }

    this.jobs.splice(index, 1);
    this.saveJobs();
    return true;
  }

  listReminders(status?: "pending" | "completed"): Job[] {
    if (status) {
      return this.jobs.filter((j) => j.status === status);
    }
    return this.jobs;
  }

  private async executeJob(job: Job) {
    const index = this.jobs.findIndex((j) => j.id === job.id);
    if (index === -1) return;

    // Only mark as completed if NOT recurring
    if (!job.cronExpression) {
      if (this.jobs[index].status === "completed") return;
      this.jobs[index].status = "completed";
      this.jobs[index].completedAt = Date.now();
      this.saveJobs();
    }

    console.log(`⏰ Executing job ${job.id}: ${job.message}`);

    const notificationEmail =
      this.config["REMINDER_EMAIL"] ||
      this.config["REMINDER_NOTIFICATION_EMAIL"] || // Added extra variants
      this.config["JOB_NOTIFICATION_EMAIL"] ||
      this.config["EMAIL"];

    try {
      // If it's a Smart Task (auto-execute), skip the initial statis email.
      // We let the Sub-Agent handle the delivery of results.
      if (job.autoExecute) {
        console.log(
          `🤖 Smart Task detected: Suppressing initial email for ${job.id}`,
        );
      } else if (this.google.isEmailEnabled() && notificationEmail) {
        await this.google.sendEmail(
          notificationEmail,
          `Reminder: ${job.message}`,
          `Hey Supernova here, \n\n${job.message}`,
        );
        console.log(`📧 Reminder email sent to ${notificationEmail}`);
      } else {
        console.warn(
          "⚠️ Email not configured or failed for standard reminder.",
        );
      }

      // ALWAYS trigger the socket notification if an observer is present
      if (this.onReminder) {
        this.onReminder(job);
      }
    } catch (e) {
      console.error("Failed to execute reminder action:", e);
    }
  }

  private cleanup() {
    console.log("🧹 Running cleanup for old reminders...");
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const initialCount = this.jobs.length;

    this.jobs = this.jobs.filter((job) => {
      if (
        job.status === "completed" &&
        job.completedAt &&
        job.completedAt < oneDayAgo
      ) {
        return false; // Remove
      }
      return true; // Keep
    });

    if (this.jobs.length < initialCount) {
      console.log(
        `🗑️ Deleted ${initialCount - this.jobs.length} old reminders.`,
      );
      this.saveJobs();
    }
  }
}
