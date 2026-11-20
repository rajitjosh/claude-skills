---
name: making-product-promo-videos
description: Use when asked for a promotional, launch, marketing, teaser, social or "sizzle" video of a web app or SaaS product built from its real screens, or when a product promo "doesn't give a clear idea", feels like slides, or shows the UI too small or too fast. Applies to any app Playwright can drive.
---

# Making product promo videos

## Overview
A 30-60 s film of the real product, built in HyperFrames from clean Playwright captures. **The script is the contract**: words, order and seconds are approved before anything is built. Every picture is the real UI and every number comes from a recorded run.

**REQUIRED:** load HyperFrames' `hyperframes` skill before building (contract, check, review, render), and `media-use` for music. Claude Code names them `hyperframes:hyperframes` and `hyperframes:media-use`. Not installed? Claude Code: the HyperFrames plugin. Gemini CLI: `gemini extensions install https://github.com/heygen-com/hyperframes`. Codex and other agents: `npx hyperframes skills update`. For step-by-step how-to videos with captions, use `recording-walkthrough-videos` instead.

## How the user asks
```
Make a <30-60>-second promo video of <product> from its real screens.
App runs at <URL>. Audience: <who>. End card link: <link>.
```
Before capturing: the app is running and healthy, Node >= 22 (`nvm use 24`), Playwright >= 1.65, system ffmpeg, `npx hyperframes auth login`, and the `heygen` CLI for music.

## Files in this skill
| File | Use |
|---|---|
| `capture-kit.ts` | `Clip` (start / click / type / shot / stop), `installInputLog`, `unionBox`. Clean clip + `clip.events.json` (click times and boxes, to sync a drawn cursor; per shot, the real boxes you name) + 2x PNGs per beat |
| `kit-selftest.capture.ts` | Self-test for the kit. Run it after editing `capture-kit.ts` (copy the kit, config and this file into a folder with `@playwright/test` >= 1.65) |
| `capture.config.ts` | 1920x1080, deviceScaleFactor 2, no Playwright video or cursor. `PROMO_THEME=dark`, `PROMO_OUT=<dir>` |
| `script-template.md` | SCRIPT.md skeleton: time, picture, on-screen text, optional voiceover, facts used |

## Recipe
Each step ends with its gate: don't start the next step until it holds.

0. **Read the project first.** The README and docs (what it is, the flow worth showing: entry → key action → result), the run logs or history (the real numbers available), the app's own colour and font tokens (`:root` variables, the font files) and its icon file, and who will see the film (internal or public).
   *Gate:* a header in SCRIPT.md answers: what it is · the flow · numbers on hand with their source · palette and fonts · the icon file · audience.
1. **Three storylines, user picks one** (hyperframes `references/story.md`). Recommend a situation the viewer knows, e.g. "evening rush, drawer balances to ₹0.00".
   *Gate:* the user picked one (a mix of two counts as one).
2. **Write SCRIPT.md from the template and get it approved** before capturing or building. Ask once: voiceover or music + on-screen text (default: text, most promos play muted).
   Numbers in the script are placeholders until the capture: a first install and a cached rerun can differ several times over. After capture, put the recorded numbers in SCRIPT.md and tell the user what changed before building.
   *Gate:* the user approved SCRIPT.md.
3. **Capture** with the kit into `<project>/capture/<beat>/`. Every still the film holds on is `shot(state, { crop: <the component>, ring: <the result value> })`: the build reads crops and rings from `clip.events.json`, never from a thumbnail. Take result screens (finished runs, tables) while they are on screen during the live run; reopening them later may show a different page. Seed demo data with clean display names and codes (no "test" or "WT" text anywhere on screen). Record a dark-mode set too (`PROMO_THEME=dark`) if the app has one: a time-of-day change is a good reason to switch.
   *Gate:* every held still has its `crop` and `ring` boxes; SCRIPT.md carries the recorded numbers.
