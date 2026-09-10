# Named-pet ownership: discovery before implementation

## Existing architecture

- `worker/src/eqp-core.js` is the parser source. Desktop startup/build copies it
  into the renderer, removing its ESM export.
- `resolveCombatant()` currently recognizes possessive names with
  `RE_PET_OWNER`. It folds the matching owner into `You` when that owner is the
  submitting character. It has no evidence map for arbitrary summoned names.
- `ingest()` accumulates combined owner damage and preserves pet damage, hits,
  critical hits and abilities in `combatants[owner].pets[rawPetName]`.
- `computeStats()` exposes combined damage/DPS and separate self/pet totals.
  Encounters also have per-mob and timeline accounting; reassignment must keep
  those views consistent without changing encounter-wide damage.
- `newState()` holds session data; closing a fight starts a new encounter without
  replacing that state. A verified ownership map belongs on the session state.
- `worker/src/submissions.js` reparses each uploaded log with a fresh state and
  stores the submitting character's `You` row. A separate named attacker is not
  credited to that character.
- `rawTextForEncounter()` in the desktop sends only the encounter interval plus
  two seconds of padding. Ownership evidence learned earlier could therefore
  be missing from the server's log. The eventual change must retain and send the
  original evidence lines so server attribution can independently reproduce it.

## Evidence available

The repository parser and constructed tests cover possessive pet names. No
raw Shadow Knight summon/command/lifecycle test was found. The pasted request
contains conceptual examples, not captured ownership responses.

Consequently the skeleton's exact name, summon lines, leader response, attack
response, visibility to other players, and lifecycle signals remain unknown.
No new ownership regex or inference has been implemented.

## Recommended implementation after raw-log discovery

1. Parse only demonstrated ownership signals into evidence records, retaining
   source lines, timestamps and confidence. Never infer ownership from an
   arbitrary attacker name or proximity to a cast.
2. Add session-level ownership records and extend the existing resolver.
   Ambiguous names remain unassigned to an owner; they are not automatically
   classified as pets instead of players.
3. Transfer existing combatant accounting into the owner's pet breakdown once
   ownership is established, including per-mob/timeline/ability accounting.
   Preserve overall damage and make repeated evidence idempotent.
4. Retain mappings across fight boundaries; invalidate or supersede only with
   lifecycle evidence actually present in the supplied logs.
5. Preserve original ownership evidence through streaming/finalization so the
   worker can verify the same relationship without trusting a client-supplied
   owner map. Evidence arriving after finalization needs an explicit handling
   policy rather than silently changing a published score.
6. Add the requested attribution, lifecycle, multi-owner, no-double-counting,
   and leaderboard regression cases using the captured formats.

## Needed next

Raw, timestamped Shadow Knight test lines covering summoning, pet leader/attack
responses, damage, dismissal or death, and resummoning. Where possible, include
the same events from another player's log to distinguish public evidence from
owner-only messages.
