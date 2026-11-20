// Self-test for demo-kit.ts. Run after editing the kit (see "Files" in SKILL.md). Uses a routed fake page, never a real app.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { Demo, probeDuration, readTime, runPart, spokenText, spot, toMp4, toVtt, voiceKey, type Cue } from "./demo-kit";

const OUT = "out/selftest";
const probe = (f: string, entries: string) =>
  execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", entries, "-of", "csv=p=0", f])
    .toString()
    .trim();
const pixel = (png: string, x: number, y: number) => [
  ...execFileSync("ffmpeg", ["-v", "error", "-i", png, "-vf", `crop=1:1:${x}:${y}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]),
];
async function openTestPage(page: Page) {
  await page.route("http://demo.test/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<!doctype html><body style='margin:0;background:#fff'><h1>Kit self-test</h1></body>",
    }),
  );
  await page.goto("http://demo.test/");
}
// Serves `body` at every http://demo.test/ URL; /inner gets a plain page (for iframe tests).
async function routeHtml(page: Page, body: string) {
  await page.route("http://demo.test/**", (r) =>
    r.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><body style='margin:0;background:#fff'>${r.request().url().endsWith("/inner") ? "<p>inner</p>" : body}</body>`,
    }),
  );
}
const box = (page: Page, sel: string) => page.locator(sel).evaluate((e) => e.getBoundingClientRect().toJSON());
fs.mkdirSync(OUT, { recursive: true });

test("toMp4 returns false when ffmpeg is missing", () => {
  const old = process.env.PATH;
  process.env.PATH = "/nonexistent";
  try {
    expect(toMp4("x.webm", "x.mp4")).toBe(false);
  } finally {
    process.env.PATH = old;
  }
});

test("toMp4 throws ffmpeg's error on a bad input", () => {
  fs.writeFileSync(`${OUT}/bad.webm`, "not a video");
  expect(() => toMp4(`${OUT}/bad.webm`, `${OUT}/bad.mp4`)).toThrow(/ffmpeg/i);
  // a failed encode leaves nothing that could be mistaken for the video
  expect(fs.existsSync(`${OUT}/bad.mp4`)).toBe(false);
  expect(fs.existsSync(`${OUT}/bad.tmp.mp4`)).toBe(false);
});

test("toMp4 rounds an odd frame size down to even", () => {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=1001x701:duration=1", "-c:v", "libvpx", `${OUT}/odd.webm`]);
  expect(toMp4(`${OUT}/odd.webm`, `${OUT}/odd.mp4`)).toBe(true);
  expect(probe(`${OUT}/odd.mp4`, "stream=width,height")).toBe("1000,700");
});

test("probeDuration returns null for a file without a readable duration", () => {
  fs.writeFileSync(`${OUT}/bad.webm`, "not a video");
  expect(probeDuration(`${OUT}/bad.webm`)).toBeNull();
});

test("begin() trims the pre-roll from mp4 and steps.md", async ({ page, context }) => {
  const demo = await Demo.start(page, context, `${OUT}/trim`);
  await openTestPage(page);
  await page.waitForTimeout(3000); // stands in for login + seeding
  demo.begin();
  await demo.say("Part 1", "First step", "Body.", 1500);
  await demo.finish("trim");
  const webm = probeDuration(`${OUT}/trim/trim.webm`)!,
    mp4 = probeDuration(`${OUT}/trim/trim.mp4`)!;
  expect(webm - mp4).toBeGreaterThan(2.5);
  expect(fs.readFileSync(`${OUT}/trim/steps.md`, "utf8")).toContain("_(video 00:00)_");
  expect(fs.readFileSync(`${OUT}/trim/trim.vtt`, "utf8")).toMatch(/^WEBVTT\n\n1\n00:00:00\.\d{3} --> /);
  expect(fs.existsSync(`${OUT}/trim/contact-sheet.png`)).toBe(true);
  expect(probe(`${OUT}/trim/contact-sheet.png`, "stream=width")).toBe("2880");
  expect(probe(`${OUT}/trim/trim.mp4`, "stream=width,height")).toBe("1600,900"); // 16:9
});

