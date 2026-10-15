import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173 },
  // The privacy and terms pages are plain HTML pages so they load without the app (Google links to them).
  build: { rollupOptions: { input: {
    main: fileURLToPath(new URL('./index.html', import.meta.url)),
    privacy: fileURLToPath(new URL('./privacy.html', import.meta.url)),
    terms: fileURLToPath(new URL('./terms.html', import.meta.url)),
  } } },
});