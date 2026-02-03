import fs from "fs";
import path from "path";
import os from "os";
import { GoogleService } from "./google.service";
import * as cron from "node-cron";

import { SessionService } from "./session.service";

export interface Spark {
  id: string;
  type: "email_reminder" | "notification" | "system";
  message: string;
  cronExpression?: string;
  dueAt?: number;
  status: "pending" | "completed";
  completedAt?: number;
  autoExecute?: boolean;
  taskPrompt?: string;

  // Hive Mind Properties
  stressLevel: number; // 0-100 (Impact on Cortisol)
  parasitic: boolean; // True if overdue and actively causing anxiety
  createdBy: "user" | "spark" | "system";
  escalationStage: number; // 0=Polite, 1=Nag, 2=Panic, 3=Nuclear
}

export class SchedulerService {
  private jobs: Spark[] = [];
  private persistenceFile: string;
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private parasiticTask?: cron.ScheduledTask;
  private google: GoogleService;
  private session?: SessionService;
  private config: any = {};
  private cleanupTask?: cron.ScheduledTask;

  private onReminder?: (job: Spark) => void;

  constructor(
    workspaceDir: string,
    googleService: GoogleService,
    onReminder?: (job: Spark) => void,
  ) {
    this.persistenceFile = path.join(workspaceDir, "reminders.json");
    this.google = googleService;
    this.onReminder = onReminder;
    this.loadConfig();
    this.loadJobs();

    // Start Cleanup Task (Runs every hour)
    this.cleanupTask = cron.schedule("0 * * * *", () => this.cleanup());

    // Start Parasitic Loop (The Anxiety Engine) - Runs every minute
    this.parasiticTask = cron.schedule("* * * * *", () => this.parasiteLoop());
  }

  public setSession(session: SessionService) {
    this.session = session;
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

  private scheduleCron(job: Spark) {
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
      if (job.autoExecute) {
        console.log(
          `Job ${job.id} is past due, executing autonomous task now.`,
        );
        this.executeJob(job);
      } else {
        console.log(`Spark ${job.id} is past due, allowing it to fester.`);
        job.parasitic = true;
        this.saveJobs();
      }
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
  ): Promise<{ job: Spark; isDuplicate: boolean }> {
    if (dueAt && dueAt < Date.now()) {
      throw new Error(
        "Reminder time is in the past. Please check the current time.",
      );
    }
    const job: Spark = {
      id: Math.random().toString(36).substring(7),
      type: "email_reminder",
      message,
      dueAt,
      cronExpression: options.cronExpression,
      autoExecute: options.autoExecute,
      taskPrompt: options.taskPrompt,
      status: "pending",

      // Spark Properties
      stressLevel: 0,
      parasitic: false,
      createdBy: "user",
      escalationStage: 0,
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

  async updateReminder(
    id: string,
    updates: Partial<Spark>,
  ): Promise<Spark | null> {
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

  listReminders(status?: "pending" | "completed"): Spark[] {
    if (status) {
      return this.jobs.filter((j) => j.status === status);
    }
    return this.jobs;
  }

  getSummary() {
    return {
      total: this.jobs.length,
      pending: this.jobs.filter((j) => j.status === "pending").length,
      completed: this.jobs.filter((j) => j.status === "completed").length,
      parasitic: this.jobs.filter((j) => j.parasitic).length,
    };
  }

  private async executeJob(job: Spark) {
    const index = this.jobs.findIndex((j) => j.id === job.id);
    if (index === -1) return;

    // Only mark as completed if NOT recurring
    if (!job.cronExpression) {
      if (this.jobs[index].status === "completed") return;
      this.jobs[index].status = "completed";
      this.jobs[index].completedAt = Date.now();

      // Relief: If it was parasitic, grant massive relief
      if (job.parasitic) {
        console.log(`😌 Relief: Parasitic Spark "${job.message}" resolved.`);
        this.session?.injectNeuro({ dopamine: 20, cortisol: -20, oxytocin: 5 });
        this.jobs[index].parasitic = false;
        this.jobs[index].stressLevel = 0;
      } else {
        // Standard satisfaction
        this.session?.injectNeuro({ dopamine: 5, cortisol: -2 });
      }

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

  public destroy() {
    console.log("🛑 Stopping SchedulerService...");
    // Stop all active reminder tasks
    this.tasks.forEach((task) => task.stop());
    this.tasks.clear();

    // Stop cleanup task
    if (this.cleanupTask) {
      this.cleanupTask.stop();
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

  private parasiteLoop() {
    const now = Date.now();
    let totalAnxiety = 0;
    const activeParasites: string[] = [];

    this.jobs.forEach((spark) => {
      if (spark.status !== "pending") return;

      // Check if Overdue (Grace period of 5 mins)
      if (
        spark.dueAt &&
        spark.dueAt < now - 5 * 60 * 1000 &&
        !spark.cronExpression
      ) {
        spark.parasitic = true;
        spark.stressLevel = Math.min(100, spark.stressLevel + 1); // Slow burn

        // Escalation Logic
        if (spark.stressLevel > 80)
          spark.escalationStage = 3; // Nuclear
        else if (spark.stressLevel > 50)
          spark.escalationStage = 2; // Panic
        else if (spark.stressLevel > 20) spark.escalationStage = 1; // Nag

        totalAnxiety += spark.stressLevel / 10; // Cumulative weight
        activeParasites.push(spark.message);

        console.log(
          `🦠 Spark "${spark.message}" is PARASITIC. Stress: ${spark.stressLevel}%`,
        );
      }
    });

    if (totalAnxiety > 0 || activeParasites.length === 0) {
      // Inject Anxiety into agent and update list
      this.session?.injectNeuro({ cortisol: totalAnxiety, dopamine: -1 });
      this.session?.setAnxieties(activeParasites);
      this.saveJobs();
    }
  }
}
