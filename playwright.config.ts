import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
export const E2E_DB = "college_ops_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    acceptDownloads: true,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Runs the production build (npm run build first).
        command: `npx next start -p ${PORT}`,
        port: PORT,
        reuseExistingServer: false,
        env: { DATABASE_URL: `postgres://localhost:5432/${E2E_DB}` },
        timeout: 120_000,
      },
});
