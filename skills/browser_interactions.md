# Browser Interactions 🖱️

_Understanding page state and interacting with web elements._

---

## Page Snapshot Structure

After every web action, you receive a snapshot:

```json
{
  "url": "https://example.com/page",
  "title": "Example Page",
  "navLinks": [
    { "text": "About", "url": "https://example.com/about" },
    { "text": "Contact", "url": "https://example.com/contact" }
  ],
  "forms": [
    {
      "inputs": [
        { "type": "email", "name": "email", "selector": "#email" },
        { "type": "password", "name": "password", "selector": "#password" }
      ]
    }
  ],
  "buttons": ["Sign In", "Create Account", "Forgot Password"],
  "contentSnippet": "Welcome to Example. Sign in to continue..."
}
```

---

## Using Snapshot Data

**Navigate to subpages:**

```json
{
  "tool": "click_web_element",
  "args": { "text": "About" }
}
```

→ Uses `navLinks[0].text` from snapshot

**Fill a form:**

```json
{
  "tool": "type_web_element",
  "args": { "selector": "#email", "text": "me@example.com" }
}
```

→ Uses `forms[0].inputs[0].selector` from snapshot

**Submit via button:**

```json
{
  "tool": "click_web_element",
  "args": { "text": "Sign In" }
}
```

→ Uses `buttons[0]` from snapshot

---

## Element Resilience

The extension waits **5 seconds** for elements to appear. Features:

| Feature         | Behavior                   |
| --------------- | -------------------------- |
| Polling         | Retries every 500ms for 5s |
| Text matching   | Partial match supported    |
| Visual feedback | Green outline on success   |
| Auto-scroll     | Element scrolled into view |

---

## State Verification

**Always check `url` after clicks:**

| URL Changed? | Meaning                            |
| ------------ | ---------------------------------- |
| Yes          | Navigation successful              |
| No           | Dynamic SPA update OR click failed |

**If URL unchanged:**

1. Check `contentSnippet` for new content
2. Try `use_vision` to verify visual state
3. Re-attempt with different selector

---

## Handling Dynamic Content

**Single Page Apps (SPAs):**

- URL may not change after navigation
- Check `contentSnippet` for verification
- Wait for content via `scroll_web_page` if loading

**Cookie/GDPR banners:**

```json
{
  "tool": "click_web_element",
  "args": { "text": "Accept" }
}
```

**Loading states:**

- Extension waits for `document.readyState === 'complete'`
- Additional 1-2s delay built-in for JS rendering
