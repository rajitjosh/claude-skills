---
name: recording-walkthrough-videos
description: Use when asked for a demo, walkthrough, explainer, onboarding, setup or "how it works" video of a web app flow, or for step-by-step screenshots for setup docs, user guides, functional-team handover or release notes. Applies to any app Playwright can drive (Frappe desk, Vue/React SPAs).
argument-hint: "<feature or flow> on <dev/staging URL> for <functional team | end users>, layout <overlay | panel>, voice <no | af_heart>"
---

# Recording walkthrough videos

## Overview
Script the flow as a Playwright test with burned-in captions. One run gives you:
- `<name>.mp4` (plus the raw `<name>.webm`), cut to start at `demo.begin()`
- `<name>.vtt`, subtitles matching the captions (for translation, screen readers, LMS/YouTube uploads)
- `steps.md` (chapter headings, step text, timestamps) and `stills/NN.png`, one screenshot per step without its caption
- `contact-sheet.png`, one frame every 5 s, to check the whole video at a glance
- `<name>.jpg`, the poster, baked in as frame 0 of the mp4 so chat and social thumbnails show it (mark it with `demo.poster()`; default: the middle of the first caption)
- chapters, one per `demo.card(...)`: embedded in the mp4 (VLC, QuickTime), `<name>.chapters.vtt` for web players and `youtube-chapters.txt` to paste in a description. A closing card stays out with `{ chapter: false }`

The video is for watching and `steps.md` + stills are the start of the setup doc. Every step is asserted, so if the flow is broken the run fails and you never ship a misleading video.

Not this skill: a short promotional or launch film with music and motion. That is `making-product-promo-videos`.

## Start here: complete the request
Open `request-template.md`. Offer its Part 1 block to the user as the suggested prompt if they haven't written a request. Then follow its Part 2:
- Fill in every field the user's message already answers.
- Ask for the missing facts (flow, dev/staging site, demo login). Never use a production site.
- Offer every choice they didn't make (layout, pace, voiceover and voice, extras) in one message, with your recommendation marked.
- Confirm the completed request before writing the storyboard.

Before recording: the app is running and healthy, Node >= 22 (`nvm use 24`), Playwright >= 1.65, system ffmpeg (with ffprobe).

## Files in this skill
| File | Use |
|---|---|
| `request-template.md` | The request to suggest to the user, and how to fill in and ask about what's missing. Read it first |
| `demo-kit.ts` | `Demo.start / open / app / begin / card / say / hideCaption / finish`, `spot(locator)`, `hold(toast)`, `runPart(n)`, `readTime(...)`, `poster()`, chapters from the cards. Copy it next to the script |
| `demo.config.ts` | Separate Playwright config: 1600x900 (16:9; 1920x1080 with `DEMO_LAYOUT=panel`), video size = viewport, slowMo 350, 30-minute timeout, built-in action highlights (animated cursor + amber box on each click/fill, code title hidden). Highlights need Playwright >= 1.65 |
| `storyboard-template.md` | The sign-off sheet for step 1 |
| `frappe.md`, `vuetify.md` | Locators and gotchas for those stacks. Read the one that applies before scripting |
| `voice.py` | Optional offline voiceover (Kokoro). See Voiceover below |
| `kit-selftest.demo.ts` | Self-test for the kit. Run it after editing `demo-kit.ts`: copy the kit, config and this file into a folder with `@playwright/test` installed and run `npx playwright test -c demo.config.ts` |

