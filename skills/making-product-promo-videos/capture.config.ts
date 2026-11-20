// Clean promo footage. No Playwright video, cursor or highlight: capture-kit's Clip records each beat itself.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.capture.ts",
  outputDir: process.env.PROMO_OUT ? `${process.env.PROMO_OUT}/.playwright` : "./out/.playwright",
  workers: 1,
  timeout: 20 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.DEMO_BASE_URL ?? "http://localhost:8000",
    viewport: { width: 1920, height: 1080 }, // = the film size, so a full-window shot needs no scaling
    deviceScaleFactor: 2, // PNGs at 2x for punch-ins; the screencast stays 1x
    colorScheme: process.env.PROMO_THEME === "dark" ? "dark" : "light",
    video: "off",
    launchOptions: { slowMo: 150 },
    actionTimeout: 30_000,
  },
});
