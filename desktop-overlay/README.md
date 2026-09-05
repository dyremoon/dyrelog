# Dyrelog desktop overlay (Electron scaffold)

The always-on-top mini-mode meter from the art reference saved in the
project root README ("Overlay art direction (mini mode reference)"). Past
the first scaffold now — mini mode, manual resize, and three popup
windows (Settings, Combat Analysis, Leaderboards) are all live. Login and
the real Submit POST are still not wired up — see "What's not done yet"
below.

## Running it

```
cd desktop-overlay
npm install
npm start
```

`npm start` syncs `eqp-core.js` in from `../overlay/eqp-core.js` first
(see `scripts/sync-eqp-core.js`) — never hand-edit
`desktop-overlay/renderer/eqp-core.js` directly, it's generated output and
gets overwritten on every launch. This is deliberate: the project already
got burned once by a hand-maintained third copy of this file silently
forking inside `dyrelog-overlay.html` (see the root README's "Layout"
section). There are still only two *source* copies —
`overlay/eqp-core.js` and `worker/src/eqp-core.js` — this is just a build
artifact of the first one.

## What already works

- Pick a single `eqlog_*.txt`, or point it at your whole `Logs` folder and
  let it find the file(s) itself (same idea as the browser overlay's
  "Pick Logs folder…", implemented here with plain Node `fs` instead of
  the File System Access API — see the big comment at the top of
  `main.js` for why that's simpler in Electron than in a browser).
- Remembers the log path across restarts with zero clicks, ever — a JSON
  file in Electron's userData folder, no browser permission handshake to
  work around at all.
- Live tailing starts from the log file's current end-of-file size, never
  byte 0 — a log with years of history behind it (level 1 to today) is
  never read at all, by design, so there's no startup cost or ongoing
  performance concern tied to how large the file has grown; see
  `tailState`/`startTailing()` in `main.js`.
- Live tailing, mob identity locking (boss-vs-add), pet-damage folding,
  the last-spell-caster heuristic for anonymous DoT ticks, and automatic
  difficulty detection from the log's own zone-in line — all of it, for
  free, because it's the same unmodified `eqp-core.js` the browser overlay
  and the worker use.
- The mini-mode card UI itself: header row with status dot, the log's own
  character name as the wordmark (instead of a generic "Dyrelog" label —
  see `parseCharacterFromFilename()`), and icon buttons for Settings,
  Combat Analysis, Leaderboards, changing the log source, and Mini mode;
  live-fight subheader with the accent DPS number and a running fight
  timer (mm:ss, next to the DPS number — see `#fight-timer` in `app.js`);
  ranked bar list in the six fixed rank hues; post-fight state with a
  Submit pill and the tri-state auto-submit toggle row (shown once, on
  first run only — see below). No scrollbar shows in the card even when
  its content briefly overflows (resize, an OS zoom-level change) — it's
  still scrollable, just without a visible thumb (see `.fight-view` in
  `style.css`). The "waiting for a fight" icon only spins during an
  actual live encounter — it sits still the rest of the time
  (`.fight-icon.pulse`, toggled in `render()`), instead of spinning
  constantly.
- **Mini mode.** The window-icon toggles a compact layout: a slim top strip
  (your own character's name — never the current mob's — plus your dps,
  and a restore button) with the SAME ranked bar list standard mode shows
  underneath it; only the mob-name/timer subheader and the submit UI go
  away. It's a pure CSS-class toggle now, not a forced window resize — the
  window stays whatever size you left it at, and manual resizing (see
  below) keeps working normally while mini, same as standard mode.
- **Proportional DPS bars.** Each bar's *width*, not just its number,
  reflects relative DPS — scaled against whichever row currently leads,
  so the gap between top and bottom parses at a glance. Widths glide
  (`transition: width`) as DPS shifts second to second instead of
  snapping, and each bar's own tint is a `::before`/`.fill` layered under
  the text so it fades along with the panel background slider below
  rather than staying solid — see `renderBarList()` in `app.js`.
- **A real Settings window** (gear icon) — its own popup, not an in-card
  panel: a background-opacity slider, window size, and text size sliders;
  a Midnight Blue / EQ Brass theme swatch pair; an optional "color my bar
  by class" override (a manual class picker — the log can't tell us a
  player's class); and the same auto-submit tri-state toggle as the
  first-run row. Opacity now runs the full 0–1 range and only ever fades
  the panel's *background* (a `--panel-alpha` CSS variable driving a
  `.card::before` layer) — text, bars, and the icon row stay fully
  legible and clickable all the way down to a fully transparent panel, so
  the overlay can float directly over the game with nothing but text and
  bars showing. Every control applies itself immediately (`save-settings`
  on every change) — there's nothing to "Done" or commit, so the window
  just closes like any other. Changes reach the mini-mode card live over
  IPC even though it no longer owns any settings controls itself (see
  `onSettingsUpdate()` in `app.js` and the `settings-update` broadcast in
  `main.js`).
