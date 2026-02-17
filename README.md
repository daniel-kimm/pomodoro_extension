# IEEE Chrome Extension

Chrome extension built with **React**, **TypeScript**, and **Vite**. Uses Manifest V3 and the [CRXJS Vite plugin](https://crxjs.dev/vite-plugin) for building.

## Tech stack

- **React 18** – UI
- **TypeScript** – types
- **Vite** – build and dev server (no Create React App)
- **@crxjs/vite-plugin** – Chrome extension build and HMR

## Setup

```bash
npm install
```

## Development

Build once and watch for changes (reload the extension in Chrome after code changes):

```bash
npm run dev
```

Load the extension in Chrome:

1. Open `chrome://extensions/`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select the **`dist`** folder in this project

## Production build

```bash
npm run build
```

Use the **`dist`** folder as the unpacked extension, or zip it for the Chrome Web Store.

## Project layout

- `index.html` – popup entry
- `manifest.json` – Chrome extension manifest (Manifest V3)
- `src/popup/` – React popup UI (`main.tsx`, `App.tsx`)
- `src/background.ts` – service worker (background script)
- `src/content.ts` – content script (runs on matched pages)
