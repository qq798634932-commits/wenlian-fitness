import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(import.meta.dirname, "static-site"),
  publicDir: resolve(import.meta.dirname, "public"),
  base: "./",
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, "gh-pages"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: resolve(import.meta.dirname, "static-site/index.html"),
        admin: resolve(import.meta.dirname, "static-site/admin.html"),
      },
    },
  },
});
