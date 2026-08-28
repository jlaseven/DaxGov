import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  appType: "spa",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://localhost:5174" },
  },
});
