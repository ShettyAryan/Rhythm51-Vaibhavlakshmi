import { defineConfig, devices } from "@playwright/test";

export const E2E_ADMIN = { email: "e2e-admin@example.com", password: "e2e-only-password-123" };
const PORT = 3100;

/**
 * WebGL backend for the test browser. Software rendering (SwiftShader) draws the
 * panoramas on the CPU and can saturate every core, starving the app server and
 * causing random timeouts — so use the real GPU when the machine has one.
 * Set E2E_GPU=software on machines without a GPU (e.g. CI containers).
 */
const GPU_ARGS =
  process.env.E2E_GPU === "software"
    ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    : process.platform === "win32"
      ? ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"]
      : process.platform === "darwin"
        ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"]
        : ["--use-angle=vulkan", "--enable-gpu", "--ignore-gpu-blocklist"];

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  // Tests share one seeded database and some mutate it, so run serially.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: { args: GPU_ARGS },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    command: "npm run e2e:serve",
    url: `http://localhost:${PORT}/`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      DATA_DIR: ".data-test",
      STORAGE_DRIVER: "local",
      SEED_ADMIN_EMAIL: E2E_ADMIN.email,
      SEED_ADMIN_PASSWORD: E2E_ADMIN.password,
    },
  },
});
