/**
 * Captioned walkthrough recorder for Playwright. Copy next to your *.demo.ts.
 *
 *   const demo = await Demo.start(page, context, "out/my-flow");   // first, before login and seeding
 *   // ...log in, seed...
 *   await demo.open("/app/my-doctype");  const app = demo.app;     // app.locator(...) for everything in the app
 *   demo.begin();                                                   // the mp4 and steps.md start here
 *   if (runPart(1)) {
 *     await demo.card("Part 1", "Setting up", ["Done once by a manager."]);
 *     await spot(field);  await demo.say("Part 1 · Setup", "New field", "Explain it in plain words.");  // caption keeps clear of it
 *   }
 *   await demo.finish("my-flow");   // -> my-flow.webm/.mp4/.vtt, steps.md, stills/*.png, contact-sheet.png
 *
 * DEMO_LAYOUT=panel: the app runs at full size beside a text column instead of under a caption box.
 * Caption/card text is HTML (<b>, <i>, <code>), inserted with innerHTML: author text only.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { BrowserContext, Frame, Locator, Page } from "@playwright/test";

/**
 * Runs in every page (addInitScript). Caption lives in sessionStorage so it survives navigations.
 * Sizes are for a 900 px tall frame watched in a small window. No coloured side stripe on the caption: impeccable flags it (side-tab).
 */
const OVERLAY = () => {
  if (window !== window.top) return; // the app's own iframes (print preview, reports) and the panel's app frame
  const css = `
    #__demo_cap{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483646;
      width:min(1100px,92vw);background:rgba(17,24,39,.94);color:#f9fafb;border-radius:14px;
      padding:20px 28px 22px;box-shadow:0 12px 40px rgba(0,0,0,.35);pointer-events:none;
      font:20px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
    #__demo_cap .s{font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#fbbf24;font-weight:700}
    #__demo_cap .t{font-size:28px;font-weight:700;margin:4px 0 6px}
    #__demo_cap .b{color:#e5e7eb}
    #__demo_cap code,#__demo_card code{background:#374151;color:#fde68a;padding:1px 7px;border-radius:5px}
    #__demo_card{position:fixed;inset:0;z-index:2147483647;background:#111827;color:#f9fafb;
      display:flex;flex-direction:column;justify-content:center;padding:0 12vw;pointer-events:none;
      font:20px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
      transition:opacity 250ms cubic-bezier(0.23,1,0.32,1)}
    @starting-style{#__demo_card{opacity:0}}
    #__demo_card .k{color:#fbbf24;font-weight:700;letter-spacing:.1em;text-transform:uppercase;font-size:15px}
    #__demo_card h1{color:#f9fafb;font-size:46px;line-height:1.15;margin:10px 0 22px}
    #__demo_card li{margin:6px 0;color:#d1d5db}
    @keyframes __demo_ka{to{opacity:.02}}
    #__demo_ka{position:fixed;left:0;top:0;width:1px;height:1px;background:#000;opacity:.01;pointer-events:none;
      animation:__demo_ka 1s linear infinite alternate}`;
  function render() {
    if (!document.body) return;
    if (!document.getElementById("__demo_css")) {
      const st = document.createElement("style");
      st.id = "__demo_css";
      st.textContent = css;
      document.head.appendChild(st);
    }
    // Headless Chromium stops sending frames after a still spell, and the change that ends it is lost from the
    // video. An invisible, always-running animation keeps frames coming.
    if (!document.getElementById("__demo_ka")) {
      const ka = document.createElement("div");
      ka.id = "__demo_ka";
      document.body.appendChild(ka);
    }
    let el = document.getElementById("__demo_cap");
    if (!el) {
      el = document.createElement("div");
      el.id = "__demo_cap";
      document.body.appendChild(el);
    }
    const raw = sessionStorage.getItem("__demo_caption");
    el.style.display = raw ? "block" : "none";
    if (!raw) return;
    const c = JSON.parse(raw);
    el.innerHTML = `<div class="s">${c.step}</div><div class="t">${c.title}</div><div class="b">${c.body}</div>`;
    place(el, c.top);
  }
  // Top edge of the bars fixed to the bottom of the screen, or bottom edge of those fixed to the top
  // (app toolbars, Frappe's sticky navbar). The caption and card don't count: they ignore the pointer.
  function barEdge(bottom: boolean) {
    let edge = bottom ? innerHeight : 0;
    for (const fx of [0.05, 0.5, 0.95])
      for (let n = document.elementFromPoint(innerWidth * fx, bottom ? innerHeight - 2 : 2); n && n !== document.body; n = n.parentElement) {
        const pos = getComputedStyle(n).position;
        if (pos !== "fixed" && pos !== "sticky") continue;
        const r = n.getBoundingClientRect();
        if (r.height < innerHeight / 3) edge = bottom ? Math.min(edge, r.top) : Math.max(edge, r.bottom);
        break;
      }
    return edge;
  }
  // Bottom by default, clear of bars; flips to the top when it would cover more of a spot()ted element there.
  // top: true / false forces a side.
  function place(el: HTMLElement, top?: boolean) {
    const at = (up: boolean) => {
      el.style.top = up ? `${Math.max(28, barEdge(false) + 12)}px` : "auto";
      el.style.bottom = up ? "auto" : `${Math.max(28, innerHeight - barEdge(true) + 12)}px`;
      const c = el.getBoundingClientRect();
      let covered = 0;
      for (const s of document.querySelectorAll("[data-demo-spot]")) {
        const r = s.getBoundingClientRect(); // + the 8 px outline
        covered += Math.max(0, Math.min(c.right, r.right + 8) - Math.max(c.left, r.left - 8)) *
          Math.max(0, Math.min(c.bottom, r.bottom + 8) - Math.max(c.top, r.top - 8));
      }
      return covered;
    };
    if (typeof top === "boolean") return void at(top);
    const below = at(false);
    if (below > 0 && at(true) >= below) at(false);
  }
  (window as any).__demoRender = render;
  document.addEventListener("DOMContentLoaded", render);
  // SPAs and Frappe desk redraw the body; put the caption back if it was removed.
  setInterval(() => (document.getElementById("__demo_cap") && document.getElementById("__demo_ka")) || render(), 400);
};