4. **Music**: `hyperframes auth login`, plus the `heygen` CLI installed (Node >= 22). `media-use resolve --type bgm`, or list candidates: `heygen audio sounds list --query "<feel, tempo>" --min-score 0.6 --limit 30` and keep tracks at least as long as the film. Measure each before picking: `hyperframes beats` (a 5-6 s feature beat should be 2-3 whole bars) and `hyperframes audio --json` (envelope: a lift near the reveal, the peak in the payoff window, `tailEnd` after the end card).
   Pick where the track starts, not only which track: the start offset (`data-media-start` on the music) that puts its strongest hits on the reveal and the payoff, entering on a bar line with a short fade-in.
   Sync tolerances: a reveal may move toward a strong hit by at most ±0.15 s, an entrance toward a beat by ±0.10 s; lock 1-3 hits per minute of film. The music biases the timing, the story sets it. When one offset can't serve both, the payoff gets the hit and the reveal lands on a bar line; if neither can, try another offset or track, never move the story.
   *Gate:* SPEC.md names the track, its start offset, bpm and bar length, and the locked hits with their times.
5. **Sound effects**: resolve each with `media-use resolve --type sfx` and measure it (`hyperframes audio --json`: duration, peak time, true peak). Prefer short, warm, transient effects for a polished film; keep sustained bright ones (glassy rings, long shimmers) for one isolated moment. Typed text (a terminal, a search box) gets key ticks: resolve 3+ single-keypress takes and rotate them line by line, one tick as each line appears; skip a tick that would land within 0.15 s of the last.
   *Gate:* every effect has a cause on screen, and its peak lands one frame after its picture.
6. **Build** the home stage (below). Sequential text never snaps to every beat: at 110+ bpm that is 0.5 s apart, too fast to read. Snap each line to every other beat, or bring the lines in fast and then hold the whole set.
   *Gate:* `check` passes; `snapshot --review` and REVIEW.md are done.
7. **Verify**: a 1 fps contact sheet of the whole render. Every frame must name its feature, and no held frame may be half-done. `hyperframes audio <mp4> --json`. Say "measured, not heard".
   *Gate:* the user approved the preview; the render's audio is measured.
8. **Deliver** into a dated folder (`renders/<name>-YYYY-MM-DD-HHmm/`) so a new render never overwrites one already shared:
   - **Poster as frame 0.** Pick the strongest settled frame (the payoff or the end card, fully landed) and bake it in; chat and social apps thumbnail frame 0 and ignore cover-art metadata. Same length and audio:
     ```bash
     ffmpeg -y -ss <t> -i film.mp4 -frames:v 1 -q:v 2 film.jpg
     ffmpeg -y -i film.mp4 -i film.jpg -filter_complex "[0:v][1:v]overlay=0:0:enable='eq(n,0)'[v]" \
       -map "[v]" -map "0:a?" -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a copy -movflags +faststart film.poster.mp4 \
       && mv film.poster.mp4 film.mp4
     ```
     Check: the frame count is unchanged and frame 0 matches `film.jpg`.
   - **`share-copy.md`**: a chat post (title line, 2-4 bullets from SCRIPT.md, the real numbers, links) and an email version for groups and lists (subject line, plain headings, no `*asterisks*`). Product's own words; nothing the film doesn't show.
   - **Cutdowns** when the film is for social: one 15-20 s vertical (1080x1920) or square (1080x1080) film per beat, from the same captures and boxes. The label goes above the component, and text stays inside the middle 70% of the height (platform UI covers the top and bottom). Each cutdown gets its own poster baked in, and sits in the same dated folder.
   *Gate:* the delivery folder holds the mp4 with its poster, `film.jpg`, `share-copy.md`, and each cutdown made, with its own poster.