test("finish() embeds the cards as mp4 chapters, <name>.chapters.vtt and youtube-chapters.txt", async ({ page, context }) => {
  const demo = await Demo.start(page, context, `${OUT}/chapters`);
  await openTestPage(page);
  await page.waitForTimeout(1500); // pre-roll: the first chapter still starts at 0:00
  demo.begin();
  await demo.card("Part 1", "First <b>part</b>", ["one"], 800);
  await demo.say("Part 1", "Step", "Body.", 800);
  await demo.card("Part 2", "Second part", ["two"], 800);
  await demo.say("Part 2", "Step", "Body.", 800);
  await demo.card("The end", "Closing card", ["bye"], 800, { chapter: false });
  await demo.finish("chapters");
  const titles = execFileSync("ffprobe", ["-v", "error", "-show_entries", "chapter_tags=title:chapter=start_time", "-of", "csv=p=0",
    `${OUT}/chapters/chapters.mp4`]).toString().trim().split("\n");
  expect(titles).toHaveLength(2);
  expect(titles[0]).toMatch(/^0\.000000,First part$/);
  expect(titles[1]).toMatch(/,Second part$/);
  expect(fs.readFileSync(`${OUT}/chapters/youtube-chapters.txt`, "utf8")).toMatch(/^0:00 First part\n0:0\d Second part\n$/);
  expect(fs.readFileSync(`${OUT}/chapters/chapters.chapters.vtt`, "utf8")).toMatch(/^WEBVTT\n\nchapter-1\n00:00:00\.000 --> /);
  // the subtitles keep their own file, even for a video named "chapters"
  expect(fs.readFileSync(`${OUT}/chapters/chapters.vtt`, "utf8")).toContain("<b>First part</b>");
});

test("poster(): the marked frame becomes <name>.jpg and frame 0 of the mp4, length unchanged", async ({ page, context }) => {
  const demo = await Demo.start(page, context, `${OUT}/poster`);
  await openTestPage(page);
  demo.begin();
  await demo.say("Part 1", "White", "Body.", 1000);
  await page.evaluate(() => (document.body.style.background = "rgb(220, 30, 30)"));
  await page.waitForTimeout(600);
  await demo.poster();
  await page.waitForTimeout(600);
  await page.evaluate(() => (document.body.style.background = "rgb(30, 30, 220)"));
  await demo.say("Part 1", "Blue", "Body.", 1000);
  await demo.finish("poster");
  expect(fs.existsSync(`${OUT}/poster/poster.jpg`)).toBe(true);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", `${OUT}/poster/poster.mp4`, "-frames:v", "1", `${OUT}/poster/frame0.png`]);
  const [r, g, b] = pixel(`${OUT}/poster/frame0.png`, 1500, 120); // top right: away from the caption box
  expect(r).toBeGreaterThan(180);
  expect(g + b).toBeLessThan(140);
  // the poster replaced frame 0 only: the mp4 still lasts as long as the trimmed recording
  expect(Math.abs(probeDuration(`${OUT}/poster/poster.mp4`)! - probeDuration(`${OUT}/poster/poster.webm`)!)).toBeLessThan(1.5);
});

test("without begin() timestamps count from the video's first frame", async ({ page, context }) => {
  const demo = await Demo.start(page, context, `${OUT}/nobegin`);
  await openTestPage(page);
  await page.waitForTimeout(2500); // seeding, not trimmed without begin()
  await demo.say("Part 1", "Late step", "Body.", 1000);
  await demo.finish("nobegin");
  expect(fs.readFileSync(`${OUT}/nobegin/steps.md`, "utf8")).toMatch(/video 00:0[23]\)/);
});

test("Demo.start after a navigation throws with the fix", async ({ page, context }) => {
  await openTestPage(page);
  await expect(Demo.start(page, context, `${OUT}/late`)).rejects.toThrow(/before the first page\.goto/);
});

test("toVtt writes cues with HH:MM:SS.mmm times and only b/i tags", () => {
  const cues: Cue[] = [
    { at: 10_000, kind: "card", kicker: "Part 1", title: "Setting up", body: "Done once.\nBy a <code>manager</code>.", ms: 2000 },
    { at: 12_250, kind: "say", kicker: "Part 1", title: "New <b>field</b>", body: "Fill <i>Prefix</i> &amp; save.", ms: 3000 },
    { at: 15_250, kind: "say", kicker: "Part 1", title: "Kept", body: "Talks across a click.", ms: 3000, keep: true },
  ];
  expect(toVtt(cues, 10_000, 20_000)).toBe(
    [
      "WEBVTT", "",
      "1", "00:00:00.000 --> 00:00:02.250", "<b>Setting up</b>", "Done once.", "By a manager.", "",
      "2", "00:00:02.250 --> 00:00:05.250", "<b>New field</b>", "Fill <i>Prefix</i> &amp; save.", "",
      "3", "00:00:05.250 --> 00:00:10.000", "<b>Kept</b>", "Talks across a click.", "",
    ].join("\n"),
  );
});