/** `at` is epoch ms; `ms` is how long it was held (a card fades out for 250 ms more). */
export type Cue = { at: number; kind: "card" | "say"; kicker: string; title: string; body: string; ms: number; keep?: boolean;
  chapter?: boolean /* card: false keeps it out of the chapter list (a closing card) */;
  still?: string; voice?: string /* voiceKey of its clip */ };

/**
 * ~2.3 words per second (captions are dense with setting names), never under 3 s; scaled by DEMO_PACE.
 * DEMO_FAST=1 holds everything 300 ms: a dry run that checks every step quickly before the real recording.
 */
export const readTime = (...text: string[]) =>
  process.env.DEMO_FAST === "1"
    ? 300
    : Math.round(Number(process.env.DEMO_PACE ?? 1) * Math.max(3000, text.join(" ").replace(/<[^>]+>/g, "").split(/\s+/).length * 430));

/** Wrap each part in `if (runPart(n))` so DEMO_FROM=n / DEMO_STOP=n record a slice of the parts while iterating. */
export const runPart = (n: number) =>
  n >= Number(process.env.DEMO_FROM ?? 1) && n <= Number(process.env.DEMO_STOP ?? Infinity);

const toMd = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<code>(.*?)<\/code>/g, "`$1`")
    .replace(/<\/?b>/g, "**")
    .replace(/<\/?i>/g, "_")
    .replace(/<[^>]+>/g, "");

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export type Layout = "overlay" | "panel";
const LAYOUTS = ["overlay", "panel"];
/** Panel layout geometry: 1920x1080 frame, app at full size (1360x850) right of a 400 px text column. */
const APP = { x: 504, y: 115, width: 1360, height: 850 };

export class Demo {
  /** The app's frame: the page itself, or (layout "panel") the frame beside the text. Use it for everything in the app. */
  app: Frame;
  private beginAt?: number;
  private posterAt?: number;
  private cues: Cue[] = [];
  private lines: { key: string; text: string }[] = [];

  private constructor(
    private page: Page,
    private outDir: string,
    private stills: boolean,
    private videoStart: number,
    private layout: Layout,
  ) {
    this.app = page.mainFrame();
  }

