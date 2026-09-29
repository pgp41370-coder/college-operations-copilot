import { defineConfig, devices } from "@playwright/test";
import os from "node:os";

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
        // Explicit local user, and blank PG* variables: .env.local may hold a
        // hosted database's credentials, which must never reach local test runs.
        env: {
          DATABASE_URL: `postgres://${os.userInfo().username}@localhost:5432/${E2E_DB}`,
          DATABASE_URL_UNPOOLED: "",
          PGUSER: "",
          PGPASSWORD: "",
          PGHOST: "",
          PGDATABASE: "",
        },
        timeout: 120_000,
      },
});
