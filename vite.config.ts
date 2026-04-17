import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read `server/.env` for `VITE_*` (same place as `GEMINI_API_KEY`); root `.env` is optional.
export default defineConfig({
  plugins: [react(), crx({ manifest })],
});