  static async start(page: Page, context: BrowserContext, outDir: string,
    { stills = true, layout = (process.env.DEMO_LAYOUT || "overlay") as Layout } = {}) {
    if (!LAYOUTS.includes(layout)) throw new Error(`DEMO_LAYOUT must be one of ${LAYOUTS.join(", ")}, not "${layout}"`);
    // Later, the overlay wouldn't reach the open page and the video's start (below) would be unknown.
    if (page.url() !== "about:blank")
      throw new Error("Call Demo.start before the first page.goto: log in and seed after it, then call demo.begin()");
    await context.addInitScript(OVERLAY);
    // Fresh stills each run, so a shorter run never leaves stale screenshots behind.
    fs.rmSync(path.join(outDir, "stills"), { recursive: true, force: true });
    fs.mkdirSync(path.join(outDir, "stills"), { recursive: true });
    // The video starts when the page opens. A fresh page's about:blank was created then (measured within 2 ms).
    // (Not "close time - video length": Playwright pads ~0.9 s after close.)
    const videoStart = await page.evaluate(() => performance.timeOrigin);
    return new Demo(page, outDir, stills, videoStart, layout);
  }

  /**
   * Opens the app. Overlay: page.goto. Panel: loads the URL once (to resolve baseURL and redirects), then puts
   * it in the frame beside the text column, on a page served from the app's own origin so cookies and
   * sessionStorage are the app's. Later navigations: demo.app.goto(...).
   */
  async open(url: string) {
    await this.page.goto(url);
    if (this.layout !== "panel") return;
    const src = this.page.url();
    const wrapper = new URL("/__demo_panel__", src).href;
    await this.page.route(wrapper, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: panelHtml(src) }));
    await this.page.goto(wrapper);
    this.app = this.page.frame({ name: "__demo_app" })!;
  }

  /**
   * Caption, held for `ms` (default: reading time), then hidden so it never describes the next screen.
   * `top` moves it up when the bottom of the screen matters; `keep` leaves it up; `voice` is what to say
   * instead of the caption when DEMO_VOICE is set. Takes a still first.
   */
  async say(
    step: string,
    title: string,
    body: string,
    ms = readTime(title, body),
    { top, keep = false, voice }: { top?: boolean; keep?: boolean; voice?: string } = {},
  ) {
    const v = this.voiceFor(voice ?? spokenText(title, body), ms);
    ms = process.env.DEMO_FAST === "1" ? Math.min(v.ms, 300) : v.ms;
    const cue: Cue = { at: 0, kind: "say", kicker: step, title, body, ms, keep, voice: v.key };
    if (this.stills) {
      const n = this.cues.filter((c) => c.kind === "say").length + 1;
      cue.still = `stills/${String(n).padStart(2, "0")}.png`;
      const file = path.join(this.outDir, cue.still);
      if (this.layout === "panel") await this.page.screenshot({ path: file, clip: APP }); // the app only
      // Hidden in the screenshot only, so a kept caption doesn't blink off in the video.
      else await this.page.screenshot({ path: file, style: "#__demo_cap{visibility:hidden!important}" });
    }
    this.cues.push(cue);
    // Stamped by the page as it draws: slowMo adds 350 ms around each call, so a Node-side stamp is off.
    cue.at = await this.page.evaluate((c) => {
      const w = window as any;
      if (w.__demoPanel) w.__demoPanel(c);
      else {
        sessionStorage.setItem("__demo_caption", JSON.stringify(c));
        w.__demoRender?.();
      }
      return Date.now();
    }, { step, title, body, top });
    await this.page.waitForTimeout(ms);
    if (!keep) await this.hideCaption();
  }

  async hideCaption() {
    await this.page.evaluate(() => {
      const w = window as any;
      if (w.__demoPanel) return w.__demoPanel(null); // back to the chapter title
      sessionStorage.removeItem("__demo_caption");
      w.__demoRender?.();
    });
  }

  /** Full-screen chapter card. Becomes a "##" heading in steps.md and a chapter of the mp4 (`{ chapter: false }`: not a chapter). */
  async card(kicker: string, title: string, lines: string[], ms = readTime(title, ...lines), { chapter = true } = {}) {
    const v = this.voiceFor(spokenText(title, ""), ms);
    ms = process.env.DEMO_FAST === "1" ? Math.min(v.ms, 300) : v.ms;
    const at = await this.page.evaluate(({ kicker, title, lines }) => {
      const el = document.createElement("div");
      el.id = "__demo_card";
      el.innerHTML = `<div class="k">${kicker}</div><h1>${title}</h1><ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`;
      document.body.appendChild(el);
      (window as any).__demoChapter?.(kicker, title);
      return Date.now();
    }, { kicker, title, lines });
    this.cues.push({ at, kind: "card", kicker, title, body: lines.join("\n"), ms, voice: v.key, chapter });
    await this.page.waitForTimeout(ms);
    // Fade out the same way it faded in, then remove.
    await this.page.evaluate(() => {
      const el = document.getElementById("__demo_card");
      if (el) el.style.opacity = "0";
    });
    await this.page.waitForTimeout(250);
    await this.page.evaluate(() => document.getElementById("__demo_card")?.remove());
  }

  /** With DEMO_VOICE set: records the line and, outside a dry run, holds at least as long as its clip. */
  private voiceFor(text: string, ms: number): { ms: number; key?: string } {
    const voice = process.env.DEMO_VOICE;
    if (!voice) return { ms };
    const key = voiceKey(voice, text);
    if (!this.lines.some((l) => l.key === key)) this.lines.push({ key, text });
    if (process.env.DEMO_FAST === "1") return { ms, key };
    const dir = path.join(this.outDir, "voice");
    const wav = path.join(dir, `${key}.wav`);
    if (!fs.existsSync(wav))
      throw new Error(`No voice clip for "${text}". Run the DEMO_FAST=1 dry run, then ` +
        `~/.cache/walkthrough-voice/bin/python ~/.claude/skills/recording-walkthrough-videos/voice.py ${dir}`);
    const sec = probeDuration(wav);
    if (sec == null) throw new Error("DEMO_VOICE needs ffprobe (comes with system ffmpeg) to time each clip");
    return { key, ms: Math.max(ms, Math.round(sec * 1000) + 300) };
  }

  /**
   * Marks the poster: the frame shown before the video plays (chat and social thumbnails take frame 0). Call it
   * while the strongest settled screen is up, e.g. right after the result lands. Default: the middle of the first caption.
   */
  async poster() {
    this.posterAt = await this.page.evaluate(() => Date.now());
  }

  /** Call after login and seeding, right before the first card: the mp4 and steps.md start here. */
  begin() {
    this.beginAt = Date.now();
  }

  /** Closes the page, saves <name>.webm (+ <name>.mp4 when system ffmpeg exists) and steps.md. */
  async finish(name: string) {
    const vp = this.page.viewportSize();
    await this.page.close();
    const closedAt = Date.now();
    const webm = path.join(this.outDir, `${name}.webm`);
    const rec = this.page.video(); // null when the config records no video: stills and steps.md only
    if (rec) await rec.saveAs(webm);
    const videoStart = this.videoStart;
    const origin = Math.max(videoStart, this.beginAt ?? videoStart);
    const clock = (at: number) => mmss(Math.max(0, at - origin));
    const mp4 = path.join(this.outDir, `${name}.mp4`);
    const made = rec ? toMp4(webm, mp4, (origin - videoStart) / 1000) : false;
    const video = made ? `${name}.mp4` : rec ? `${name}.webm` : null;
    const voice = process.env.DEMO_VOICE;
    if (voice) {
      fs.mkdirSync(path.join(this.outDir, "voice"), { recursive: true });
      fs.writeFileSync(path.join(this.outDir, "voice", "lines.json"), JSON.stringify({ voice, lines: this.lines }, null, 1));
    }
    const clips = this.cues
      .filter((c) => c.voice && c.at >= origin)
      .map((c) => ({ wav: path.join(this.outDir, "voice", `${c.voice}.wav`), ms: Math.round(c.at - origin) }));
    const voiced = voice && process.env.DEMO_FAST !== "1" && clips.length > 0;
    if (voiced && !made) throw new Error("DEMO_VOICE needs system ffmpeg (with libx264) to add the voice to an mp4");
    if (made) {
      checkSize(mp4, vp);
      if (voiced) addVoice(mp4, clips);
      contactSheet(mp4, path.join(this.outDir, "contact-sheet.png"));
      const first = this.cues.find((c) => c.kind === "say" && c.at >= origin);
      const at = this.posterAt ?? (first ? first.at + first.ms / 2 : undefined);
      if (at !== undefined) bakePoster(mp4, Math.max(0, (at - origin) / 1000));
      writeChapters(mp4, toChapters(this.cues, origin, probeDuration(mp4) ?? 0));
    }
    const md = [`# ${name}`, ""];
    if (video) {
      fs.writeFileSync(path.join(this.outDir, `${name}.vtt`), toVtt(this.cues, origin, closedAt));
      md.push(`Video: \`${video}\``, "", `Subtitles: \`${name}.vtt\``, "");
    }
    let n = 0;
    for (const c of this.cues) {
      if (c.kind === "card") {
        md.push(`## ${toMd(c.title)}`, "", `_${toMd(c.kicker)} · video ${clock(c.at)}_`, "");
        md.push(...c.body.split("\n").map((l) => `- ${toMd(l)}`), "");
      } else {
        md.push(`### ${++n}. ${toMd(c.title)}`, "", `${toMd(c.body)} _(video ${clock(c.at)})_`, "");
        if (c.still) md.push(`![${toMd(c.title)}](${c.still})`, "");
      }
    }
    fs.writeFileSync(path.join(this.outDir, "steps.md"), md.join("\n"));
  }
}

