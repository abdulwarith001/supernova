---
name: Web Search
description: Search the web for latest news and information using Serper.dev API.
secrets:
  - name: SERPER_API_KEY
---

# Web Search Skill

Use this skill when you need to find **current information**, **news**, or **answers** that are not in your memory.

## How to Search

1. **Verify Prerequisites**:
   - Ensure the `SERPER_API_KEY` environment variable is set.
   - If missing, inform the user they need to run `supernova setup` to configure the "Web Search" tool.
   - Do NOT proceed if the key is missing.

2. **Run Search Command**:
   You will use `curl` to query the Serper API.

### Command Template

```bash
curl -X POST https://google.serper.dev/search \
  -H "X-API-KEY: $SERPER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"q": "YOUR QUERY HERE"}'
```

### Example

**User**: "Who won the Super Bowl last year?"
**Action**:

```json
{
  "action": {
    "name": "run_command",
    "arguments": {
      "command": "curl -s -X POST https://google.serper.dev/search -H \"X-API-KEY: $SERPER_API_KEY\" -H \"Content-Type: application/json\" -d '{\"q\": \"Super Bowl winner 2025\"}'"
    }
  }
}
```

## Parsing Results

The output will be a JSON string. Look for:

- `organic`: The main search results.
- `answerBox`: Direct answers (if any).
- `topStories`: News articles.

**Note**: Always cite your sources when answering based on search results.
