---
name: Reminders & Autonomous Smart Tasks
description: Manage one-time and recurring reminders, and schedule autonomous background tasks (Smart Tasks) that the agent executes independently.
secrets:
  - name: REMINDER_EMAIL
    description: The email address where notifications and task reports are sent.
---

# Supernova: Advanced Reminders & Smart Tasks

## What You Get

1. **Precision Scheduling**: Set one-time or recurring reminders (daily, weekly, or "every X minutes").
2. **Autonomous Execution**: "Smart Tasks" that run in the background (e.g., searching news, sending emails) without manual triggering.
3. **Multi-Channel Delivery**: Get notified via the dashboard, system notifications, or email.
4. **Context Awareness**: Reminders can use information from your long-term memory (e.g., friend's email, your preferences).

## Quick Start

```
1. DEFINE       → "Remind me to check the oven in 10 minutes"
2. SMART TASK   → "Every morning at 8am, search for AI news and email it to my friend"
3. GATHER INFO  → If a task needs data (like an email) I don't have, I'll ask you first.
4. CONFIRM      → I'll confirm the schedule and the specific intent.
5. EXECUTE      → At the set time, I run the task autonomously and report the results.
```

---

## 1. Before You Set (IMPORTANT)

**Before creating a reminder, ensure all required entities are known.**

### Required Information to Ask For

If the user's intent involves an external action (like sending an email or searching a private resource), you MUST ensure you have the necessary details.

| Field               | Question to Ask if Missing                      | If No Preference / Not in Memory                       |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| **Recipient Email** | "What is your friend's email address?"          | Check `search_memory` first. If missing, MUST ask.     |
| **Search Queries**  | "What specific terms should I search for?"      | Use the user's initial prompt to derive a smart query. |
| **Schedule Type**   | "Should this be a one-time thing or recurring?" | Default to `one-time` unless recurring words are used. |

### What You CANNOT Skip

- **Target Action**: You must clearly understand _what_ I need to do (e.g., "send email", "search web").
- **Time/Interval**: A specific time or frequency must be defined.

---

## 2. Setting Reminders

### One-Time Reminders

Used for simple alerts.
**User**: "Remind me to call Mom in 2 hours."
**Action**: `create_reminder(message: "Call Mom", dueAt: "2026-02-02T02:50:00Z")`

### Recurring Schedules

Used for habits or repeat checks. Supports "every X minutes/hours", "daily", "weekly".
**User**: "Check the stock price of NVDA every 30 minutes."
**Action**: `create_reminder(message: "Check NVDA price", repeat: "every 30 minutes", autoExecute: true)`

---

## 3. Autonomous Smart Tasks (Actions as Reminders)

When a reminder is an **action** (e.g., "search news", "send email", "check weather"), it is called a **Smart Task**. You MUST enable `autoExecute: true` so the system knows to perform the work rather than just showing a notification.

### Example: The "Every Minute" Action

**User**: "Send me an email about tech news every minute."
**Agent Logic**:

1. Detects "send email" + "tech news" → **Action Identified**.
2. Detects "every minute" → **Recurring Schedule identified**.
3. **Action**:

```json
{
  "action": {
    "name": "create_reminder",
    "arguments": {
      "message": "Sending you tech news every minute! 🚀",
      "repeat": "every minute",
      "autoExecute": true,
      "taskPrompt": "Search for the latest tech news from the last hour, summarize them, and email the report to the user."
    }
  }
}
```

### Advanced: Multi-Step Background Missions

**User**: "Every Monday at 9am, check my calendar for the week, summarize it, and email it to my manager at boss@company.com"
**Agent**: "I'll set that up! Since I'll be doing this autonomously on Mondays, I'll make sure to have your calendar access and the manager's email ready."
**Action**:

```json
{
  "action": {
    "name": "create_reminder",
    "arguments": {
      "message": "Weekly Calendar Report for Boss",
      "repeat": "0 9 * * 1",
      "autoExecute": true,
      "taskPrompt": "List calendar events for the upcoming week, create a professional summary, and email it to boss@company.com"
    }
  }
}
```

## Guidelines for the Agent

1. **Always Calculate `dueAt`**: Use the current system time provided in the prompt to calculate absolute ISO timestamps.
2. **Action Recognition**: If the user's prompt contains verbs like "search", "email", "fetch", or "check", treat it as a **Smart Task** (`autoExecute: true`).
3. **Be Fun**: Use a "Chaos Brain" style tone for the `message` field (e.g., "MOM IS WAITING! Call her in 2 hours! 📞").
4. **Verify Parameters**: If a Smart Task involves a third party (e.g., "email Sarah"), you MUST have Sarah's email address BEFORE scheduling. Use `search_memory` or Ask the user.
5. **No Hallucinations**: Do not make up email addresses or details for background tasks.
