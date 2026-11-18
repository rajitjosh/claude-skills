---
name: "frappe-premium-dashboard"
description: "Build polished, animated, product-grade dashboards (Voyage-style: gradient hero, rolling digit KPIs, card grid, custom charts) inside a Frappe/ERPNext custom app."
---

# Premium dashboards in Frappe/ERPNext

Use when the user wants a dashboard that looks and moves like a modern SaaS product, not a stock ERPNext Workspace. Standard Workspaces, Number Cards and Dashboard Charts cannot produce this; build a custom page in a custom app.

## 1. Pick the delivery route (ask if unclear)

| Route | When | How |
|---|---|---|
| A. Vue 3 SPA with frappe-ui (default) | Full-screen app feel, tabs, rich interaction and motion | frappe-ui / doppio scaffold, served at `/<app>-dashboard`, Vite build into `public/` |
| B. Desk Page | Must live inside /app with the navbar | `Page` doctype in the custom app, mount a Vue app into `page.main` |
| C. Web page (www/) | Read-only, shareable to portal users | `www/dashboard.html` + `.py` context, Jinja + JS |

Never edit core ERPNext/Frappe files. Everything lives in the custom app.

## 2. Data layer (backend first)

- One whitelisted method per card: `@frappe.whitelist() def get_revenue_by_month(from_date, to_date, filters=None)`.
- Aggregate with `frappe.qb` (or parameterised `frappe.db.sql`); never loop docs in Python.
- Enforce permissions: `frappe.has_permission(doctype, throw=True)` / user permission filters; no `ignore_permissions` unless justified.
- Cache heavy queries: `frappe.cache().get_value(key, generator, expires_in_sec=300)`; key includes filters + user.
- Return chart-ready shapes: `{labels: [], datasets: [{name, values}]}`; KPIs as `{value, delta_pct, caption}`.
- One shared filter object (date range, company, branch...) passed to every method.
- Live updates: `frappe.publish_realtime('dashboard_update', payload)` from doc hooks, or polling every 30-60s.

## 3. Layout anatomy (the Voyage pattern)

1. **Top bar**: logo, pill tab group (active tab = filled dark-green pill), clock/location chip, bell, avatar + role.
2. **Hero strip** on a soft gradient (mint to peach):
   - small context line (date, company/branch)
   - **headline sentence generated from data** ("October is on track for a record month") + one-line subtext
   - 3 KPI tiles rendered as **digit boxes** (each digit in its own rounded box), label above, caption below.
3. **Filter bar**: one white rounded bar with segmented fields and a dark pill Search button; show result count.
4. **Card grid** (12-col, gap 16px): 8/4 split rows; one **dark accent card** (deep teal) per screen.
5. Reusable card types:
   - Line/area trend with shaded forecast zone and dashed last-year series
   - Ranked horizontal bar list (label, sub-label, bar, value, delta%)
   - Sparkline metric list (value, delta chip, mini line)
   - Gauge/donut with legend percentages
   - Heatmap grid (rows = entities, cols = days)
   - Illustration cards with progress bar
   - Table with avatars and status chips; row click opens a detail panel
   - Detail panel (boarding-pass style: big codes, key/value grid, primary action)
   - Optional canvas globe/map hero card

## 4. Design tokens

```css
:root{
 --bg:#f6f8f7; --card:#fff; --ink:#0f1f1c; --muted:#6b7a76;
 --brand:#0f5c4d; --brand-2:#1f8a70; --brand-soft:#e3f3ee;
 --accent:#f2b84b; --up:#1f8a70; --down:#e5675a;
 --hero-grad:linear-gradient(100deg,#e6f5ef 0%,#f7f3ea 60%,#fde6d8 100%);
 --radius-card:18px; --radius-pill:999px;
 --shadow:0 1px 2px rgba(16,40,35,.04),0 8px 24px rgba(16,40,35,.06);
 --ease-out:cubic-bezier(.2,.8,.2,1);
 --dur-fast:200ms; --dur-med:450ms; --dur-slow:900ms;
}
```

