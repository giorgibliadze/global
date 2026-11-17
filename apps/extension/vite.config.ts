import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config.ts";

export default defineConfig({
  plugins: [{
    name: 'isolated-extension-imports',
    enforce: 'post',
    // This extension's sole lazy import is a CSS-free transfer runner. Native
    // ESM loading avoids page <link> injection and global vite:preloadError
    // events from Vite's web-page preloader; the receiver catches rejections.
    transform(_code, id) {
      if (id === '\0vite/preload-helper.js') return { code: 'export const __vitePreload = (load) => load();', map: null };
    },
  }, react(), crx({ manifest })],
});