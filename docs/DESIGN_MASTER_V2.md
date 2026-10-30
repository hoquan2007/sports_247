# SPORTS247 — Matchday Motion / Design Master v2

Date: 2026-10-31 · Owner: SPORTS247 · Delivery: Next.js 16 App Router on Vercel

## Creative direction and product contract

**Matchday after dark:** a premium broadcast control room with stadium floodlights, ink-green glass, tactile scores, signal-lime details and spacious hierarchy. The first viewport shows **actual featured fixtures with provider team crests**, their score or kickoff time, an automatically advancing match carousel, and a quick ticker. Minimal copy; football is the focal point. Motion communicates action and information rather than adding random decoration.

**Live means live data:** ESPN and OpenLigaDB schedule/score records stay the source of truth. Never fabricate a goal, score, minute, player, live video stream, league mark or available broadcaster. Show partial API failures and preserve an explicit ESPN detail link; do not embed unauthorized video.

## Implementation map and acceptance tests

| Zone / component | Visual specification | Motion + interactions | QA / evidence |
| --- | --- | --- | --- |
| Entrance `MatchdayIntro` | Full-viewport midnight stadium, spotlight haze, patterned 3D-looking ball, crowd light wall, small skip action | First tab visit per session: ball kicks toward lens, scales up then flashes open; 2s max; skip and replay via new session; reduced-motion skips; no sound | First-visit vs reload session behavior; skip works; reduced-motion no overlay; app operable after intro |
| Global header | Sports247 sharp wordmark, live counter, schedule/league/saved, refresh, GMT+7 | Precise control hover/focus feedback; selected route visibly different | 375/390/768/1440 sizing; keyboard focus and live filter |
| Quick scores ticker | Edge-to-edge broadcast rail with tiny official crests, score or kickoff, live state | Continuously loop the 8 most relevant fixtures (live first, prominent clubs next), share priority rules with the hero; pause on hover and focus; keyboard accessible static strip in reduced-motion | No inaccessible offscreen-only controls; opens correct dialog; no page overflow |
| Featured `MatchSpotlight` | Spacious stadium composition, large **actual** club crest, massive tabular score/kickoff, lawn markings, live/status chip | Auto-advances top 6 real fixtures 6s; prev/next/dots; pause hover/focus/hidden; content swaps with short GSAP fade; manual navigation never changes data | Multiple real fixtures rotate; buttons, pause, reduced-motion, empty state, touch; card above the fold |
| Date control | Compact seven-day segmented rail in Vietnamese; clear active day | Date fetch shows spinning ball and progress; previous/next/today buttons | API dates correct, loading state, no disabled stale data, mobile tap targets |
| Scores / standings shell | Dense curated league headers; 2 stacked team lines with bold crests; status and score align; clear red live accent | Score reacts visually only to actual feed change; row hover lift and keyboard focus | Names clipped correctly, score unchanged unless returned by API, filters/search/favorites preserved |
| `MatchdayMascot` | Original compact soccer-ball character with expressive eyes, cleats, scarf; fixed on field-facing corner | A composited CSS animation traverses a bounded path along the screen edge; hover pauses the walk and follows the pointer with its eyes; click to cheer; **goal event** detected from positive score delta in consecutive complete feed snapshots of same date (not initial load), pauses walking, celebrates and announces real team; reduced-motion static | No invented goals, no false events after partial response/date change, no shout on first load; announcement accessible; mobile non-blocking; pause on hidden tabs |
| Match detail | Real crests, original score, provider/venue/broadcast information, verified ESPN source link | Modal opens by row/ticker/spotlight, Escape, close action and backdrop, visual transitions | Focus usability, mobile viewport, no invented video playback |
| Side rail/footer | League filters, compact update pitch, provider caveat, status | Calm hover; fixed info remains legible | Accurate source labels, data partial state, links |

## Real-data integration / state invariants

`src/lib/football/{espn,types,leagues}.ts` and `/api/matches?date=` are authoritative. Keep `MatchFeed` shape. Poll every 90 seconds only when visible. On date switch, show prior day only if clearly loading; never compare previous day scoreboard to trigger goal event. For goal detection, compare stored `{homeScore,awayScore}` for same match ID in **successive successful responses**, only when both old and new are numerical, and only if value increased while match status is `live` or `finished`. On goal, show `team.name` and the new *actual* score. If data is missing/partial, keep last known matches without synthetic activity.

Mascot events are informational; interaction is optional and never blocks reading or scrolling. No autoplay audio, no fake social comments, no random goal confetti. A one-time cheer on pet click is clearly user-initiated and makes no claim about real match events.

## Motion budget

- GSAP React timeline scopes and cleanup for entrance and featured scene. Prefer `transform` and `opacity`, never animate layout metrics. CSS ticker uses transform only.
- Animate only a few foreground elements concurrently; card entrance 250–550ms, carousel 6s, intro <2s, mascot idle slow and low amplitude.
- `prefers-reduced-motion` removes intro, automatic advance, marquee and idle motion while retaining explicit navigation. Browser-hidden tabs pause automated advance.
- Assets: original SVG/CSS stadium and mascot. Remote club marks remain provider-hosted with initials fallback. Avoid heavy Three.js/WebGL bundle for match dashboard; GSAP already included.

## Visual tokens and hierarchy

Canvas `#071410`; panel `#0c211b`; elevated `#123127`; pale text `#f2f8e9`; secondary `#9ab4a6`; signal `#d5fa66`; live `#ff735e`; stroke `rgba(214,247,208,.12)`. Type: condensed / strong score numerals, comfortable system body, maximum two short label lines per module. Desktop 1360px centered content, 2-column result / competition rail; tablet stacked, mobile simplified header and full-width scoreboard. No marketing paragraphs in viewport 1.

## Gates for release

1. **Design QA:** review actual screenshots at 1440×900, 768×1024, 390×844, 375×812. Match screen shows ball, crests, large fixture and real data; fixed mascot does not cover essential controls; no horizontal viewport overflow.
2. **Functional QA:** date change, live/finished filters, search, favorites localStorage, detail dialog and refresh. Carousel nav, hover pause, no-goal invariant and skip intro. Simulate two successive fixtures with a controlled test state for goal calculation only, never fake production goals.
3. **Quality QA:** `npm run lint`, `npm run typecheck`, `npm run test`, production build, Hallmark CSS sloplint. Watch console/hydration/runtime errors and reduced-motion.
4. **Delivery QA:** stage intended sources without local skills/environment, commit feature branch, push `origin/codex/immersive-matchday`, deploy Vercel and verify production URL. Distinguish preview from production and record any auth or sandbox limitation truthfully.

## Resource assessment

- Hallmark: token-first design discipline, focus/reduced-motion/a11y. Used directly.
- GSAP React: scoped, cleaned timeline on intro and featured transitions. Used directly.
- scroll-craft: narrative scroll sequencing is unnecessary for a live score utility; cherry-pick pacing and reveal, without scroll jacking.
- CloudAI-X threejs-skills: no runtime Three dependency added because animated SVG/CSS makes the 3D-effect ball readable and inexpensive on mobile.
- React Bits: marquee/reveal inspiration; authored native components to avoid unneeded dependencies.
- Lucian Labs UX/UI: contrast, data density, button targets, loading/empty/error states inform implementation.
