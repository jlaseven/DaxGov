import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ["node_modules/**", "dist/**", "dist-server/**"],
    projects: [
      {
        plugins: [react()],
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "api",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: [
            "tests/client/**",
            "tests/unit/**",
            "node_modules/**",
            "dist/**",
            "dist-server/**",
          ],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "client",
          environment: "jsdom",
          include: ["tests/client/**/*.test.ts", "tests/client/**/*.test.tsx"],
          setupFiles: ["./tests/setup/client.ts"],
        },
      },
    ],
  },
});