## The home stage (what makes it clear)
| Part | Rule |
|---|---|
| Label column | Left ~34%: title 64-76 px, result line 34 px, revealed when the result shows. Titles change in place (blur swap), never fly around |
| UI panel | Right ~60%: crop to the one component the beat is about (cart, payment panel, dialog) with its own header in frame. Never a loose grid of fields, never the whole window shrunk |
| Hold | Play the real clip for the action, then hold 1-1.5 s on the 2x PNG of the finished state |
| Push-in | The panel's frame stays put; zoom only what is inside it (an inner wrapper, `overflow: hidden` on the frame) toward the ring, and only when nothing the viewer needs leaves the frame. Reading shots (tables, run screens) hold still with `data-hold`: that is the answer to `check`'s `dead_stretch` warning on them, not added motion |
| Result ring | 3 px accent outline on the one result value, at least 28 px on screen. The only accent in the shot. Placed from the shot's recorded `ring` box |
| Pace | 5-6 s per feature. 2.5 s per feature reads as noise |
| Reveal | The product name is a hero line (about 7% of frame height) once, then settles into the label column |
| Payoff | The real number grows from its field to fill the frame on a colour flood, with the one impact sound |

## Gotchas (all hit in real runs)
| Problem | Fix |
|---|---|
| Viewers "don't get it" | No labels and loose field crops. Add the label column and crop to whole components |
| Screencast is blurry when pushed in | It records 1x even at deviceScaleFactor 2. Use the 2x PNGs for every hold and push |
| Held frame shows a half-typed or wrong value | Clips pass through transient states (half-typed cash, partial counts). Start the clip after them, hold only on `shot()` PNGs |
| App bug visible on screen | Crop it out, never fake around it. Report it with file:line |
| Logo renders as a grey box | Some PNG icons have a checkerboard painted in. Check alpha; use another brand file, never redraw |
| Music too short | Loop a beat-aligned section with a 60 ms crossfade. Put the seam BEFORE the track's tail (`hyperframes audio` "tailEnd"), then run `silencedetect` on the result |
| `media-use resolve` says heygen not found | Sign-in alone is not enough: the user installs the CLI from developers.heygen.com/cli |
| `npx hyperframes` fails | Node 18 default. `nvm use 24` |
| Claude Code: `! command` typed in the VS Code panel does nothing | It arrives as chat. Ask the user to run it in a terminal |
| Every save hangs mid-capture (Frappe) | The dev server lost its stdout reader. See `recording-walkthrough-videos/frappe.md` |
| Same whoosh on every cut | The bundled whoosh files are identical. Use one whoosh per act change, not per cut |
| Ring misses its target, crop cuts the component | It was placed by eye. Use `shot()` boxes. For a state you can no longer reach, measure the PNG's pixels (a red outline, a highlight colour) |
| The clip scrolls away mid-action | A click that re-renders the page can reset its scroll. Check the clip's frames at the crop before using it; otherwise use the before and after stills taken at the same scroll |
| One beat's off-camera teardown breaks the next beat (a bench stopped, a port changed) | Keep setup and teardown out of the beats and make them repeatable: re-shooting one beat must not undo another's state |
| `pgrep -f` / `pkill -f` kills your own shell (exit 144) | The pattern is in your own command line. Match on the process name: `ps -eo pid,comm,args \| awk '$2 ~ /python/ && /serve.py/'` |

## Rules
- Real screens only: no invented UI, labels or numbers. Draw only what has no source (a clock, a queue tag).
- People's data on screen (contacts, customers, messages, records) is obviously placeholder data, seeded for the film; never real rows. For a public film, also no client or customer names in lists, logs or file names.
- The capture writes real records. Never point it at production. Ask before creating data outside the agreed demo records.
- Keep capture scripts, footage and renders out of git.
- No "seamless", "effortless", "in seconds" or other claims the recording doesn't show.
- Clean up the demo data you created (sites, benches, databases, list entries) as agreed with the user, look at each target before deleting it, and list what was removed.
