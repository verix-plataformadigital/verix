import { defineConfig } from "vite";

export default defineConfig({
  root: "v2",
  base: "./",
  build: {
    outDir: "../dist-v2",
    emptyOutDir: true,
    sourcemap: false,
    manifest: true
  },
  server: {
    port: 5173,
    strictPort: true
  },
  preview: {
    port: 4173,
    strictPort: true
  }
});
