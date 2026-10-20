import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  retries: 0,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:5174",
    viewport: { width: 390, height: 844 },
    launchOptions: {
      channel: process.env.PLAYWRIGHT_CHROME_CHANNEL || "chrome",
    },
  },
  webServer: [
    {
      command: "../.venv/bin/python ../scripts/local_smoke_server.py",
      url: "http://127.0.0.1:8001/health",
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: "npm run dev -- --port 5174 --strictPort",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      env: {
        VITE_API_BASE_URL: "http://127.0.0.1:8001",
        TELEGRAM_WEBAPP_URL: "https://localhost",
      },
    },
  ],
});