test("a still neither blinks the caption off nor shows it", async ({ page, context }) => {
  const demo = await Demo.start(page, context, `${OUT}/still`);
  await openTestPage(page);
  await page.evaluate(() => {
    const w = window as any;
    w.__hides = 0;
    new MutationObserver(() => {
      if (document.getElementById("__demo_cap")?.style.display === "none") w.__hides++;
    }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["style"] });
  });
  await demo.say("P", "One", "Kept.", 800, { keep: true });
  await page.evaluate(() => ((window as any).__hides = 0));
  await demo.say("P", "Two", "Next.", 800, { keep: true });
  expect(await page.evaluate(() => (window as any).__hides)).toBe(0);
  const vp = page.viewportSize()!;
  expect(pixel(`${OUT}/still/stills/02.png`, Math.round(vp.width / 2), vp.height - 60)).toEqual([255, 255, 255]);
  await demo.finish("still");
});

test("a still last screen stays in the video until finish()", async ({ page, context }) => {
  const demo = await Demo.start(page, context, `${OUT}/tail`);
  await openTestPage(page);
  await demo.say("P", "Last", "Kept on screen.", 3000, { keep: true });
  await demo.finish("tail");
  expect(probeDuration(`${OUT}/tail/tail.webm`)!).toBeGreaterThan(3);
});

test("finish() refuses a video smaller than the viewport", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 750 },
    recordVideo: { dir: `${OUT}/mismatch/raw`, size: { width: 800, height: 500 } } });
  const page = await context.newPage();
  const demo = await Demo.start(page, context, `${OUT}/mismatch`);
  await openTestPage(page);
  await demo.say("P", "One", "Body.", 500);
  await expect(demo.finish("mismatch")).rejects.toThrow(/video\.size/);
  await context.close();
});

test("readTime honours DEMO_FAST and the 3 s floor", () => {
  delete process.env.DEMO_FAST;
  expect(readTime("one two")).toBe(3000);
  process.env.DEMO_FAST = "1";
  try {
    expect(readTime("one two")).toBe(300);
  } finally {
    delete process.env.DEMO_FAST;
  }
});

test("runPart honours DEMO_FROM and DEMO_STOP", () => {
  Object.assign(process.env, { DEMO_FROM: "2", DEMO_STOP: "3" });
  try {
    expect([1, 2, 3, 4].map(runPart)).toEqual([false, true, true, false]);
  } finally {
    delete process.env.DEMO_FROM;
    delete process.env.DEMO_STOP;
  }
  expect(runPart(99)).toBe(true);
});

test("spokenText strips tags and decodes entities", () => {
  expect(spokenText("New <b>field</b>", "Fill <i>Prefix</i> &amp; save.")).toBe("New field. Fill Prefix & save.");
  expect(spokenText("Why?", "Because.")).toBe("Why? Because.");
});

test("voice: a caption holds for its audio and the mp4 gets an audio track", async ({ page, context }) => {
  process.env.DEMO_VOICE = "test";
  try {
    const key = voiceKey("test", spokenText("Hold", "Short."));
    fs.mkdirSync(`${OUT}/voice/voice`, { recursive: true });
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=440:d=4", `${OUT}/voice/voice/${key}.wav`]);
    const demo = await Demo.start(page, context, `${OUT}/voice`);
    await openTestPage(page);
    await demo.say("P", "Hold", "Short."); // readTime alone would be 3000 ms
    await demo.finish("voice");
    const [, times] = fs.readFileSync(`${OUT}/voice/voice.vtt`, "utf8").split("\n1\n");
    const [a, b] = times.split("\n")[0].split(" --> ").map((t) => {
      const [h, m, s] = t.split(":");
      return +h * 3600 + +m * 60 + +s;
    });
    expect(b - a).toBeGreaterThanOrEqual(4.3);
    expect(execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type",
      "-of", "csv=p=0", `${OUT}/voice/voice.mp4`]).toString().trim()).toBe("audio");
    expect(JSON.parse(fs.readFileSync(`${OUT}/voice/voice/lines.json`, "utf8")).lines[0].key).toBe(key);
  } finally {
    delete process.env.DEMO_VOICE;
  }
});

test("voice: a missing clip fails fast with the fix", async ({ page, context }) => {
  process.env.DEMO_VOICE = "test";
  try {
    const demo = await Demo.start(page, context, `${OUT}/novoice`);
    await openTestPage(page);
    await expect(demo.say("P", "Never synthesized", "Body.")).rejects.toThrow(/voice\.py/);
  } finally {
    delete process.env.DEMO_VOICE;
  }
});