## Recipe
1. **Storyboard first.** Complete the request (`request-template.md`), then fill `storyboard-template.md` with the audience, the parts (3 to 6) and what each part proves, and get it signed off. Pace (`DEMO_PACE`) scales click speed and caption holds together. Use a brainstorming skill (superpowers:brainstorming) if you have one and the flow isn't settled yet.
2. **Copy the kit**: put `demo-kit.ts` and `demo.config.ts` in `tests/e2e/<feature>/demo/` and write `<flow>.demo.ts`. Pass `Demo.start` a dated output folder (`out/<flow>-YYYY-MM-DD-HHmm`) when a previous recording exists, so a new run never overwrites one already shared.
3. **Log in and seed without filming it.**
   - Save a session once: `npx playwright codegen --save-storage=out/.auth.json <url>` (or the API login in `frappe.md`), then `test.use({ storageState: "out/.auth.json" })`. Keep `.auth.json` untracked.
   - Call `Demo.start` first, then seed through the API, fresh each run. Open the app with `await demo.open(url)`, never `page.goto`, and use `const app = demo.app` for every locator, `goto` and `evaluate` in the app. That way the same script records in both layouts. Create uniquely named records, because locked or used records break reruns (pick the next free name). Reset state left behind by other tests (open shifts, drafts).
   - Call `demo.begin()` after seeding, right before the first card. The mp4, `.vtt` and `steps.md` start there.
4. **Script each part** inside `if (runPart(n)) { ... }`. Call `await demo.poster()` once, on the screen that best shows the result (settled, not mid-transition): `demo.card(...)` opens the part, then for each step: the action, `expect(...)` on the result, `spot(el)`, `demo.say(step, title, body)`, `spot(el, false)`. `spot()` the field you talk about: the caption moves out of its way by itself.
5. **Dry run**: `DEMO_FAST=1 npx playwright test -c <dir>/demo.config.ts`. Every hold drops to 300 ms and slowMo to 0, so selector and data failures show up in a fraction of the time. It must pass before the real recording.
   Every dry run repeats the flow's writes (backups, sites, runs, starts): tell the user what each run adds before running it, and iterate on one part with `DEMO_FROM=n DEMO_STOP=n`.
6. **Record**: `DEMO_LAYOUT=<overlay|panel> DEMO_PACE=<n> npx playwright test -c <dir>/demo.config.ts`. Outputs go to the `outDir` you passed to `Demo.start`.
7. **Check**: open `contact-sheet.png` first, then 3 or 4 stills, then watch the mp4 once.
8. **Hand over** the mp4, `.vtt` and `steps.md`. Turn `steps.md` into the setup doc with whatever doc skill you have (anthropic-skills:docs, docx for Word).
   Write `share-copy.md` beside the mp4 with two versions: a chat post (title line, 2-4 bullets of what the video covers, links, chapter timestamps from `youtube-chapters.txt`) and an email version for groups and lists (plain headings, no `*asterisks*`, a subject line). Use the product's own words and the real numbers from the recording; nothing the video doesn't show.
   Sharing: over 25 MB in total, or for an email list, share Drive links, not attachments, restricted to the company domain when the screens show client data. Drive and browsers ignore embedded chapters, so put `youtube-chapters.txt` under the link.

While iterating on one part: `DEMO_FROM=n DEMO_STOP=n` runs only parts n..n. `steps.md` is only written by `finish()`.

## Layouts
| `DEMO_LAYOUT` | Video | Text | Use for |
|---|---|---|---|
| `overlay` (default) | 1600x900, the app full screen | Dark caption box. It sits at the bottom, above any toolbar fixed there. It moves to the top (below a fixed navbar) when it would cover a `spot()`ted element. `{ top: true / false }` forces a side | Functional handover, setup docs, wide screens (list views, reports, POS) |
| `panel` | 1920x1080, the app at full size (1360x850, not scaled) on the right | A 400 px column on the left: step, title, body. Between captions it shows the current chapter. Never covers the app. Stills show the app only | End users, onboarding, release notes, form- or dialog-sized flows |

Panel runs the app in a same-origin frame, so `demo.app` is that frame. Frappe desk allows this. A site whose web server sends `X-Frame-Options: DENY` or a CSP `frame-ancestors` won't load: use overlay there.

## Caption copy
- Audience is usually functional users: plain words, no code names. Quote UI labels in `<b>` and error messages verbatim in `<i>`.
- Title = what just happened ("Duplicate prefix refused"). Body = why it matters, in 1 or 2 sentences.
- Hold time defaults to reading time (about 2.3 words/s, because captions are dense with setting names; minimum 3 s). Pass `ms` only to linger on something.
- Polish wording with a writing skill if you have one (technical-writer, design:ux-copy).