const vttTime = (ms: number) => new Date(ms).toISOString().slice(11, 23); // HH:MM:SS.mmm
/** Cue text: only <b>/<i> survive (attributes dropped), a raw "<" is escaped, "-->" would end the cue so it's "→". */
const vttText = (html: string) =>
  html
    .replace(/-->/g, "→")
    .replace(/<code>(.*?)<\/code>/g, "$1")
    .replace(/<(\/?)([bi])\b[^>]*>/gi, "\u0000$1$2\u0001")
    .replace(/<[a-z\/!][^>]*>/gi, "")
    .replace(/</g, "&lt;")
    .replace(/\u0000/g, "<")
    .replace(/\u0001/g, ">");

/** WebVTT subtitles for the burned-in captions and cards: for translation, screen readers and LMS/YouTube uploads. */
export function toVtt(cues: Cue[], origin: number, endAt: number): string {
  const out = ["WEBVTT", ""];
  let n = 0;
  cues.forEach((c, i) => {
    const end = c.keep ? (cues[i + 1]?.at ?? endAt) : c.at + c.ms + (c.kind === "card" ? 250 : 0);
    if (end <= origin) return; // shown before begin(): trimmed out of the mp4
    const body = c.body.replace(/<br\s*\/?>/gi, "\n").split("\n").map(vttText).filter((l) => l.trim());
    out.push(String(++n), `${vttTime(Math.max(0, c.at - origin))} --> ${vttTime(end - origin)}`,
      `<b>${vttText(c.title.replace(/<[a-z\/!][^>]*>/gi, ""))}</b>`, ...body, "");
  });
  return out.join("\n");
}

