/**
 * Clean product footage for a promo film: no captions, no Playwright cursor or highlight, the app exactly
 * as a user sees it. Each beat gets clip.webm + clip.mp4 + clip.events.json (click times and boxes, for
 * syncing a drawn cursor) + PNGs at the config's deviceScaleFactor (2x, for sharp punch-ins).
 *
 *   await installInputLog(context, { "app.theme": process.env.PROMO_THEME ?? "light" });
 *   const c = new Clip(page, `${OUT}/checkout`);
 *   await c.start();
 *   await c.click("Pay", page.getByRole("button", { name: "Pay" }));
 *   await c.type("Cash", page.getByLabel("Cash"), "1500");
 *   await c.shot("paid-change", { crop: page.locator(".payment"), ring: page.getByText("Change") });
 *       // 2x PNG of the finished state, for the hold, plus the real boxes of the component to crop to and the
 *       // value to ring (CSS px, union of every match). The film reads them from clip.events.json: never eyeball a crop.
 *   await c.stop();
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import type { BrowserContext, Locator, Page } from "@playwright/test";

const HOLD = 800; // a fast human's pause before and after each action; trim in the edit

type Box = { x: number; y: number; w: number; h: number };
export type Rect = [number, number, number, number]; // x, y, w, h in CSS px of the viewport
type Ev = { t: number; type: string; label: string; box: Box | null; x?: number; y?: number; text?: string; keys?: number[] };

/** Logs pointer and key events in every page, and seeds localStorage (theme, dismissed tours) before load. */
export async function installInputLog(context: BrowserContext, storage: Record<string, string> = {}) {
  await context.addInitScript((storage) => {
    window.print = () => {};
    try {
      for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
    } catch {}
    (window as any).__inputs = [];
    addEventListener("pointerdown", (e) => (window as any).__inputs.push({ t: Date.now(), type: "pointerdown", x: e.clientX, y: e.clientY }), true);
    addEventListener("keydown", (e) => (window as any).__inputs.push({ t: Date.now(), type: "keydown", key: e.key }), true);
  }, storage);
}

/** The box around every element the locator matches; throws when it matches nothing visible. */
export async function unionBox(loc: Locator): Promise<Rect> {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const el of await loc.all()) {
    const b = await el.boundingBox();
    if (!b) continue;
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
  }
  if (x1 <= x0) throw new Error(`unionBox: ${loc} matches nothing visible`);
  return [Math.round(x0), Math.round(y0), Math.round(x1 - x0), Math.round(y1 - y0)];
}

export class Clip {
  t0 = 0;
  events: Ev[] = [];
  shots: { t: number; file: string; boxes?: Record<string, Rect> }[] = [];
  n = 0;
  constructor(readonly page: Page, readonly dir: string) {}

  private get size() {
    return this.page.viewportSize()!;
  }

  async start() {
    fs.mkdirSync(this.dir, { recursive: true });
    for (const f of fs.readdirSync(this.dir)) fs.rmSync(`${this.dir}/${f}`, { recursive: true });
    this.t0 = Date.now();
    // shortcut: screencast records at 1x CSS px even with deviceScaleFactor 2 (tested); 2x lives in the PNGs.
    await this.page.screencast.start({ path: `${this.dir}/clip.webm`, size: this.size, fps: 30, quality: 95 });
    await this.page.waitForTimeout(HOLD);
  }
  sec = (ms: number) => Math.round((ms - this.t0) / 10) / 100;

  async act(label: string, target: Locator, run: () => Promise<unknown>, opts: { type?: string; text?: string } = {}) {
    await target.waitFor({ state: "visible" });
    await this.page.waitForTimeout(HOLD);
    const b = await target.boundingBox();
    await this.page.evaluate(() => ((window as any).__inputs = []));
    const before = Date.now();
    await run();
    const inputs: { t: number; type: string; x?: number; y?: number }[] = await this.page.evaluate(
      () => (window as any).__inputs ?? [],
    );
    const down = inputs.find((i) => i.type === "pointerdown");
    const keys = inputs.filter((i) => i.type === "keydown").map((i) => this.sec(i.t));
    this.events.push({
      t: down ? this.sec(down.t) : keys.length ? keys[0] : this.sec(before),
      type: opts.type ?? (down ? "click" : "key"),
      label,
      box: b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
      ...(down ? { x: Math.round(down.x!), y: Math.round(down.y!) } : {}),
      ...(opts.text ? { text: opts.text } : {}),
      ...(keys.length ? { keys } : {}),
    });
    await this.page.waitForTimeout(HOLD);
  }
  click = (label: string, target: Locator) => this.act(label, target, () => target.click());
  /** Clicks into a field, selects what is there and types over it, key by key. */
  type = (label: string, target: Locator, text: string) =>
    this.act(label, target, async () => {
      await target.click();
      await this.page.waitForTimeout(250); // some apps move focus on click; selecting too early loses it
      await target.selectText();
      await target.pressSequentially(text, { delay: 90 });
    }, { type: "type", text });

  /** 2x PNG of the state; `boxes` names components whose real boxes are recorded with it (crop, ring, ...). */
  async shot(state: string, boxes: Record<string, Locator> = {}) {
    const file = `${String(++this.n).padStart(2, "0")}-${state}.png`;
    const measured: Record<string, Rect> = {};
    for (const [name, loc] of Object.entries(boxes)) measured[name] = await unionBox(loc);
    this.shots.push({ t: this.sec(Date.now()), file, ...(Object.keys(measured).length ? { boxes: measured } : {}) });
    await this.page.screenshot({ path: `${this.dir}/${file}` });
  }

  async stop() {
    await this.page.waitForTimeout(HOLD);
    await this.page.screencast.stop();
    const webm = `${this.dir}/clip.webm`;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", webm, "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
      "-r", "30", "-movflags", "+faststart", `${this.dir}/clip.mp4`]);
    const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
      `${this.dir}/clip.mp4`]).toString().trim());
    fs.writeFileSync(`${this.dir}/clip.events.json`, JSON.stringify({
      clip: "clip.mp4", width: this.size.width, height: this.size.height, fps: 30, duration,
      units: "t in seconds from the clip start; box, x, y in clip pixels (= CSS px); PNGs are deviceScaleFactor x these",
      events: this.events, shots: this.shots,
    }, null, 2));
  }
}