- **No Submit button at all when Always auto-submit is chosen** — the
  first-run toggle row also only ever shows once; after you pick, Settings
  is the only place to change it (`settings.autoSubmitChosen`). In "ask
  first" mode the row now just reads "Submit to leaderboard?" instead of
  a jargon-y auto-submit status line. That Submit button itself is still
  disabled either way — see "What's not done yet" below, that part hasn't
  changed, only the wording around it.
- **A Combat Analysis window** (its own frameless-free popup) — every
  encounter this session, current fight included, with a summary table
  (damage/dps/%/hits/crits, plus a self-vs-pet damage split) and, below
  it, a full **per-combatant deep dive**: click any combatant to expand
  their own spell/ability breakdown — damage, DPS, %, hits, and crits per
  named spell or "Melee," each with its own little relative bar chart —
  plus a nested card per pet with its *own* separate breakdown rather
  than folding pet damage into the owner's. This is powered by a new
  `abilities`/`pets[*].abilities` breakdown that `computeStats()` in
  `eqp-core.js` now returns on every row (see `abilityName()`/
  `tallyAbility()`/`abilitiesArray()`), so it needed no new parsing in the
  renderer itself. It's a spell-level aggregate, not a literal swing-by-
  swing combat log or a DPS-over-time graph — EQ's own log doesn't carry
  enough to reconstruct either of those reliably, so aggregated-by-ability
  was the honest scope here. A header button opens the full website too,
  same as Leaderboards below. There's also a **Healing** table above the
  deep dive whenever any heal lines showed up in this encounter (who
  healed how much, HPS, hits) — `eqp-core.js` was already parsing heal
  lines but never tallying them; see the "heal" branch in `ingest()` and
  `healersArray()`/`computeStats()`'s new `healing` field. Click your own
  name on any bar in the main mini-mode card to jump straight here on
  that same fight (click any row now, not just your own — see
  `data-open-analysis` in `renderBarList()`).
- **Combat Analysis now groups a continuous pull into one "fight," not one
  entry per mob.** Killing several distinct (even identically-named) adds
  back-to-back inside the same continuous combat sequence used to show up
  as separate Analysis entries, or in the worst case (several same-named
  kills close together) silently merge their damage into whichever one
  mob's entry happened to still be open. The sidebar now lists one row per
  **session** — a run of encounters no more than `gapMs` (9s) apart, the
  same continuity window the fight timer already uses — labeled by the
  mob(s) fought, a wall-clock timestamp, the total duration, and a "×N
  kills" badge when it covers more than one kill. Clicking a session shows
  the *combined* average across the whole thing by default (one continuous
  dps number, not reset per target) with a target-pill row to drill into
  any single mob within it when you want the individual breakdown — see
  `EQP.mergeEncounters()` in `eqp-core.js` and `buildSessions()`/
  `sessionData()` in `analysis.js`. The live mini-mode header uses the
  exact same grouping (`currentSessionMembers()` in `app.js`), so the
  number you watch mid-fight and the entry you click into afterward always
  agree on what counted as "one fight." Analysis and the mini-mode window
  now also load `eqp-core.js` directly and do this grouping/merging
  themselves from raw encounter data, rather than the mini-mode window
  pre-computing a single encounter's stats and handing those over.
