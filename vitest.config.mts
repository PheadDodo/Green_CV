import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src"), "server-only": path.resolve(import.meta.dirname, "node_modules/server-only/empty.js") } },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    coverage: { reporter: ["text", "json"] },
  }
});
