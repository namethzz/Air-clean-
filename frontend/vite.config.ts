import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';

/** Each build gets an id. The app compares it with /version.json to notice a new deploy and reload itself. */
const buildId = new Date().toISOString();
function versionFile(): Plugin {
  return { name: 'airclean-version', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: buildId }) }); } };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), versionFile()],
  define: { __APP_VERSION__: JSON.stringify(buildId) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173 },
  // The privacy and terms pages are plain HTML pages so they load without the app (Google links to them).
  build: { rollupOptions: { input: {
    main: fileURLToPath(new URL('./index.html', import.meta.url)),
    privacy: fileURLToPath(new URL('./privacy.html', import.meta.url)),
    terms: fileURLToPath(new URL('./terms.html', import.meta.url)),
  } } },
});