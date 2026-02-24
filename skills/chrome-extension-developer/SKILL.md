---
name: chrome-extension-developer
description: "Expert guidance for building modern Chrome Extensions using Manifest V3, service workers, and message passing."
risk: safe
source: self
tags: ["chrome", "extension", "javascript", "manifest-v3", "frontend"]
---

# Chrome Extension Developer (Manifest V3)

## Overview

This skill provides comprehensive guidance for building, debugging, and architecting modern Chrome Extensions using Manifest V3. It emphasizes security, performance, and the correct usage of service workers, content scripts, and message passing.

## When to Use This Skill

- Use when starting a new Chrome Extension project.
- Use when migrating an extension from Manifest V2 to Manifest V3.
- Use when debugging issues with service worker lifecycles or message passing.
- Use when designing the architecture for communication between UI, background, and content scripts.

## How It Works

### 1. Fundamental Architecture

Modern Chrome Extensions (V3) consist of distinct environments that must communicate via message passing:

- **Manifest (`manifest.json`):** The configuration file. Must use `"manifest_version": 3`.
- **Background Service Worker:** Event-driven script. Replaces the persistent background page. It is ephemeral and can be terminated at any time. State must be persisted to storage.
- **Content Scripts:** Scripts injected into web pages. They share the DOM of the page but run in an isolated JavaScript environment.
- **UI Elements (Popup, Options, Side Panel):** Standard HTML/JS environments.

### 2. Service Worker Design Rules

Because the Service Worker is ephemeral:
- **Never rely on global variables for persistent state.**
- **Hydrate state on wake:** Retrieve required data from `chrome.storage.local` or `chrome.storage.session`.
- **Register event listeners synchronously** at the top level. Do not register them asynchronously inside other callbacks.

### 3. Robust Message Passing

Implement robust message passing using `chrome.runtime.sendMessage` and `chrome.tabs.sendMessage`:

- **Define clear message contracts.** E.g., `{ action: "FETCH_DATA", payload: { id: 123 } }`.
- **Handle asynchronous responses correctly:** In `chrome.runtime.onMessage.addListener`, return `true` if you plan to call `sendResponse` asynchronously.

## Examples

### Example 1: Basic Manifest V3 Setup

```json
{
  "manifest_version": 3,
  "name": "My Awesome Extension",
  "version": "1.0.0",
  "description": "Does awesome things.",
  "permissions": ["storage", "activeTab", "scripting"],
  "host_permissions": ["*://*.example.com/*"],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"]
    }
  ]
}
```

### Example 2: Asynchronous Message Handling in Service Worker

```javascript
// background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'FETCH_API_DATA') {
    // Return true to indicate we will send a response asynchronously
    handleApiRequest(request.payload).then(sendResponse);
    return true; 
  }
});

async function handleApiRequest(payload) {
  try {
    const response = await fetch(`https://api.example.com/data/${payload.id}`);
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

### Example 3: Injecting a Content Script Programmatically

```javascript
// background.js (or popup.js)
async function injectScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['injected-script.js']
    });
    console.log("Script injected successfully");
  } catch (err) {
    console.error("Failed to inject script: ", err);
  }
}
```

## Best Practices

- ✅ **Do:** Use `chrome.storage.session` for fast, in-memory storage of non-persistent data in the service worker.
- ✅ **Do:** Handle `chrome.runtime.lastError` in callbacks to avoid uncaught exceptions.
- ✅ **Do:** Minify and bundle your code for production to improve load times and meet store requirements.
- ❌ **Don't:** Request permissions you don't absolutely need. Use declarative approaches where possible (e.g., `declarativeNetRequest` instead of `webRequest`).
- ❌ **Don't:** Use `eval()` or inline scripts; they violate the default CSP for extensions.

## Common Pitfalls

- **Problem:** "Message port closed before a response was received."
  **Solution:** Ensure you are returning `true` from your `onMessage` listener if you are handling the response asynchronously using a Promise or `async/await`.
- **Problem:** Service worker variables keep losing their value.
  **Solution:** The service worker was terminated by the browser. Move state to `chrome.storage`.
