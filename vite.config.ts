import { defineConfig } from "vite";

const buildId = process.env.VERIX_BUILD_ID
  ?? `1.5-sec-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-a`;

if (!/^1\.5-sec-(?:\d{8}-[a-z0-9-]{1,20}|\d{1,8}-[a-f0-9]{7,64})$/i.test(buildId)) {
  throw new Error("Invalid VERIX_BUILD_ID: " + buildId);
}

export default defineConfig({
  root: "v2",
  base: "./",
  define: {
    __VERIX_BUILD_ID__: JSON.stringify(buildId)
  },
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
