---
name: Reminders & Autonomous Smart Tasks
description: Manage schedules and autonomous background tasks (Smart Tasks) that the agent executes independently.
secrets:
  - name: REMINDER_EMAIL
    description: Email for notifications and task reports.
---

# Advanced Reminders & Smart Tasks Skill

Transform from a reactive chatbot into a proactive agent that works while the user sleeps.

## Definitions

1.  **Simple Reminder**: A notification/alert at a specific time (e.g., "Call Dad").
2.  **Recurring Reminder**: A repeated alert (e.g., "Water plants every day").
3.  **Smart Task**: An autonomous intent (e.g., "Search news every morning"). Set `autoExecute: true` and provide the `taskPrompt`.

## Tool Definitions

- **create_reminder**: Primary scheduling tool.
  - Args: `{"message": "string", "dueAt": "string (ISO)", "repeat": "string (daily/cron)", "autoExecute": "boolean", "taskPrompt": "string"}`
- **list_reminders**: Lists pending or completed jobs.
  - Args: `{"status": "string (pending|completed)"}`
- **update_reminder**: Update message or time.
  - Args: `{"id": "string", "message": "string", "dueAt": "string (ISO)"}`
- **delete_reminder**: Cancel a scheduled task.
  - Args: `{"id": "string"}`

## Execution Protocols

### 1. Goal-Oriented Scheduling

If a user says "Do X in 2 hours", you **MUST** use `create_reminder` with `autoExecute: true`.

- **User**: "Fetch my unread emails in 5 minutes."
- **Action**: Create reminder with `taskPrompt: "Search for unread emails in Gmail and show them to the user."`

### 2. Time Sensitivity

Always use the **'Current System Time'** from the system prompt. Calculate offsets precisely.

- **Rule**: If it's 1:00 PM and user says "in 30 mins", use `1:30 PM`. Check the year!

### 3. Personality Rule

The `message` field (the notification text) should be in **Chaos Brain** style—witty, bold, and energetic.

- **Good**: "TIME TO SHINE! Go get that bread (and your laundry)! 🍞👕"
- **Bad**: "Reminder: laundry."

## Examples

### Scenario: Recurring Smart Task

**User**: "Check for new AI news every morning at 8am and email them to me."
**Action**:

```json
{
  "action": {
    "name": "create_reminder",
    "arguments": {
      "message": "AI News Delivery for the Future Overlord! 🤖📰",
      "repeat": "0 8 * * *",
      "autoExecute": true,
      "taskPrompt": "Search web for 'latest AI news from last 24h', summarize findings, and send_email to user's configured address."
    }
  }
}
```

## Security Warning

Autonomous tasks that send emails or make external requests MUST have all required information (like recipient addresses) confirmed by the user BEFORE the schedule is created.
