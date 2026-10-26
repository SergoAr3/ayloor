import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { apiBase } from "./src/apiBase";

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, "..", "");
  // A production bundle must never depend on the development /api proxy.
  if (command === "build") apiBase(env.VITE_API_BASE_URL, true);
  const webappHost = env.TELEGRAM_WEBAPP_URL
    ? new URL(env.TELEGRAM_WEBAPP_URL).hostname
    : "";
  return {
    plugins: [react()],
    envDir: "..",
    server: {
      // Explicit host allowlist for your configured HTTPS tunnel.
      allowedHosts: webappHost ? [webappHost] : [],
      proxy: { "/api": "http://127.0.0.1:8000" },
    },
  };
});
