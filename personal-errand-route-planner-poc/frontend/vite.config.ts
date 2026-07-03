import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5199,
    proxy: {
      "/api": "http://127.0.0.1:8199"
    }
  }
});