/**
 * Saves the frame at `atSec` as <name>.jpg and makes it frame 0 of the mp4 (only that frame's pixels change: same
 * length, audio copied). Slack, WhatsApp and X ignore cover-art metadata and thumbnail frame 0.
 */
export function bakePoster(mp4: string, atSec: number) {
  const jpg = mp4.replace(/\.mp4$/, ".jpg"), tmp = mp4.replace(/\.mp4$/, "") + ".tmp.mp4";
  try {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", atSec.toFixed(3), "-i", mp4, "-frames:v", "1", "-q:v", "2", jpg], { stdio: "pipe" });
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", mp4, "-i", jpg, "-filter_complex", "[0:v][1:v]overlay=0:0:enable='eq(n,0)'[v]",
      "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", tmp],
      { stdio: "pipe" });
  } catch (e: any) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`ffmpeg failed baking the poster: ${e.stderr?.toString().trim() || e.message}`);
  }
  fs.renameSync(tmp, mp4);
}

export type Chapter = { title: string; start: number; end: number }; // seconds into the mp4

/** Cards as chapters. The first starts at 0 (players and YouTube expect a 0:00 chapter); each ends where the next starts. */
export function toChapters(cues: Cue[], origin: number, durationSec: number): Chapter[] {
  const starts = cues.filter((c) => c.kind === "card" && c.chapter !== false)
    .map((c) => ({ title: c.title.replace(/<[^>]+>/g, ""), start: Math.max(0, (c.at - origin) / 1000) }))
    .filter((c) => c.start < durationSec);
  if (starts.length) starts[0].start = 0;
  return starts.map((c, i) => ({ ...c, end: starts[i + 1]?.start ?? durationSec }));
}

