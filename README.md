# claude-skills

Skills for [Claude Code](https://claude.com/claude-code) (and other agents that read `SKILL.md` skills) from work on
Frappe/ERPNext apps.

| Skill | Use it for |
|---|---|
| [`frappe-premium-dashboard`](skills/frappe-premium-dashboard) | A polished, animated dashboard inside a Frappe/ERPNext custom app, not a stock Workspace: the delivery route (Vue 3 with frappe-ui, a Desk page or a web page), a permission-checked and cached data layer, layout, design tokens, charts, and motion that respects reduced-motion. |
| [`recording-walkthrough-videos`](skills/recording-walkthrough-videos) | A captioned (optionally voiced) walkthrough video of a web app flow, scripted as a Playwright test so a broken flow fails the run: mp4 with chapters and a poster, subtitles, step-by-step stills and `steps.md` for setup docs, and share copy. Notes for Frappe desk and Vuetify apps. |
| [`making-product-promo-videos`](skills/making-product-promo-videos) | A 30-90 s promo film of the real product, built in HyperFrames from clean Playwright captures: the script approved first, crops and highlights from the page's real boxes, music picked and synced by measurement, every number from a recorded run, delivered with a poster, share copy and cutdowns. |
| [`frappe-upgrade-impact`](https://github.com/rajitjosh/bench-wizard/tree/main/bench_wizard/claude-plugin) | What a Frappe/ERPNext custom app must change for a new Frappe version, with a scanner for core APIs, overrides, fields and the known breaking changes. It lives in [Bench Wizard](https://github.com/rajitjosh/bench-wizard), which runs it from its Upgrade page; this marketplace lists it from there. |

## Install

In Claude Code:

```
/plugin marketplace add rajitjosh/claude-skills
/plugin install rajitjosh-skills@rajitjosh
/plugin install bench-wizard-frappe@rajitjosh
```

With the [`skills`](https://github.com/vercel-labs/skills) installer, for Claude Code, Codex, Cursor and others:

```
npx skills add rajitjosh/claude-skills
```

Or copy a folder from `skills/` into `~/.claude/skills/`.

## License

[MIT](LICENSE)