## Motion
| Element | Motion | Why |
|---|---|---|
| Chapter card | 250 ms opacity fade in and out, strong ease-out (built into the kit) | About 6 per video. Softens the cut from the app to a dark full-screen card |
| Captions | None, hard cut | They change every few seconds. Subtitles always cut, and a fade only delays reading |
| Camera zoom / pan | None in walkthroughs | Setup viewers need to see where the field sits on the form. Zoom hides that context and makes text move while it's being read. Zoom belongs only in release clips (hyperframes) |
| Cursor and click highlight | Playwright `show.actions` | Shows where the action happens |
| The app's own animations | Leave on. Don't set `reducedMotion: "reduce"` | The video should show the product as users see it |

A video can't follow the viewer's reduced-motion setting, so keep added motion to the card fade only. (The kit also runs an invisible 1 px animation in the top-left corner: without it headless Chromium stops sending frames after a still spell and footage goes missing.)

## Voiceover (optional)
Use it for end-user onboarding and first-time users. Skip it for functional handover, which is usually watched muted next to the doc.

The voice is made **before** recording, so each caption holds for its spoken line:
1. Dry run with a voice: `DEMO_VOICE=af_heart DEMO_FAST=1 npx playwright test -c <dir>/demo.config.ts`. Writes `<outDir>/voice/lines.json`.
2. Synthesize: `~/.cache/walkthrough-voice/bin/python ~/.claude/skills/recording-walkthrough-videos/voice.py <outDir>/voice`. Only new or changed lines are synthesized.
3. Record: `DEMO_VOICE=af_heart npx playwright test -c <dir>/demo.config.ts`. The mp4 gets the voice track.

Voice: use `af_heart` (US female) by default. Use another only if asked.

Before synthesizing, read `lines.json` for anything that reads badly aloud: masked secrets (`••••`, `********`), file names and extensions (`.sql.gz`, `site_config.json`), paths (`/srv/benches`, `~/...`), codes, abbreviations, ₹ amounts. Give each its spoken line: `demo.say(step, title, body, undefined, { voice: "what to say instead" })`. Kokoro is English-first; Indian-language narration is out of scope. Setup for `voice.py` is in its header.

