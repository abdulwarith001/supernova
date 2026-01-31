# Memory Management 🧠

_Persisting knowledge across sessions for personalized experiences._

---

## Quick Reference

| Action        | Tool            | When to Use               |
| ------------- | --------------- | ------------------------- |
| Save a fact   | `remember_fact` | Learning user preferences |
| Find facts    | `search_memory` | Before starting tasks     |
| List category | `list_memories` | Reviewing what you know   |

---

## Remember a Fact

```json
{
  "tool": "remember_fact",
  "args": {
    "category": "preferences",
    "fact": "User prefers dark mode and Python",
    "description": "Learned from conversation about coding setup"
  }
}
```

**Categories to use:**

| Category      | What to Store                  |
| ------------- | ------------------------------ |
| `preferences` | UI, language, style choices    |
| `identity`    | Name, role, location           |
| `projects`    | Ongoing work, codebase details |
| `accounts`    | Service names (not passwords!) |
| `interests`   | Hobbies, favorite topics       |

---

## Search Memory

```json
{
  "tool": "search_memory",
  "args": { "query": "programming language" }
}
```

**When to search:**

- Before web research (personalize queries)
- When user references "my project" or "that thing"
- To avoid asking repeated questions

---

## List Memories by Category

```json
{
  "tool": "list_memories",
  "args": { "category": "preferences" }
}
```

Returns all facts in that category.

---

## What to Remember

| Remember ✅                       | Skip ❌                    |
| --------------------------------- | -------------------------- |
| "User's favorite team is Chelsea" | "User said hello"          |
| "Uses MacBook Pro M3"             | "Current weather is sunny" |
| "Project uses React + TypeScript" | "User asked for time"      |
| "Prefers concise answers"         | "Searched for news"        |

---

## Memory Workflow

**Before research tasks:**

```
1. search_memory for relevant context
2. Enrich your search query with findings
3. Execute web task
4. Remember any new learnings
```

**Example:**

```
User: "Get me football news"

1. search_memory: "football"
   → Found: "User loves Chelsea FC"

2. search_web: "Chelsea FC latest transfer news 2026"
   → Personalized results!
```

---

## Deduplication

Before saving, check if you already know this:

```json
{
  "tool": "search_memory",
  "args": { "query": "favorite programming language" }
}
```

Only save if this is NEW or UPDATED information.
