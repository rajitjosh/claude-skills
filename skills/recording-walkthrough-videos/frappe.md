# Frappe / ERPNext desk: walkthrough notes

Checked against Frappe 16.52 (`frappe/public/js/frappe/dom.js`, `request.js`, `desk.js`).

## Log in once, outside the video
```ts
// login.setup.ts: run once, or before the demo
const api = await request.newContext({ baseURL: process.env.DEMO_BASE_URL });
await api.post("/api/method/login", { data: { usr: process.env.DEMO_USR, pwd: process.env.DEMO_PWD } });
await api.storageState({ path: "out/.auth.json" });
```
`DEMO_USR` / `DEMO_PWD` come from an untracked env file and belong to a seeded demo user. Then `test.use({ storageState: "out/.auth.json" })` in the demo.

## Before each caption: wait for the desk to settle
```ts
const app = demo.app; // the page, or the app's frame in the panel layout
await expect(app.locator("#freeze")).toHaveCount(0);                        // frappe.dom.freeze() overlay
await app.waitForFunction(() => (window as any).frappe?.request?.ajax_count === 0); // no pending calls
```

## Before `demo.begin()`: clear boot prompts
A few seconds after boot, desk shows at most one prompt at a time (new-navigation prompt, "Updated To A New Version" change log, update available). They aren't part of any flow.
- Mark the change log seen for the demo user once: `frappe.call("frappe.utils.change_log.update_last_known_versions")` from the seeding step.
- Otherwise open desk during seeding, wait, and close what's open: `while (await demo.app.locator(".modal.show").count()) await page.keyboard.press("Escape");`

Never auto-dismiss a `msgprint` or validation dialog that the flow itself produces. That dialog is the step: caption it.

## Locators and gotchas
| Problem | Fix |
|---|---|
| Fields by CSS class break between versions | Use `[data-fieldname="<field>"]` |
| Field not in view, or a hidden empty read-only field | `cur_frm.scroll_to_field(f)`. Empty read-only fields don't render, so caption them instead |
| v16 desk locators fail | Form title is in the breadcrumb, not `.title-text`. Checkboxes: `input[data-fieldtype=Check]`. Link dropdown items are `getByRole("option")`. Read-only fields have no input: assert on `cur_frm.doc`. Open collapsed sections first. Tab out of the last grid cell adds an empty row. Scroll a group of fields to mid-screen, or the sticky tab bar covers the neighbours |
| Seeding a record emails someone (PINs, invites, welcome mails) | Insert it without hooks (`frappe.get_doc(...).db_insert()` in `bench console`), then update it over REST |
| Every save hangs with "Lock wait timeout" after one server error | The dev server's stdout lost its reader (the `bench start` terminal closed), so error printing crashes before rollback and the lock stays held. Before recording, check that a live `honcho` holds `bench serve`'s stdout pipe. If it doesn't, stop the leftover bench processes and run `bench start` again in a terminal that stays open |
| Print opens a new tab | See the popup row in SKILL.md |
| The first desk load after `bench start` shows "Loading..." cards for about 30 s | Caption the step as soon as the desk appears; waiting for every card films a silent stretch |
| v16: a new site opens the Setup Wizard, not the desk ("Let's give your business a home", the greeting cycles languages) | `.splash` checks pass before it is drawn. Wait for `getByRole("button", { name: /Get Started/ })` (or the desk sidebar), then for `bench watch`'s "Compiled successfully" toast to go (about 5 s) |
| v16: after a setup or restore, Start or "is it running" checks say the bench is running when it is not | A stray `flow serve` process from the bench's `env` (not in the Procfile) stays behind. Stop it off camera: `pkill -f "<bench>/env/bin/flow serve"` (match the full path, see the pkill row in SKILL.md) |