- **The per-ability table is exactly Ability / Hits / Damage done / DPS /
  Crits / Misses now** — the old extra "%" column next to Hits read as an
  ambiguous "% of hits" and has been dropped rather than relabeled; the
  little relative bar chart moved to live under the ability's own name
  instead of its own column. Misses are now tracked and attributed per
  ability (mirroring how a landed hit already is), and a spell you've cast
  gets a "×N" cast-count badge next to its name (`RE_CAST`/`tallyCast()`
  in `eqp-core.js`) — EQ's log only ever records "You begin casting …" for
  your own casts, so this is inherently a you-only count, and the very
  first cast that opens a brand-new pull (before any hit exists to
  attribute it to) has nowhere to land and is dropped rather than guessed
  at. (The website's own ability table still uses its older column
  layout — matching this there is a deliberately deferred follow-up, not
  part of this pass.)
- **A Leaderboards window** — fetches the same public `GET /api/bosses`
  the website uses directly (the worker's CORS already allows a `file://`
  page's `null` origin); clicking a boss loads and renders its actual
  leaderboard (`GET /api/bosses/:id/leaderboard`) right there in the
  window, not just a jump out to the site. One header button doubles as
  the escape hatch — it reads "Open full website" with nothing selected,
  or "View <boss> on website" once you've picked one — instead of a
  separate duplicate button per boss.
- **Bars split a pet out from its owner** — each combatant row and each of
  its pets get their own bar, each showing DPS only (not damage/%); the
  *combined* number (used for submission/leaderboard scoring, once that's
  wired) is untouched by this — see `buildDisplayRows()` in `app.js`.
- **Manual corner/edge resize, and it sticks** — drag the right edge,
  bottom edge, or the corner to resize (the window's top-left corner never
  moves while doing it); there's no separate "Size" slider in Settings
  anymore (see item 1 of the newest feature list — resizing by hand
  already covered it) and whatever size/position you leave the window at
  is what it reopens at next launch, persisted to its own small JSON file
  (`dyrelog-window.json` in Electron's userData folder) rather than the
  settings file. **All three secondary windows now persist their own size
  and position too** (Settings, Combat Analysis, Leaderboards each save
  independently, keyed by window in the same JSON file) — previously only
  the main mini-mode window remembered its bounds across restarts; see
  `loadWindowBoundsFor()`/`saveWindowBoundsFor()`/`makeBoundsPersister()`
  in `main.js`. Toggling mini mode never overwrites the main window's
  remembered size, since mini mode is a pure CSS toggle now and doesn't
  resize the window at all (see the "Mini mode" bullet above).
- **The DPS number is yours, not the raid's** — the big number in the
  header and mini mode is your own (self + pet combined) total, not
  everyone in the log combined, even if a groupmate happens to be in the
  same file — see `selfSummary()` in `app.js`.
- **Look and feel, fully customizable** — a bar-height slider (now with a
  much wider range, from noticeably thin to noticeably thick), a font
  picker (system/serif/monospace/rounded, plus four Google-Fonts options —
  Cinzel, MedievalSharp, Orbitron, and a pixel/8-bit face — for something
  more "gamer"; **Cinzel ("Fantasy") is the default look now**), and four
  color pickers (panel background, text, your bar, your pet's bar) with a
  one-click reset back to the defaults; a pet gets its own distinct
  default color instead of occasionally landing on the same one as its
  owner. **Two more color pickers cover embedded/secondary text** (the
  fight timer, the "(defeated)"/"(live)" state, the "dps" unit label, rank
  numbers) **and your own vs. your pet's name text**, separate from the
  bar/dot color pickers above and from each other, with their own reset
  button. Text no longer reads faintly blurry on any font, including
  Cinzel — the root font size is rounded to a whole pixel instead of a
  fractional one, plus forced grayscale antialiasing, which together were
  the actual cause (fractional/subpixel sizing forces the renderer to
  antialias glyph edges that would otherwise land clean). There's also an
  optional **fade UI when idle** mode — after N seconds with no mouse
  activity over the overlay, everything fades except each bar's color dot,
  name, and dps number, for a truly minimal always-on-top HUD; move the
  mouse back over it and it's instantly back.
- **Five more theme presets** — Druidic, Magical, Girly, Hardcore, and
  Metal join Midnight Blue and EQ Brass, each its own full palette (not
  just an accent swap) — see the `:root[data-theme="…"]` blocks in
  `style.css` and the matching swatches in Settings.
- **HTML scrollbars are gone everywhere, not just the mini-mode card** —
  Settings, Combat Analysis, and Leaderboards all used to show a plain
  native OS scrollbar the moment their content overflowed; all three now
  get the same themed thin scrollbar treatment the mini-mode card already
  had. Also fixed: the "Show pets as separate bars" checkbox label was
  wrapping one word per line in Settings (a width rule meant for plain
  field labels like "Background" was also squeezing checkbox labels into
  the same narrow column — it no longer applies to those).
- **"Use class colors" is a preset for your own bar, not a second color
  system** — turn it on, pick your class, and your bar uses that class's
  color instead of the separate "My bar" custom picker; every class's
  color can be customized and saved individually (with a one-click reset
  back to EverQuest's own established per-class colors), so a class you
  haven't touched still gets a sensible default.
- **Show/hide the pet split** — pets show as their own separate bars by
  default, but "Show pets as separate bars" in Settings can fold pet
  damage back into its owner's single bar instead; the combined dps number
  at the top is identical either way, this only changes the bar list.
- **Mini mode shows your pet too**, on its own smaller sub-line under your
  name/dps (with its own independent text-size slider now, separate from
  the main Text size control), whenever it's actually dealt damage this
  fight.
- **Every bar opens Combat Analysis, not just your own** — click any row
  (a groupmate's, a pet's, anyone's) to jump to the deep dive for that
  fight; Analysis always shows the whole encounter, not a per-player
  filtered view, so there was no reason to limit the click target to your
  own name.
- **Submit to leaderboard only ever prompts after a real boss kill** — the
  Submit pill/prompt used to show up after every finished fight, trash
  included. It now checks the finished encounter's mob name against the
  same curated boss list the Leaderboards window already fetches
  (`GET /api/bosses`), and only appears when that mob is both leaderboard-
  eligible and was actually killed.
- **Combat Analysis, more legible and more useful** — melee damage now
  splits by verb (Slash/Crush/Bite/Sting/etc.) instead of a single generic
  "Melee" bucket, matching how spells already got their own named rows;
  there's a new whole-encounter "Damage by ability" table below the
  Healing table, combining every combatant's *and* every pet's abilities
  into one combined total (the per-combatant deep dive below it stays
  scoped to one combatant/pet at a time — this new table is the "everyone,
  added together" view that was missing). The window also got a visual
  pass — ranked color accents (the same six hues the bar list uses) on the
  summary table and each combatant card, gradient ability bars, and
  pill-style stat chips for the headline duration/damage/dps numbers
  instead of a single flat text line.
- All three secondary windows (Settings, Combat Analysis, Leaderboards)
  stay always-on-top like the main card does — they used to fall behind
  the game (or Electron's own window) the moment you clicked off them.
- **Window size now actually persists across restarts**, not just
  position — a resize-drag and the native window-move event could
  previously race each other and silently save stale (pre-resize) bounds;
  bounds are now saved from a single debounced writer that always reads
  the window's live size right before saving.
- Frameless always-on-top window that stays above a bordered/windowed EQ
  client; drag by the header row; window controls wired to real Electron
  bounds, not opacity (that's the CSS-driven panel opacity above now, not
  the OS window's own opacity).
- **Closing the main window actually closes the whole app now, with a
  confirmation first.** It used to just close that one window — if
  Settings (or Analysis/Leaderboards) was still open, the whole Electron
  process kept running invisibly in the background. Closing the main
  window now asks "Are you sure you want to exit Dyrelog?" first, and once
  confirmed, closes every secondary window right along with it — see the
  `close` handler on `win` in `main.js`.
- **Combat Analysis's combatant table is clearer** — the "% of total"
  column (previously just "%," with no explanation) only ever shows once
  there's more than one combatant to compare against; in solo play, where
  it was always a flat, meaningless 100%, it's gone entirely. All numeric
  columns are centered instead of right-aligned, with a visible divider
  between columns so it's clear which value belongs to which header.
- **You and your pet are two separate rows now, not one combined row with
  a self/pet split buried inside it** — a warder used to show up as its
  owner's row with "and my warder" folded into the same line; now there's
  one row for you and one row for the pet, each with its own damage, dps,
  hits, and crits (a small "PET" tag marks which is which), and the deep-
  dive card below the table matches — see `buildAnalysisRows()` in
  `analysis.js`. A "combined dps" stat chip at the top still shows the
  raid-wide total across everyone.
- **A "Mobs fought this session" table** on multi-target sessions — every
  distinct target you fought in that stretch, with its own duration, kill
  count, and damage dealt, above the existing per-target drill-down — see
  `renderMobsFoughtSection()` in `analysis.js`.
- **A dedicated size slider for the fight timer, "(live)"/"(defeated)"
  status, and the "dps" unit label** (Settings > "Timer / dps / status
  size") — separate from the main Text size slider, which never sized
  these specifically on their own. "Fade UI when idle" also moved up next
  to the other sliders in Settings instead of sitting near the bottom.
- **A "Circle" display style** (Settings > Display style) — replaces the
  whole card with a small round badge showing just your dps and the fight
  timer, nothing else; Mini mode doesn't apply while it's on. It's a
  persisted Settings choice, exactly like Theme or Font — never a header
  icon toggle you could click into live, since that had no way back to
  Settings once active (the header, gear icon included, is hidden while
  the badge is up). Three independent ways back to a menu with Combat
  Analysis, Leaderboards, Settings, and Switch to Bars: click the badge,
  right-click it, or use its small gear button — the gear and right-click
  exist because the badge is also the window's drag handle, and a plain
  left-click there isn't reliably trusted alone. See `applyDisplayStyle()`
  in `app.js` and `showWatchMenu()` in `main.js`.
- **A "Circle size" slider** (Settings, only shown/relevant with Circle
  picked above) — resizes the round badge, and the window it lives in,
  from about 60% to 180% of its default size. Works live even while
  already in Circle mode. See `applyCircleScale()` in `app.js`.
- **Mini mode is text-only again** — just your name+dps (and pet sub-line)
  plus the restore button, no bars underneath. An earlier pass had grown
  the full bar list into mini mode too, which left it looking almost
  identical to standard Bars mode; this reverts that specifically (Circle
  display style, added afterward, is unaffected).
- **Damage against a mob fought *alongside* an already-locked target now
  counts** ("Add damage") — e.g. tagging an add while mid-fight with a
  raid boss used to just silently vanish from your dps/total entirely,
  since the engine only ever tracked one locked mob per continuous fight.
  Every mob actually confirmed hostile within one continuous combat
  session now contributes to that session's total dps, and Combat
  Analysis can break the total back down per mob (see the "Mobs fought
  this session" table above, now driven by real per-mob dps instead of
  just duration/damage). This is still NOT the same as a trash pull that
  happens entirely *before* a real boss engages — that case is still
  fully discarded once the boss locks in, protecting a real boss
  submission from being padded by pre-pull adds. See `enc.mobs` /
  `considerMobIdentity()` / `computeStats()`'s `byMob` in `eqp-core.js`
  (kept in sync across `overlay/`, `worker/src/`, and this app's own
  generated copy).
  - **Known limitation:** two mobs sharing the exact same in-game name
    (two "an icy terror," say) can't be told apart from the plain combat
    log — EQ's own log text never includes a per-instance ID, only the
    display name, so their damage necessarily combines into one number
    (an honest sum of everything dealt to anything with that name — not
    an over-count). The "N kills" chip at the top of a session, and each
    mob's own kill count in "Mobs fought this session," is the signal
    that a single mob line actually represents more than one kill.
    (Some companion tools that show a numbered "(5)"/"(6)" suffix per
    instance are reading something beyond the plain text log — memory
    access or a separate data feed — that a log-only tool like Dyrelog
    deliberately doesn't use.)
- **"Ask before submit" actually asks now.** The curated-boss list this
  gate depends on comes back from the worker as `{ bosses: [...] }`, but
  the desktop app's own fetch expected a bare array — so `Array.isArray()`
  on the raw response was always false, `knownBossNames` silently stayed
  an empty (but non-null — "known, and it's nobody") Set forever, and
  every kill, curated boss included, read as "not a boss, don't ask." The
  browser overlay's own copy of this fetch already unwrapped the response
  correctly; the desktop app's copy just didn't match it. See
  `fetchKnownBosses()` in `app.js`.
- **A "Border" color picker** (Settings > Colors) for each row's own
  lightweight outline — previously it only ever used the theme's fixed
  `--hair` color, faded by the same slider as the panel background, so a
  low Background opacity read as almost no structure between rows at all.
  The border is now its own override, independent of that slider, at a
  flat lightweight opacity.
- **A "Procs" panel** in Combat Analysis — your own passive/triggered
  effects (weapon procs, defensive/aggro procs) with a procs-per-minute
  rate and a trigger count, separate from the actively-cast abilities
  table. An ability counts as a proc when it landed at least once but was
  never one of your own "You begin casting…" lines (the log's own cast
  signal — see `tallyCast()` in `eqp-core.js`), excluding plain melee
  swings and the generic "Non-melee"/"Unnamed DoT tick" buckets. Not
  attempted: grouping same-proc-chance variants together (e.g. "~ Asp
  Venom Strike / Cobra Venom Strike") the way some companion tools do —
  that needs curated spell-family knowledge this project has no source
  for, not something derivable from the log alone. See
  `renderProcsSection()` in `analysis.js`.
- **Session labels now read like "Lady Vox (2) +5"** — the primary (by
  damage) mob fought, plus the party size — instead of just a bare mob
  name. The "(2)" is a real, log-wide spawn-generation number now (not a
  session-scoped kill count like the first pass of this): every distinct
  mob NAME gets its own running counter (`state.mobGenerations` in
  `eqp-core.js`) that only advances once its previous spawn actually
  resolves — a confirmed death, or its encounter going quiet with no kill
  — so it reads as "this is the 2nd time you've fought a Lady Vox this
  log," matching what EQ Legends Companion's own "(N)" suffix does (their
  own AGENTS.md: computed from the same plain-text log, not deeper game
  access). Also shown in the "Mobs fought this session" table and the
  Deep Dive header. Known scope boundary: within one single still-open
  encounter, a same-named mob dying and a fresh one of the same name
  spawning again right away (rare — an add respawning mid-boss-fight)
  keeps the earlier generation number rather than rolling a new one,
  since their damage is already merging into the same running total
  either way (same "same mob name" limitation documented below) — a
  genuinely new number only ever shows up once that mob's whole encounter
  closes. See `assignMobGeneration()`/`considerMobIdentity()` in
  `eqp-core.js`.
- **An "Incoming" tab** in Combat Analysis, alongside the existing
  view (now labeled "Outgoing") — damage the group TOOK this fight,
  broken down by mob where the log actually lets it (melee damage is
  always correctly attributed to the mob that dealt it; non-melee/spell
  damage often isn't — EQ's own log frequently doesn't name a caster on
  that kind of line — so that portion shows as its own honest
  "Unattributed (spell/DoT)" row rather than being guessed at or quietly
  dropped), plus a "Healing received" total. Not attempted: a "% hit / %
  resist" mitigation breakdown — an INCOMING miss/resist/dodge/parry
  isn't tracked at all yet (only outgoing ones are), which would need new
  log-line parsing, not just a new view on data already collected. See
  `renderIncomingTab()` in `analysis.js`.
- **Clicking a row in the main meter now swaps in place to that
  combatant's own spell/ability breakdown** (dps and total damage per
  ability), instead of opening the separate Combat Analysis window — the
  header of that view is the way back out. Combat Analysis (the header's
  own icon) is still there for the deeper multi-section breakdown
  (Procs, Healing, Mobs fought, etc.) — this is just a fast in-place
  look. See `renderDrillDown()` in `app.js`.
- **The main meter and mini bar now show "dps · total dmg"** (e.g.
  "322 dps · 12.2k") instead of just a bare dps number, on the header,
  every bar row, and the ability drill-down rows. See `fmtAbbrev()` in
  `app.js`.
- **A Peak DPS reading** next to the fight timer — tracked off a short
  rolling window (5s) of your own combined damage, not the header's own
  cumulative running-average dps (which trends toward the fight's overall
  average and rarely spikes). Resets at the start of each fresh pull. A
  full "dps over time" graph is still on the list — this is the data
  groundwork for it, not the graph itself yet. See `trackPeakDps()` in
  `app.js`.
- **A fight-selector dropdown** where the mob name used to just sit as
  plain text — click it to pick any of your recent fights (grouped the
  same "gap between pulls" way Combat Analysis already groups sessions,
  via the same `buildSessions()` logic ported into `app.js`) and the
  whole card — bar list, dps/total, timer, drill-down — freezes on that
  past fight's numbers instead of following the live one. The top option
  is always "Auto" and shows whatever fight you'd see by default (live
  one if there's one running, otherwise your last), and picking anything
  else clears itself back to Auto the moment that source changes or a
  new pull starts, so you never get stuck staring at a stale fight
  without realizing it. Submitting is disabled while looking at a past
  fight this way — Submit only ever applies to your actual current/last
  pull. See `buildSessions()`/`renderFightSelect()`/`renderPickedSession()`
  in `app.js`.
- **A "DPS over time" graph** in Combat Analysis (Outgoing tab, above
  "Mobs fought this session") — a line for your own combined self+pet
  output across the whole fight, a second line for incoming damage when
  there was any, and a peak marker/label on the your-DPS line. This is
  reconstructed after the fact from the same per-hit log data everything
  else here already uses (a new per-second bucket on each encounter,
  `enc.outBuckets`/`enc.inBuckets` in `eqp-core.js`, keyed by absolute
  epoch second so merging several back-to-back kills into one session's
  view — see the fight-selector/session-grouping above — is just summing
  same-keyed buckets, no time-shifting needed) rather than sampled live,
  so it works identically whether you're looking at the fight happening
  right now or one from earlier this session. The drawn line applies a
  light 5-second centered moving average purely for readability — every
  real number elsewhere (dps, total damage, Peak DPS in the main meter)
  stays untouched, unsmoothed. Plain inline SVG, no charting library. See
  `buildTimeline()` in `eqp-core.js` and `buildDpsChart()`/
  `renderDpsChartSection()` in `analysis.js`.
- **Settings window redesign** — "I like how his settings page is very
  clean... change our color schemes too to not be that brown color you're
  doing." Real tabs now (Appearance / Behavior / Leaderboard / What's
  New) instead of one long scrolling panel, and its own cool-graphite
  palette (`--bg`/`--accent`/`--accent-2` in `settings.css`) distinct from
  the overlay's own warm near-black default — that overlay theme system
  (Appearance > Theme, still 7 presets) is untouched, this only changed
  the settings window's own chrome. The old flat `.toggle-btn` row is now
  a proper pill-shaped segmented control. A What's New tab lists what's
  shipped so far in plain language, next to the real app version (via a
  new `get-app-version` IPC call reading `app.getVersion()`, so it's
  never out of sync with `package.json`) and a GitHub link — also
  mirrored in a persistent footer bar visible from every tab. **The
  GitHub link is a placeholder** (`GITHUB_URL` in `settings.js`) since
  nothing in this project states a real repo URL anywhere yet — swap in
  the actual one once Dyrelog has a public repo.


A couple of the requested Analysis additions didn't make it into this pass
and are worth calling out rather than silently skipping:

- **Spell cast counts** and **DoT uptime %** aren't tracked. EQ's own log
  only shows a spell landing (a hit/heal/resist line) — it doesn't log the
  cast itself, so a "cast count" from the log alone would really be
  "successful-resolution count," which undercounts (resists, fizzles,
  interrupts, and any cast on a target you weren't attributing damage to
  all vanish). DoT uptime has the same root problem plus a harder one:
  reconstructing "was this specific DoT still ticking on this specific mob
  at time T" needs per-instance tick tracking (each application, its
  duration, refreshes overwriting the timer) that `eqp-core.js` doesn't do
  today — it tallies DoT ticks into whichever ability they came from, but
  doesn't model uptime windows. Both are plausible follow-ups, just bigger
  ones than this pass.
- **Fully themed "art and flares" packages** (e.g. a Druidic/cleric/
  magical visual theme, not just a palette) — the custom color pickers
  above already cover palette customization; a real themed *skin* (its own
  iconography, textures, border ornamentation, font pairing bundled
  together) is a larger, dedicated design pass rather than a Settings
  checkbox, and is a good candidate for its own follow-up once there's a
  concrete direction to build toward.

## A note on the fight timer and simultaneous targets

If you're fighting more than one mob at a time (three adds pulled
together, tabbing between them), `eqp-core.js` still locks onto one mob
per encounter — so a moment DOES exist where the timer's underlying
encounter object changes (right when your currently-tracked target dies
and eqp-core opens a fresh one for whatever you hit next). What changed
here is the *displayed* timer: as long as that handoff happens quickly
(within the same 9-second gap eqp-core already uses to decide a fight has
genuinely ended), the header timer reads it as one continuous pull and
keeps counting instead of snapping back to 0:00 — see
`combatSessionStart` in `app.js`. What this does NOT do is give a later
target credit for time before you first landed a hit on it (EQ's log has
no "you're now fighting X" line, so there's no way to know when an
untouched add was actually pulled), and it doesn't stop damage against a
target that isn't eqp-core's currently-locked one from being dropped —
true concurrent multi-target tracking (each mob getting its own
independent encounter, live, at the same time) would fix both of those,
but touches `eqp-core.js`'s core session model, which the browser
overlay's real submission/anti-cheat pipeline also depends on — that's a
larger, dedicated follow-up, not part of this pass.

## What's not done yet

- **Login and Submit aren't wired up.** The Submit pill renders (per the
  art spec) but is disabled — there's no Discord OAuth flow in the
  desktop shell yet, so there's nothing to submit *as*. Next milestone:
  probably `shell.openExternal()` to the existing web login flow plus a
  small local callback (or a paste-a-code step) to hand the resulting
  session back to the Electron app, then reuse the same
  `/api/streams` / `/api/streams/:id/finalize` calls the browser overlay
  already makes. When that lands, it should read each row's *combined*
  `damage`/`dps` (pet folded in) — the per-pet bar split above is a
  display-only change and doesn't touch what gets submitted.
- **No packaged build yet.** `npm run dist` is configured
  (electron-builder, targets win/mac/linux) but untested — worth doing
  once login/Submit are real.
- **Analyze Log** (the browser overlay's second tab, for reviewing old
  *saved* sessions from a picked file) has no equivalent here yet — the
  Combat Analysis window above covers the *current session's* encounters
  (live + this run's history), not an arbitrary saved log file.

## Why Electron instead of trying to keep fighting the browser sandbox

The browser overlay (`overlay/dyrelog-overlay.html`) has to route around
the File System Access API's permission model — IndexedDB-stored file
handles, a "Resume last log…" click required once per browser restart,
because a web page is deliberately sandboxed away from the filesystem.
Electron's main process is just Node: real, unprompted `fs` access every
time the app launches. That's most of why this exists — not just the
always-on-top window, but a fundamentally simpler (and more reliable)
relationship with the log file itself.
