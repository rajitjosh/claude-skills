# Walkthrough video request

Plain instructions for any agent (Claude Code, Codex, Gemini CLI, or a model with this file pasted in).
Part 1 is what the user fills in. Part 2 is how the agent completes it before any recording.

## Part 1: the request (offer this to the user as the suggested prompt)

```
Walkthrough video: <feature or flow>
Who will see it: <internal only | public>
Code: <branch, PR, or "what is deployed">
Site: <dev or staging URL, never production>
Login: <seeded demo user from an untracked env file, or "use out/.auth.json">
Audience: <functional team | end users | release notes>
Flows: <1 to 5 flows, one per line>
Leave out: <known broken or out of scope>
Layout: <overlay | panel | you pick>
Pace: <brisk | normal | relaxed>
Voiceover: <no | yes, voice af_heart>
Extras: <none | Word doc from the steps | GIF of a step | .srt subtitles>
```

The user can fill all of it, part of it, or just write a sentence ("make a video of how HR raises OT on staging").
The agent fills in the rest using Part 2.

## Part 2: for the agent

### 1. Fill from what you already have
Read the user's message, any linked PR or issue, and the repo. Fill every field you can.
Never ask about something the user already said. Only ask for what is missing.

### 2. Ask for the missing facts. Never guess them.
| Field | Why it can't be guessed |
|---|---|
| Walkthrough video (feature or flow) | It decides the whole storyboard |
| Site | The recording writes real records. **Refuse a production URL** and ask for dev or staging |
| Login | Use only a seeded demo user. Never put real credentials in the chat, the script or the video |
| Who will see it (internal or public) | Lists, logs, backups and file names on screen show real client or customer names. A public video needs a demo instance or seeded data that shows only safe records |

Code and Leave out are optional. If they're missing, use "what is deployed" and "nothing", and say so in the completed request. Don't ask for them.

### 3. Offer every choice the user didn't make, in ONE message
Recommend an option based on the audience, mark it, and let the user answer with short codes.
If your agent has a tool for structured questions (for example AskUserQuestion in Claude Code), use it. Otherwise send a plain message.

| Choice | Options | Recommend | Becomes |
|---|---|---|---|
| Audience | functional team · end users · release notes | functional team | Caption wording (SKILL.md, Caption copy) |
| Layout | **overlay**: full-screen app, caption box placed automatically (bottom, above toolbars; top when it would cover the field being discussed) · **panel**: 1920×1080 video, the app at full size (1360×850) on the right, text in a column on the left, never covering the app | overlay for functional teams, setup docs and wide screens (lists, reports, POS); panel for end users, onboarding and release notes on form- or dialog-sized screens | `DEMO_LAYOUT=panel` (overlay is the default) |
| Pace | brisk (people who know the app) · normal · relaxed (first-time users, non-native readers) | normal; relaxed for end users | `DEMO_PACE=0.7` / `1` / `1.4` |
| Voiceover | no · yes | no for functional teams (watched muted next to the doc); yes for end users | `DEMO_VOICE=af_heart` |
| Voice | af_heart (US female, the default) · am_michael (US male) · bf_emma (UK female) | af_heart | `DEMO_VOICE=<voice>`. English only |
| Extras | none · Word doc from `steps.md` · GIF of one step · `.srt` | none | See SKILL.md (Recipe step 8, Gotchas) |

Message to send (adapt it to what is still open):

```
Before I write the storyboard, a few choices. ★ = my recommendation for <audience>.
1. Layout: a) overlay ★, caption box over the full-screen app, placed automatically
           b) panel, app at full size beside a text column (1920×1080)
2. Pace:   a) brisk  b) normal ★  c) relaxed
3. Voiceover: a) no ★  b) yes, af_heart (US female)  c) yes, am_michael (US male)  d) yes, bf_emma (UK female)
4. Extras: a) none ★  b) Word doc  c) GIF of a step  d) .srt
Reply like "1a 2b 3a 4a", or "your picks".
```
"Your picks" (or no answer to a choice) means use the ★ options. Say which ones you used.

### 4. Confirm, then follow the skill
Show the completed request as the header of the storyboard (`storyboard-template.md`) and wait for a yes.
Then follow the Recipe in `SKILL.md`. Put the user's choices on the command line:

```bash
DEMO_LAYOUT=<overlay|panel> DEMO_PACE=<0.7|1|1.4> [DEMO_VOICE=<voice>] npx playwright test -c <dir>/demo.config.ts
```

## A filled example

```
Walkthrough video: OT calculation on Payroll Entry
Code: PR #412
Site: https://staging.example.com
Login: use out/.auth.json (demo user hr.demo)
Audience: end users
Flows: open OT Calculation for one employee; update the hours; create salary slips
Leave out: bulk OT import (not merged)
Layout: panel
Pace: relaxed
Voiceover: yes, voice af_heart
Extras: Word doc from the steps
```
