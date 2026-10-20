import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "");
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