/** Embeds chapters in the mp4 (stream copy) and writes <name>.chapters.vtt and youtube-chapters.txt beside it. */
export function writeChapters(mp4: string, chapters: Chapter[]) {
  if (!chapters.length) return;
  const outDir = path.dirname(mp4), base = path.basename(mp4, ".mp4"); // <name>.vtt is the subtitles: never reuse it
  const meta = path.join(outDir, `${base}.ffmeta`);
  fs.writeFileSync(meta, [";FFMETADATA1", ...chapters.flatMap((c) => ["[CHAPTER]", "TIMEBASE=1/1000",
    `START=${Math.round(c.start * 1000)}`, `END=${Math.round(c.end * 1000)}`, `title=${c.title.replace(/[=;#\\\n]/g, " ")}`])].join("\n") + "\n");
  const tmp = mp4.replace(/\.mp4$/, "") + ".tmp.mp4";
  try {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", mp4, "-i", meta, "-map", "0", "-map_metadata", "1", "-map_chapters", "1",
      "-c", "copy", "-movflags", "+faststart", tmp], { stdio: "pipe" });
  } catch (e: any) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`ffmpeg failed adding chapters: ${e.stderr?.toString().trim() || e.message}`);
  } finally {
    fs.rmSync(meta, { force: true });
  }
  fs.renameSync(tmp, mp4);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  fs.writeFileSync(path.join(outDir, `${base}.chapters.vtt`), ["WEBVTT", "", ...chapters.flatMap((c, i) =>
    [`chapter-${i + 1}`, `${vttTime(c.start * 1000)} --> ${vttTime(c.end * 1000)}`, c.title, ""])].join("\n"));
  // YouTube turns these into chapters when pasted in the description (it needs 3+, each at least 10 s).
  fs.writeFileSync(path.join(outDir, "youtube-chapters.txt"), chapters.map((c) => `${mmss(c.start)} ${c.title}`).join("\n") + "\n");
}

/** Length in seconds, or null when ffprobe is missing or can't read it. */
export function probeDuration(file: string): number | null {
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { stdio: "pipe" });
    const s = Number(out.toString().trim());
    return Number.isFinite(s) ? s : null;
  } catch {
    return null;
  }
}

/**
 * H.264 mp4 plays everywhere (Drive, WhatsApp, PowerPoint, Safari); webm does not. Starts `startSec` into the webm.
 * Returns false only when system ffmpeg is missing (Playwright's bundled one can't encode H.264); any other
 * failure throws, so a broken encode is never mistaken for "no ffmpeg". Writes a tmp file and renames on success.
 */
export function toMp4(webm: string, mp4: string, startSec = 0): boolean {
  const tmp = mp4.replace(/\.mp4$/, "") + ".tmp.mp4";
  try {
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...(startSec > 0 ? ["-ss", startSec.toFixed(3)] : []),
      "-i", webm, "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-crf", "23", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", tmp], { stdio: "pipe" });
  } catch (e: any) {
    fs.rmSync(tmp, { force: true });
    if (e.code === "ENOENT") return false;
    throw new Error(`ffmpeg failed: ${e.stderr?.toString().trim() || e.message}`);
  }
  fs.renameSync(tmp, mp4);
  return true;
}

/** Text to speak for a caption: tags stripped, entities decoded, title and body joined as sentences. */
export function spokenText(title: string, body: string): string {
  const plain = (h: string) =>
    h.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const t = plain(title), b = plain(body);
  if (!b) return t;
  return /[.?!]$/.test(t) ? `${t} ${b}` : `${t}. ${b}`;
}

/** Cache key of a spoken line: a changed line or voice gets a new clip, an unchanged one reuses its clip. */
export const voiceKey = (voice: string, text: string) => createHash("sha1").update(`${voice}|${text}`).digest("hex").slice(0, 12);

