---
name: Web Search
description: Search the web for latest news and information using Serper.dev API.
secrets:
  - name: SERPER_API_KEY
---

# Web Search Skill

Use this skill when you need to find **current information**, **news**, or **answers** that are not in your long-term memory.

## Prerequisites

- **API Key**: Ensure `SERPER_API_KEY` is available in the environment.
- **Proactive Ritual**:
  1. If `SERPER_API_KEY` is not in your environment, you **MUST** tell the human: _"I need a Serper API key to search the web. Please register at [serper.dev](https://serper.dev) and give me the key."_
  2. Once they provide it, use the `update_config` tool with `isSecret: true` to save it forever.
- **Tool**: You must use `run_command` to execute the search via `curl`.

## Implementation Pattern

### 1. Execute Search

Use the following `curl` command to get JSON results from Serper.

```bash
curl -s -X POST https://google.serper.dev/search \
  -H "X-API-KEY: $SERPER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"q": "YOUR_SEARCH_QUERY_HERE"}'
```

### 2. Process Response

The response is a JSON object. Focus on these fields:

- `answerBox`: Contains direct answers (e.g., weather, calculations).
- `organic`: A list of search results. Each result has `title`, `link`, and `snippet`.
- `topStories`: Recent news articles related to the query.

## Examples

### Scenario: Finding the latest version of a software

**User**: "What is the latest stable version of Node.js?"
**Action**:

```json
{
  "action": {
    "name": "run_command",
    "arguments": {
      "command": "curl -s -X POST https://google.serper.dev/search -H \"X-API-KEY: $SERPER_API_KEY\" -H \"Content-Type: application/json\" -d '{\"q\": \"latest stable nodejs version\"}'"
    }
  }
}
```

## Protocol Rules

- **Cite Sources**: Always provide the link or source name when answering from web results.
- **Search First**: If you are unsure about a fact, search first before guessing.
- **Error Handling**: If the API returns an error or no results, try a different query or inform the user about the missing API key.
