# InsightIQ Chrome Extension

This project has been converted into a Chrome Extension built with React, TypeScript, Vite, and Tailwind CSS.

## Build the extension

```bash
npm install
npm run build
```

The production files will be generated in the `dist` folder.

## Groq setup

Create a `.env` file in the project root:

```dotenv
VITE_AI_PROVIDER=groq
VITE_GROQ_API_KEY=gsk_your_groq_api_key_here
```

Run `npm run build` after every `.env` change, then click the reload icon for
InsightIQ on `chrome://extensions`. Vite embeds `VITE_` values into the built
extension, so editing `.env` alone cannot update an extension Chrome already
loaded. The Groq request uses `https://api.groq.com/openai/v1/chat/completions`
and defaults to `llama-3.3-70b-versatile`; override it with `VITE_GROQ_MODEL`
if needed.

## Live page assistant

With a normal website open, type a request such as “summarize this page”,
“scroll down”, or “type hello in the chat box”. InsightIQ reads the active tab
and creates a visible action plan. Click **Allow actions** to let it perform
the proposed click, type, or scroll actions. Browser-internal pages and typing
into password fields are intentionally blocked.

## Load in Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Enable "Developer mode".
3. Click "Load unpacked".
4. Select the `dist` folder from this project.
5. Pin the InsightIQ extension from the toolbar.

## Extension structure

- Popup UI: `src/popup/Popup.tsx`
- Background worker: `src/background/background.ts`
- Content script: `src/content/content.ts`
- Manifest: `public/manifest.json`

## Features

- Dark popup UI for the extension
- Analyze Page action
- Generate Insights action
- Background script communication
- Content script page inspection support