/** Mixes each clip in at its cue time (clips don't overlap: each caption holds for its clip) and keeps the video as is. */
function addVoice(mp4: string, clips: { wav: string; ms: number }[]) {
  const tmp = mp4.replace(/\.mp4$/, "") + ".tmp.mp4";
  const graph = clips.map((c, i) => `[${i + 1}]adelay=${c.ms}|${c.ms}[a${i}]`).join(";") + ";" +
    clips.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${clips.length}:duration=longest:normalize=0[a]`;
  try {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", mp4, ...clips.flatMap((c) => ["-i", c.wav]), "-filter_complex", graph,
      "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart", tmp], { stdio: "pipe" });
  } catch (e: any) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`ffmpeg failed adding the voice: ${e.stderr?.toString().trim() || e.message}`);
  }
  fs.renameSync(tmp, mp4);
}

/** Throws when the video is smaller than the viewport: Playwright then scales it down and text turns blurry. */
function checkSize(mp4: string, vp: { width: number; height: number } | null) {
  if (!vp) return;
  const [w, h] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
    "-of", "csv=p=0", mp4]).toString().trim().split(",").map(Number);
  const even = (n: number) => n - (n % 2);
  if (w !== even(vp.width) || h !== even(vp.height))
    throw new Error(`Video is ${w}x${h} but the viewport is ${vp.width}x${vp.height}: set video.size equal to viewport in demo.config.ts`);
}

/** One frame every 5 s, 6 per row: check the whole video at a glance before watching it. */
function contactSheet(mp4: string, png: string) {
  const rows = Math.max(1, Math.ceil((probeDuration(mp4) ?? 0) / 30));
  // `select` keeps the first frame, so clips under 5 s still get one (fps=1/5 gives none).
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", mp4, "-vf",
    `select='isnan(prev_selected_t)+gte(t-prev_selected_t\\,5)',scale=480:-1,tile=6x${rows}`, "-vsync", "vfr", "-frames:v", "1", png]);
}

/** Amber outline around an element while a caption talks about it. */
export async function spot(target: Locator, on = true) {
  if (on) await target.scrollIntoViewIfNeeded();
  await target.evaluate((el, on) => {
    const e = el as HTMLElement;
    e.style.outline = on ? "4px solid #f59e0b" : "";
    e.style.outlineOffset = on ? "4px" : "";
    if (on) e.dataset.demoSpot = "";
    else delete e.dataset.demoSpot; // the caption keeps clear of spotted elements
  }, on);
}

/** Panel layout page: text column left, the app at full size right. Light, so the dark chapter card still marks a cut. */
function panelHtml(src: string) {
  const attr = src.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<!doctype html><meta charset="utf-8"><title>Walkthrough</title><style>
html,body{margin:0;height:100%;overflow:hidden;background:#f1eee8}
#__demo_side{position:fixed;left:56px;top:${APP.y}px;width:400px;color:#374151;
  font:22px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
#__demo_side .k{font-size:15px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#92400e}
#__demo_side .t{font-size:40px;line-height:1.15;font-weight:700;color:#111827;margin:12px 0 20px;text-wrap:balance}
#__demo_side.idle .t{color:#57534e}
#__demo_side code{background:#e7e1d6;color:#1f2937;padding:1px 7px;border-radius:5px;font-size:.9em}
#__demo_app{position:fixed;left:${APP.x}px;top:${APP.y}px;width:${APP.width}px;height:${APP.height}px;border:0;
  border-radius:12px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08),0 16px 48px rgba(0,0,0,.14)}
</style>
<div id="__demo_side" class="idle"><div class="k"></div><div class="t"></div><div class="b"></div></div>
<iframe id="__demo_app" name="__demo_app" src="${attr}"></iframe>
<script>
let chapter = { step: "", title: "", body: "" };
const side = document.getElementById("__demo_side");
// Caption beside the app; null shows the current chapter instead of an empty column.
window.__demoPanel = (c) => {
  const s = c || chapter;
  side.className = c ? "" : "idle";
  side.querySelector(".k").innerHTML = s.step;
  side.querySelector(".t").innerHTML = s.title;
  side.querySelector(".b").innerHTML = c ? s.body : "";
};
window.__demoChapter = (step, title) => { chapter = { step, title, body: "" }; window.__demoPanel(null); };
</script>`;
}

/** Keeps a toast on screen: most toast libraries pause their timer on hover. */
export async function hold(toast: Locator) {
  await toast.last().hover();
}