Rules: one font (Inter/Geist), `font-variant-numeric: tabular-nums` on all figures, 11-12px muted labels, 24-32px semibold numbers, small coloured delta chips, generous whitespace, shadow + hairline instead of heavy borders. Dark mode = swap token set.

## 5. Charts

- Prefer **ECharts** (vue-echarts) or Chart.js; Frappe Charts only for simple cases.
- Smooth lines, light dashed y-grid only, hidden axis lines, custom tooltip card.
- Globe: `cobe` or custom canvas.

## 6. Motion

Principles: animate only `transform` and `opacity`; 200-900ms; ease-out curves; animate on first load and on data change, never on idle loops (globe excepted); every effect must be disabled under `prefers-reduced-motion`.

Libraries: CSS + Vue `<Transition>/<TransitionGroup>` first; **motion-v** or `@vueuse/motion` for springs/gestures; GSAP only for complex timelines.

| Effect | Implementation |
|---|---|
| Rolling KPI digits | Each digit box holds a 0-9 vertical strip; `transform: translateY(-d*10%)` with `transition: transform var(--dur-slow) var(--ease-out)`; delay 40ms per digit index. Non-digits (`.`, `%`, `M`) render static. Re-roll only when value changes. |
| Count-up numbers | rAF tween from previous to new value with easeOutCubic, formatted each frame. |
| Chart draw-in | ECharts `animationDuration:1200`, `animationEasing:'cubicOut'`, bars `animationDelay: i => i*60`, `animationDurationUpdate:600` for filter changes. |
| Gauge sweep | ECharts gauge with `animation:true`, start from 0. |
| Staggered card entrance | `<TransitionGroup appear>`: from `opacity:0; translateY(12px)` to rest, `transition-delay: calc(var(--i)*60ms)`. |
| Tab switch | Active pill as an absolutely positioned indicator that transitions `transform`/`width`; content uses `<Transition mode="out-in">` crossfade + 8px slide. |
| Ranked bars / progress | Width via `transform: scaleX()` with `transform-origin:left`, staggered. |
| Heatmap | Cells fade in by column with small stagger; colour transitions on data change. |
| Hover / select | Cards `translateY(-2px)` + stronger shadow; table row highlight; detail panel slides in from right. |
| Globe | rAF loop with frame-rate-independent damping: `spin += (target - spin) * (1 - Math.exp(-dt * k))`; pause auto-spin on drag, ease back after; arcs animate via dash-offset. |
| Skeletons | Shimmer gradient on placeholders until resources resolve. |

Reduced motion:
```css
@media (prefers-reduced-motion: reduce){
 *{animation:none!important;transition:none!important}
}
```
In JS, check `matchMedia('(prefers-reduced-motion: reduce)')` and skip rAF tweens / set ECharts `animation:false`.

Performance: pause rAF when tab hidden (`document.visibilityState`), use `will-change` sparingly, keep the globe to one canvas, debounce re-renders on filter changes.

## 7. Build steps

1. Confirm route (A/B/C), doctypes, and 4-8 metrics per tab with the user.
2. Write whitelisted API methods + permission checks; test with `bench execute`.
3. Scaffold UI, add tokens, build reusable components first: `KpiDigits` (rolling), `ChartCard`, `RankedBars`, `SparkList`, `Heatmap`, `FilterBar`, `PillTabs`, `DetailPanel`, `Skeleton`.
4. Wire each tab with frappe-ui `createResource` (or `frappe.call`) and shared filter state; subscribe to realtime events where useful.
5. Generate headline sentences server-side (compare to last period, pick top mover).
6. Layer motion last, per section 6; verify reduced-motion path.
7. Loading skeletons, empty states, error toasts.
8. `bench build --app <app>`; check desktop + 375px width, check as a restricted user, check animations at 60fps in DevTools Performance.

## 8. Deliverables

- File tree of changes in the custom app
- API module, Vue components / page JS, CSS tokens
- hooks.py entries (`website_route_rules` for SPA route) and fixtures
- Short README: route URL, roles with access, how to add a card, how to tune motion tokens