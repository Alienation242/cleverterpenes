import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// By default every asset path is relative, so the same build works on localhost, on GitHub Pages
// under /<repo>/ or in any folder of a static HTTPS host. APP_BASE=/some/path/ builds for a fixed
// sub-path instead, e.g. on a server that serves folders without a trailing slash.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}; // no @types/node here
const base = env.APP_BASE ?? './';
const absolute = base.startsWith('/');
// On such servers the page is /some/path, so an absolute scope must not end in "/".
const scope = absolute ? base.replace(/\/+$/, '') || '/' : './';

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A new version waits until no session is running (see main.tsx): a reload mid-fill would
      // drop the Bluetooth link while the pump runs.
      registerType: 'prompt',
      scope,
      includeAssets: ['icon.svg', 'data/strains.json'],
      manifest: {
        ...(absolute ? { id: scope } : {}),
        name: 'cleverTerpenes — Volcano balloon planner',
        short_name: 'cleverTerpenes',
        description:
          'Terpene-aware balloon planner and Bluetooth controller for the Storz & Bickel Volcano Hybrid.',
        lang: 'en',
        theme_color: '#0f0f10',
        background_color: '#0f0f10',
        display: 'standalone',
        start_url: scope,
        scope,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
});
