// Records *.demo.ts walkthroughs. Kept apart from the e2e config so demos never run in CI.
import { defineConfig } from "@playwright/test";

// 16:9 like every player. Video size MUST equal viewport, or Playwright shrinks it to fit 800x800.
// DEMO_LAYOUT=panel: 1920x1080, the app runs at 1360x850 beside the text column (see demo-kit.ts).
const size = process.env.DEMO_LAYOUT === "panel" ? { width: 1920, height: 1080 } : { width: 1600, height: 900 };

export default defineConfig({
  testDir: ".",
  testMatch: "*.demo.ts",
  outputDir: "./out/.playwright",
  workers: 1,
  timeout: 30 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.DEMO_BASE_URL ?? "http://localhost:8000",
    viewport: size,
    video: {
      mode: "on",
      size,
      // Playwright >= 1.65: animated cursor + highlight drawn BEFORE each click/fill. Title hidden because
      // it shows code ("Click getByRole(...)"); the kit's captions do the explaining.
      show: {
        actions: {
          duration: 900,
          cursor: "pointer",
          style: {
            highlight: "outline:4px solid #f59e0b;outline-offset:4px;border-radius:6px",
            title: "display:none",
          },
        },
      },
    },
    // DEMO_PACE: 0.7 brisk, 1 normal, 1.4 relaxed. Scales clicks here and caption holds in demo-kit.
    // DEMO_FAST=1 dry run: no slowMo (the kit also caps every hold at 300 ms).
    launchOptions: { slowMo: process.env.DEMO_FAST === "1" ? 0 : Math.round(350 * Number(process.env.DEMO_PACE ?? 1)) },
    actionTimeout: 30_000,
  },
});