test("begin() keeps the first caption's whole hold in the mp4", async ({ page, context }) => {
  const demo = await Demo.start(page, context, `${OUT}/hold`);
  await openTestPage(page);
  await page.waitForTimeout(1500);
  demo.begin();
  await demo.say("P", "First", "Held two seconds.", 2000);
  await page.waitForTimeout(500);
  await demo.finish("hold");
  const vp = page.viewportSize()!;
  // caption pixel per frame (25 fps): dark while the caption is up
  const px = execFileSync("ffmpeg", ["-v", "error", "-i", `${OUT}/hold/hold.mp4`, "-vf",
    `scale=${vp.width}:${vp.height},crop=1:1:${vp.width / 2}:${vp.height - 60}`, "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
  const shownFor = [...px].filter((v) => v < 100).length / 25;
  expect(shownFor).toBeGreaterThan(1.8);
});

test("toVtt survives <br>, -->, tag attributes and a raw <", () => {
  const cues: Cue[] = [
    { at: 0, kind: "say", kicker: "P", title: "Setup --> Users", body: 'line one<br>line two<br/><b class="x">y</b> costs < 5', ms: 1000 },
  ];
  expect(toVtt(cues, 0, 5000)).toBe(
    ["WEBVTT", "", "1", "00:00:00.000 --> 00:00:01.000", "<b>Setup → Users</b>", "line one", "line two", "<b>y</b> costs &lt; 5", ""].join("\n"),
  );
});

test("finish() without video recording still writes steps.md and stills", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  const demo = await Demo.start(page, context, `${OUT}/novideo`);
  await openTestPage(page);
  await demo.say("P", "Only stills", "Body.", 300);
  await demo.finish("novideo");
  expect(fs.readFileSync(`${OUT}/novideo/steps.md`, "utf8")).toContain("Only stills");
  expect(fs.existsSync(`${OUT}/novideo/stills/01.png`)).toBe(true);
  await context.close();
});

test("voice: missing ffprobe or ffmpeg fails instead of silently dropping the voice", async ({ page, context }) => {
  process.env.DEMO_VOICE = "test";
  const old = process.env.PATH;
  try {
    const key = voiceKey("test", spokenText("Needs", "Tools."));
    fs.mkdirSync(`${OUT}/notools/voice`, { recursive: true });
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=d=1", `${OUT}/notools/voice/${key}.wav`]);
    const demo = await Demo.start(page, context, `${OUT}/notools`);
    await openTestPage(page);
    process.env.PATH = "/nonexistent";
    await expect(demo.say("P", "Needs", "Tools.")).rejects.toThrow(/ffprobe/);
    process.env.PATH = old;
    await demo.say("P", "Needs", "Tools.");
    process.env.PATH = "/nonexistent";
    await expect(demo.finish("notools")).rejects.toThrow(/ffmpeg/);
  } finally {
    process.env.PATH = old;
    delete process.env.DEMO_VOICE;
  }
});

test("DEMO_FAST also caps explicit holds", async ({ page, context }) => {
  const demo = await Demo.start(page, context, `${OUT}/fast`);
  await openTestPage(page);
  process.env.DEMO_FAST = "1";
  try {
    const t = Date.now();
    await demo.say("P", "Long", "Explicit hold.", 5000);
    await demo.card("P", "Card", ["Explicit hold."], 5000);
    expect(Date.now() - t).toBeLessThan(5000);
  } finally {
    delete process.env.DEMO_FAST;
  }
  await demo.finish("fast");
});

test("a caption sits above a bar fixed to the bottom of the screen", async ({ page, context }) => {
  const demo = await Demo.start(page, context, `${OUT}/footer`, { stills: false });
  await routeHtml(page, "<footer style='position:fixed;bottom:0;left:0;right:0;height:80px;background:#eee'>Save</footer>");
  await page.goto("http://demo.test/");
  await demo.say("P", "Above the bar", "Body.", 300, { keep: true });
  const cap = await box(page, "#__demo_cap"), bar = await box(page, "footer");
  expect(cap.bottom).toBeLessThanOrEqual(bar.top - 8);
  await demo.finish("footer");
});

test("a top caption sits below a bar fixed to the top of the screen", async ({ page, context }) => {
  const demo = await Demo.start(page, context, `${OUT}/header`, { stills: false });
  await routeHtml(page, "<header style='position:sticky;top:0;height:48px;background:#eee'>Nav</header><div style='height:2000px'></div>");
  await page.goto("http://demo.test/");
  await demo.say("P", "Below the bar", "Body.", 300, { keep: true, top: true });
  const cap = await box(page, "#__demo_cap"), bar = await box(page, "header");
  expect(cap.top).toBeGreaterThanOrEqual(bar.bottom + 8);
  await demo.finish("header");
});

test("a caption moves to the top instead of covering a spotted element", async ({ page, context }) => {
  const demo = await Demo.start(page, context, `${OUT}/dodge`, { stills: false });
  await routeHtml(page, "<input id='f' style='position:absolute;left:700px;top:780px;width:200px'>");
  await page.goto("http://demo.test/");
  await spot(page.locator("#f"));
  await demo.say("P", "Not over the field", "Body.", 300, { keep: true });
  const cap = await box(page, "#__demo_cap"), f = await box(page, "#f");
  expect(cap.bottom).toBeLessThanOrEqual(f.top);
  // top: false is an order, not a hint
  await demo.say("P", "At the bottom", "Body.", 300, { keep: true, top: false });
  expect((await box(page, "#__demo_cap")).top).toBeGreaterThan(450);
  await demo.finish("dodge");
});

test("no caption inside the app's own iframes", async ({ page, context }) => {
  const demo = await Demo.start(page, context, `${OUT}/iframe`, { stills: false });
  await routeHtml(page, "<h1>App</h1>");
  await page.goto("http://demo.test/");
  await demo.say("P", "Once only", "Body.", 300, { keep: true });
  // The app opens an iframe (print preview, embedded report) while the caption is up.
  await page.evaluate(() => document.body.insertAdjacentHTML("beforeend", "<iframe src='/inner' style='width:800px;height:600px'></iframe>"));
  const inner = page.frameLocator("iframe");
  await expect(inner.locator("p")).toHaveText("inner");
  await page.waitForTimeout(500); // the 400 ms re-render
  await expect(inner.locator("#__demo_cap")).toBeHidden();
  await demo.finish("iframe");
});

test("overlay layout: demo.open navigates the page and demo.app is its main frame", async ({ page, context }) => {
  const demo = await Demo.start(page, context, `${OUT}/open`, { stills: false });
  await routeHtml(page, "<h1>App</h1>");
  await demo.open("http://demo.test/x");
  expect(page.url()).toBe("http://demo.test/x");
  expect(demo.app).toBe(page.mainFrame());
  await demo.finish("open");
});

test("panel layout: the app runs at full size beside the caption", async ({ browser }) => {
  const size = { width: 1920, height: 1080 };
  const context = await browser.newContext({ viewport: size, recordVideo: { dir: `${OUT}/panel/raw`, size } });
  const page = await context.newPage();
  const demo = await Demo.start(page, context, `${OUT}/panel`, { layout: "panel" });
  await routeHtml(page, "<h1>App</h1><footer style='position:fixed;bottom:0;left:0;right:0;height:60px;background:#eee'>Bar</footer>");
  await demo.open("http://demo.test/start");
  expect(demo.app.url()).toBe("http://demo.test/start");
  expect(await demo.app.evaluate(() => [innerWidth, innerHeight])).toEqual([1360, 850]);
  demo.begin();
  await demo.card("Part 1", "Panel chapter", ["Line"], 300);
  await demo.say("Step 1", "Beside the app", "Body text.", 300, { keep: true });
  await expect(page.locator("#__demo_side")).toContainText("Beside the app");
  expect(await demo.app.locator("#__demo_cap:visible").count()).toBe(0);
  await demo.say("Step 2", "Hidden after", "Body.", 300);
  await expect(page.locator("#__demo_side")).toContainText("Panel chapter"); // idle: the chapter stays up
  await expect(page.locator("#__demo_side")).not.toContainText("Hidden after");
  await demo.app.goto("http://demo.test/next"); // the frame navigates, the panel stays
  expect(demo.app.url()).toBe("http://demo.test/next");
  await expect(page.locator("#__demo_side")).toBeVisible();
  await demo.finish("panel");
  expect(probe(`${OUT}/panel/stills/01.png`, "stream=width,height")).toBe("1360,850"); // stills show the app only
  expect(probe(`${OUT}/panel/panel.mp4`, "stream=width,height")).toBe("1920,1080");
  await context.close();
});

test("an unknown layout throws with the choices", async ({ page, context }) => {
  await expect(Demo.start(page, context, `${OUT}/badlayout`, { layout: "side" as any })).rejects.toThrow(/overlay, panel/);
});
