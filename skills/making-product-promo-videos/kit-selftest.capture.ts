// Self-test for capture-kit.ts. Run after editing the kit: copy the kit, config and this file into a folder with
// @playwright/test >= 1.65 and run `npx playwright test -c capture.config.ts kit-selftest.capture.ts`. Uses a routed page.
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { Clip, unionBox } from "./capture-kit";

const OUT = "out/selftest";
test("shot() records the real boxes of named components with the PNG", async ({ page }) => {
  await page.route("http://promo.test/**", (r) => r.fulfill({ contentType: "text/html", body: `<!doctype html>
    <body style="margin:0"><div class="card" style="position:absolute;left:100px;top:50px;width:400px;height:200px">
    <button id="pay" style="position:absolute;left:20px;top:30px;width:80px;height:40px">Pay</button>
    <span class="cell" style="position:absolute;left:200px;top:10px;width:50px;height:20px">a</span>
    <span class="cell" style="position:absolute;left:200px;top:150px;width:50px;height:20px">b</span></div></body>` }));
  await page.goto("http://promo.test/");
  const c = new Clip(page, `${OUT}/boxes`);
  await c.start();
  await c.shot("state", { crop: page.locator(".card"), ring: page.locator("#pay"), column: page.locator(".cell") });
  await c.stop();
  const ev = JSON.parse(fs.readFileSync(`${OUT}/boxes/clip.events.json`, "utf8"));
  expect(ev.shots[0].boxes).toEqual({ crop: [100, 50, 400, 200], ring: [120, 80, 80, 40], column: [300, 60, 50, 160] });
  expect(fs.existsSync(`${OUT}/boxes/${ev.shots[0].file}`)).toBe(true);
  await expect(unionBox(page.locator(".missing"))).rejects.toThrow(/matches nothing visible/);
});
