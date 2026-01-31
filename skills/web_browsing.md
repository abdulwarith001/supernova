# Web Browsing 🌐

_Your primary skill for navigating and interacting with web pages._

---

## Quick Reference

| Action            | Tool            | When to Use              |
| ----------------- | --------------- | ------------------------ |
| Google search     | `search_web`    | Finding information      |
| Visit URL         | `visit_page`    | Reading a specific page  |
| Click button/link | `click_element` | Navigating or submitting |
| Fill input        | `type_in_input` | Forms, search boxes      |
| Scroll            | `scroll_page`   | Revealing more content   |
| JavaScript        | `execute_js`    | Complex DOM interactions |
| Vision analysis   | `use_vision`    | When DOM fails           |

---

## Search the Web

```json
{
  "tool": "search_web",
  "args": { "query": "latest tech news" }
}
```

**Best practices:**

- Be specific: `"Chelsea FC transfer news 2026"` > `"football news"`
- Add site filter: `"site:reddit.com AI agents"`
- Use quotes for exact phrases: `"iPhone 17 release date"`

---

## Visit a Page

```json
{
  "tool": "visit_page",
  "args": { "url": "https://example.com" }
}
```

**Critical rules:**

- Use EXACT URLs from search results or user input
- NEVER fabricate paths like `/waitlist` or `/signup`
- If you need a subpage, visit main URL first, then use observed links

---

## Click Elements

```json
{
  "tool": "click_element",
  "args": { "selector": "Sign Up" }
}
```

**Selector priority:**

1. `text` - Preferred! Works for buttons, links
2. `selector` - CSS selector, use only when text is ambiguous

```json
{
  "tool": "click_web_element",
  "args": { "selector": "#submit-btn" }
}
```

---

## Fill Form Inputs

```json
{
  "tool": "type_in_input",
  "args": {
    "selector": "email",
    "text": "user@example.com"
  }
}
```

**Form workflow:**

1. `visit_page` → Get snapshot with form selectors
2. Read `Inputs Found` from the formatted observation
3. `type_in_input` for each input
4. `click_element` on submit button

---

## Use Vision (When Stuck)

```json
{
  "tool": "use_vision",
  "args": { "goal": "Find and click the blue signup button" }
}
```

**When to use:**

- DOM selectors not working
- Complex visual UIs (canvas, WebGL)
- After 2-3 failed click attempts
- Elements only identifiable by appearance

---

## Reading Page Snapshots

After every action, you receive:

| Field            | Description                         |
| ---------------- | ----------------------------------- |
| `url`            | Current page URL                    |
| `title`          | Document title                      |
| `navLinks`       | Internal links (use for navigation) |
| `forms`          | Form inputs with selectors          |
| `buttons`        | Clickable button text               |
| `contentSnippet` | Page text preview                   |

**Using this data:**

- Navigate subpages via `Buttons/Links Found`
- Fill forms using `Inputs Found` selectors
- Submit via matching text in `Buttons/Links Found`

---

## JavaScript Interactions (`execute_js`)

Use this for the most precise control over the page.

**Patterns:**

- **Find and click by text (robust):**

  ```js
  Array.from(document.querySelectorAll("button"))
    .find((el) => el.textContent.includes("Submit"))
    .click();
  ```

- **Fill multiple fields at once:**

  ```js
  document.querySelector("#first-name").value = "John";
  document.querySelector("#last-name").value = "Doe";
  document.querySelector("form").submit();
  ```

- **Check if element exists:**
  ```js
  !!document.querySelector(".success-message");
  ```

---

## Handling Obstacles

| Obstacle          | Solution                     |
| ----------------- | ---------------------------- |
| Cookie banner     | Click "Accept" or "Dismiss"  |
| Paywall           | Try different source         |
| CAPTCHA           | Report and skip              |
| Login required    | Use `use_vision` or ask user |
| Element not found | Try `use_vision`             |

---

## Trusted Sources

**Tech:** TechCrunch, The Verge, Ars Technica, Wired, MacRumors
**News:** BBC, Reuters, AP, NYT
**Finance:** Bloomberg, CNBC, FT
