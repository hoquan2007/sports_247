# SPORTS247 — Frontend Design Master v1.0

Updated: 2026-10-31
Scope: match schedule and live score application, existing Next.js App Router

## Product experience

A Vietnamese football fan opens SPORTS247 to answer three questions quickly: what matches are on today; what is happening now; which matches and competitions do I care about. The interface must make team names, actual match times, score changes, and a credible data status easy to read. One scroll should give access to the current results. Works without an account.

**Direction: Editorial Match Desk.** An editorial news desk treatment that gives the scoreboard an appropriate emphasis without turning a data-heavy app into a flashy landing page.

### Layout hierarchy

1. **Navigation**: compact horizontal wordmark, schedule / live / competitions / saved matches. A manual update action and Vietnamese clock on desktop.
2. **Score ticker**: dark ink ribbon with horizontally accessible live fixtures and results; each match opens the existing detail dialog.
3. **Page heading**: clear Vietnamese purpose, source-health and last-updated time.
4. **Date rail**: seven adjacent dates, arrows for earlier/later, return-to-today.
5. **Day summary**: one thin line of four real counts: all, live, upcoming, finished.
6. **Feature match**: real high-salience fixture from fetched data, football-pitch reference, crisp team marks and status/score.
7. **Match desk**: by-league list, status tabs, search, favorite toggles, accessible dialog.
8. **Competition rail**: league filter with real per-day counts, update cadence and legal/source information.
9. **Footer**: source/timezone context and brand.

### Tokens

| Role | Token | Hex |
| --- | --- | --- |
| canvas | --paper | #f6f7f2 |
| surface | --white | #fdfefa |
| primary copy | --ink | #192620 |
| secondary copy | --ink-soft | #526159 |
| brand dark | --forest-dark | #0c2a21 |
| action green | --forest | #173f31 |
| highlight | --lime | #d3ed9f |
| hairline | --line | #e6e9e2 |
| live only | --red | #d84b48 |

The type system uses system UI faces to remove font-loading shifts; display uses Segoe UI/Aptos Display, body uses Segoe UI/Aptos, and score numbers are tabular. Avoid gradient buttons, noisy uppercase labels, neon outlines, and stacked microcards.

### Component interaction

| Area | Behavior | Data |
| --- | --- | --- |
| Quick scores | Click -> match dialog | matches returned for selected date |
| Date navigation | Change day -> fetch, loading, errors | /api/matches?date=YYYY-MM-DD |
| Live/finished/upcoming | Filters exact backend status | FootballMatch.status |
| Competition rail | Filter selected league | LEAGUES and matches |
| Search | Search team name or competition | React local filter |
| Favorite star | Store match ID | localStorage sports247:favorites |
| Saved matches | Show favorite subset | same IDs |
| Refresh | On-demand fetch; background every 90s when visible | /api/matches |
| Details | Score, stadium, broadcaster, ESPN link | no unlicensed video feed |
| Data health | Last updated + partial-warning | MatchFeed.updatedAt, .partial, .errors |

**No invented match stats, broadcast streams, or placeholder logos.** If a provider logo fails, use the abbreviated team name. Preserve the official ESPN source link and broadcast territory caveat.

### Motion master

- GSAP + @gsap/react: once-per-mount initial reveal for section heading, score ticker, date controls and featured match; useGSAP with scoped root, duration 700ms, stagger 95ms, translate-y 16px, ease power2.out.
- CSS microinteraction: 180–200ms background and foreground response for nav, tabs, league rows and match rows; small button lift where appropriate.
- Progress bar: only when network load is running.
- Live presence: restrained opacity pulse; no fabricated score flip or endless decorative parallax.
- Respect prefers-reduced-motion in both JS and CSS.
- Three.js and scroll choreography skill packages are available for future storytelling sections; adding WebGL to a live result table would hurt clarity and mobile performance. No three.js runtime shipped.

### Responsive/accessibility

- Desktop >= 1240: 2-column main results + 294px league/source rail, dense but comfortable match rows, 7-day picker.
- Tablet 981–1239: simplify row broadcast column and compress spacing.
- Narrow tablet <= 980: results and competition panel stack, optional cards two-wide.
- Mobile <= 690: two-row header, horizontally scrolling result ticker, compact date picker, stacked match rows, one-column supplementary content.
- Very narrow <= 370: reduced label and date sizes.
- Every button/link has keyboard focus indication. Dialog closes on Escape and backdrop click; controls have labels. No horizontal page overflow; ticker is intentionally scrollable; on mobile show truncation instead of clipping team names.
- Team logos must use text fallback on image error. Functional content is visible without waiting for animation.

### Reference fit assessment

| Source | Examined concept | Applied or deferred |
| --- | --- | --- |
| Hallmark (Nutlope) | Token-first editorial design, purposeful copy, keyboard and motion quality | Applied; CSS tokens, no generic marketing hero, labels and controls refined |
| scroll-craft (nateherkai) | Scroll-focused narrative pacing | Deferred for this utility screen; long-scroll visual effects slow score lookup |
| threejs-skills (CloudAI-X) | WebGL scene and asset performance | Installed for future, not needed for live match tabulation |
| gsap-skills (greensock) | Scoped React animation | Applied via useGSAP |
| React Bits (reactbits.dev) | Count Up, Animated List, Fade Content | Took lightweight motion cues. Avoid counters that would imply scores changed when they did not; avoid heavy shader assets |
| Lucian UX/UI Prompt (lucianlabs.dev/uxui-prompt/) | Data tables, input states, alerts and transitions | Used patterns for clear control feedback, compact data structures, notices |

### Code ownership and verification

- Frontend owner: src/components/match-center.tsx
- Visual system: src/app/sports.css
- Existing API and league domain remain in src/app/api/matches and src/lib/football.
- Validation: npm run check (lint, typecheck, 2 date tests, production build); desktop and 390px/375px mobile review; check API refresh and favorites.
- Deploy target: Vercel with Next.js; no secret exposed to client by the redesign.

## Release checklist

1. Check actual viewport renders without horizontal overflow or invisible content.
2. Exercise date change, live status, league and search filters, favorite toggle, dialog open/close and manual refresh.
3. Re-run npm run check, verify server build compiles without environment errors.
4. Avoid deployment until all code checks and smoke tests pass.

### Verification record — 2026-10-31

- `npm run check`: ESLint, TypeScript, 2 date tests and Next.js production build passed.
- Production server `next start`: HTTP 200 and 31 actual match rows across 6 league groups at the moment of inspection; external sports data varies by date and provider.
- Chrome rendering: 1440px desktop and 390px/375px mobile; page scroll width did not exceed viewport width. The ticker intentionally scrolls horizontally inside its own container.
- Interactions: date navigation updated from 31/10 (31 rows) to 01/11 (28 rows); live tab selected; favorite toggle persisted to localStorage; match dialog opened and closed using Escape; searching an unknown team produced zero rows; Premier League filter yielded six rows.
- Chrome reported zero uncaught JavaScript runtime exceptions during this smoke run.
- QA screenshots are saved locally under `temp/screenshots/*-redesign.png` and are intentionally ignored by Git.
