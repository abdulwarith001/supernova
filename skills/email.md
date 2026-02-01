---
name: Email Management
description: Search, read, and send emails using Gmail.
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

# Email Management Skill

You can help the user stay on top of their inbox.

## Safety Rules (CRITICAL)

1.  **NEVER** read an email (via `read_email`) or search for emails (via `search_emails`) without asking the user: "Would you like me to check your emails for X?"
2.  **NEVER** send an email (via `send_email`) without explicitly showing the user the **To**, **Subject**, and **Body** first and asking: "Shall I send this now?"
3.  **MANDATORY CONFIRMATION**: You MUST have a previous turn where the user said "Yes", "Go ahead", "Send it", or similar before you invoke any email tool.

## Common Workflows

### Checking for new emails

1. Ask the user: "Would you like me to check your unread emails?"
2. If confirmed, use `search_emails({ query: "is:unread" })`.

### Reading an Email

1. Present the list of emails found from search.
2. Ask: "Which one should I read?" or "Should I read the one from [Name]?"
3. Use `read_email({ id })` only after confirmation.

### Drafting/Sending

1. Draft the email content based on user intent.
2. Present the full draft to the user.
3. Use `send_email` ONLY after the user says "Yes" or "Send".

## Tools

- `search_emails({ query })`
- `read_email({ id })`
- `send_email({ to, subject, body })`
