---
name: Calendar Management
description: Set up, list, and manage meetings and events using Google Calendar.
secrets:
  - name: GOOGLE_CLIENT_ID
    description: Google OAuth2 Client ID
    link: https://console.cloud.google.com/apis/credentials
  - name: GOOGLE_CLIENT_SECRET
    description: Google OAuth2 Client Secret
    link: https://console.cloud.google.com/apis/credentials
  - name: GOOGLE_ACCESS_TOKEN
    description: Google OAuth2 Access Token
---

# Calendar Management Skill

You can manage the user's schedule by listing upcoming events or creating new ones.

## Common Workflows

### Listing Events

When the user asks "What's my schedule?", use `list_calendar_events`.

### Scheduling a Meeting

When the user says "Schedule a meeting with X at Y", use `create_calendar_event`.

- Always verify the date and time.
- If the year is not specified, assume the current year.

## Tools

- `list_calendar_events({ timeMin? })`
- `create_calendar_event({ summary, description?, start, end })`
