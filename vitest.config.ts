import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __VERIX_BUILD_ID__: JSON.stringify("1.5-test")
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", "dist-v2/**"],
    passWithNoTests: false
  }
});
