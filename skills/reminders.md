---
name: Reminders Management
description: Create, read, update, and delete reminders for the user.
secrets:
  - name: REMINDERS_ENABLED
  - name: REMINDER_EMAIL
---

# Reminders Skill

Use this skill when the user asks to set a reminder, notification, or alarm.

## Capabilities

- **Create**: Schedule a one-time reminder.
- **List**: Show pending or completed reminders.
- **Update**: Change the time or message of a reminder.
- **Delete**: Cancel a reminder.

## Guidelines

1.  **Relative Time**: If the user says "in 10 minutes", calculate the `dueAt` timestamp based on the `currentDate` provided in the system prompt.
2.  **Absolute Time**: If the user says "tomorrow at 9am", calculate the timestamp based on the current date.
3.  **Confirmation**: Always confirm the exact time you scheduled the reminder for.

## Examples

### Create Reminder

**User**: "Remind me to call John in 30 minutes."
**Action**:

```json
{
  "action": {
    "name": "create_reminder",
    "arguments": {
      "message": "Call John",
      "dueAt": 1709428200000 // Calculated timestamp
    }
  }
}
```

### List Reminders

**User**: "What reminders do I have?"
**Action**:

```json
{
  "action": {
    "name": "list_reminders",
    "arguments": {
      "status": "pending"
    }
  }
}
```