## Gotchas (all hit in real runs)
| Problem | Fix |
|---|---|
| Frappe or Vuetify app | Read `frappe.md` / `vuetify.md` before scripting |
| Video is blurry or 800px wide | `video.size` must equal `viewport` (already set in the config). `finish()` throws if they differ |
| Video starts on a blank page or the login | Call `demo.begin()` after seeding, right before the first card |
| `Demo.start` throws "Call Demo.start before the first page.goto" | It must come first: its overlay only reaches pages opened after it, and the video's start is read from the fresh page. Log in and seed after it, then `demo.begin()` |
| Toast vanishes before the caption is read | `hold(demo.app.locator(".toast", {hasText}))`, which hovers to pause it |
| Caption disappears after SPA or desk redraw | Kit re-renders every 400 ms. The caption lives in sessionStorage, so it survives navigation |
| `sessionStorage` SecurityError | You are on a `data:` or `about:blank` URL. Use a real origin or `page.route` |
| Wiping storage for a "new device" scene | Save `__demo_caption` from sessionStorage before `localStorage.clear()` / IndexedDB delete, then restore it |
| Offline scene | `context.setOffline(true/false)`, then wait for the app's own offline/online indicator |
| Print or a link opens a new tab, and that step is missing from the video | Playwright records each page as its own file. `const popup = await context.waitForEvent("page")` around the click, `popup.close()`, then `demo.app.goto(popup.url())`. The caption says it opens in a new tab for real users |
| Typed values appear all at once | For short values the viewer should watch (a search, a name): `locator.pressSequentially(text, { delay: 40 })`. `slowMo` also applies to every key press, so keep it to a few short fields and use `fill()` for the rest |
| Staging data shows real customer names | Seed your own records and filter lists to them. Blur (`demo.app.addStyleTag({ content: "<selector>{filter:blur(6px)}" })`) only what can't be filtered: blurred UI looks broken to viewers |
| Need the name of a created record | `page.waitForResponse(r => r.url().includes("/api/method/<m>"))` before the click, then read `.json()` |
| No mp4 next to the webm | `finish()` needs system ffmpeg with libx264 (`apt install ffmpeg`). Playwright's bundled ffmpeg can't encode it. Hand over the mp4: webm doesn't play in PowerPoint, Safari or WhatsApp. Any other ffmpeg failure throws with ffmpeg's message |
| Need `.srt` instead of `.vtt` | `ffmpeg -i <name>.vtt <name>.srt` |
| Short clip for a doc (GIF) | `ffmpeg -ss 00:12 -t 8 -i in.mp4 -vf "fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" clip.gif`, using a timestamp from steps.md |
| Caption covers something the viewer must see | `spot()` it, and the caption moves away. Otherwise `demo.say(..., undefined, { top: true })` (or `top: false`) |
| Panel: the app area stays blank | The site refuses to load in a frame (`X-Frame-Options` / `frame-ancestors`, usually from nginx). Use overlay |
| Panel: `expect(page).toHaveURL(...)` fails | `page` is the panel page. Use `await expect.poll(() => demo.app.url()).toContain(...)` |
| Caption lingers onto the next screen | Captions hide after their hold time by default. Pass `{ keep: true }` only to talk across an action |
| `spot()` outline doesn't show | See `vuetify.md` for clipping cards; elsewhere spot the parent |
| `{ top: true }` caption hides top-right toasts | Read the toast first with `hold()`, then caption it |
| Playwright 1.65 refuses to start | It needs Node 22 or newer. Run `nvm use 24` first |
| No cursor or click highlight in the video | `npx playwright --version` is below 1.65. Bump it, or run `npm install --no-save @playwright/test@1.65.0` to try it locally without touching the lock file |
| Click highlight and `spot()` both show | `show.actions` marks the action itself. Use `spot()` only for things you talk about without clicking (fields, results) |
| A live action times out or shows a raw error in the dry run (a `git fetch`, a remote call) | It is a real app limit: caption the feature instead of clicking it, and report the bug with file:line. Don't "warm" it by hand without checking the cost first (a fetch on a shallow clone, `.git/shallow`, downloads the whole history) |
| `pgrep -f` / `pkill -f` finds or kills your own shell (exit 144) | The pattern is in your own command line. Match on the process name: `ps -eo pid,comm,args \| awk '$2 ~ /python/ && /serve.py/'` |
| The screens show client or customer names (lists, logs, file names) | Settled in the request ("Who will see it"). For a public video, run a separate app instance that sees only demo data, or seed and filter; internal-only is the user's call |

## Pair with
These are Claude Code skills. On another agent use its equivalent, or skip the row.

| Stage | Skill |
|---|---|
| Storyboard and audience | superpowers:brainstorming |
| Caption and doc wording | technical-writer, design:ux-copy |
| Start the app and check it is up | run |
| One flow diagram for the doc | mermaid-diagrams |
| Overlay legibility, contrast | impeccable (audit), design:accessibility-review |
| Doc from steps.md + stills | anthropic-skills:docs (Word: docx) |
| Final check | superpowers:verification-before-completion |
| Polished release or marketing clip (camera zoom, intro/outro, under 60 s) | hyperframes (Apache-2.0, free). Feed it this skill's mp4. Don't use Remotion: it needs a paid license for companies with more than 3 people |

## Rules
- Keep demo scripts and outputs out of git unless the user asks. Don't commit videos, stills or `.auth.json`.
- Never record real credentials. Seeded demo users only. Read tokens from an untracked env file.
- Never point the script at production. Recording writes real records.
