# Named-pet ownership

The supplied Stoten log contains 1,673,811 lines and 8,933 direct pet attack acknowledgements.

```text
[Wed Sep 09 22:31:31 2026] Zeneker told you, 'Attacking a ghoul cavalier Master.'
[Wed Sep 09 22:31:43 2026] Zeneker bashes a vis ghoul knight for 14 points of damage.
[Wed Sep 09 22:31:44 2026] Zeneker kicks a vis ghoul knight for 39 points of damage.
[Wed Sep 09 22:31:44 2026] Zeneker slashes a vis ghoul knight for 128 points of damage.
[Mon Sep 07 18:39:47 2026] You begin casting Restless Bones.
[Mon Sep 07 18:39:48 2026] Your Restless Bones spell is interrupted.
```

The direct `told you` attack response identifies the local owner. Normal pet attack commands suffice; no `/pet leader` response was found or assumed. The log does not identify Zeneker's visual model. Summon casts do not name the pet and can be interrupted. Public `says ... Master` messages do not identify an owner. No second player's perspective was supplied.

The shared parser extends its existing combatants and pet breakdowns with a normalized ownership map containing owner, confidence, source, timestamp and original evidence. Explicit hits, criticals, abilities, misses, per-mob totals and timeline contributions transfer once. Unknown opening hits are retained and recovered through the existing ingest function. Previously guessed unnamed ticks remain Unattributed.

Retroactive attribution covers the current/latest encounter until another fight starts. It does not claim unknown same-named attackers in unrelated earlier fights. Established ownership persists across fights. Explicit pet deaths invalidate mappings; zoning, casts and ambiguous chatter do not establish a new pet's identity. Existing possessive names continue supporting other owners; no unobserved public leader format was invented.

Uploads preserve original ownership lines in a stable prefix, with new evidence in the normal stream or appended before finalization. The server reparses these lines rather than trusting a client owner map. Local history retains attribution revisions and submission metadata. Already finalized public scores are not automatically rewritten or resubmitted.

Automated tests cover ownership before/after damage, duplicate messages, multiple owners, unknown names, fight boundaries, new names, death, conflicting evidence, unnamed ticks, misses, raw stream stability and actual server finalization. A read-only full-log replay passed encounter and per-mob integrity checks, with 33,325 explicit damage retroactively attributed. Run `node scripts/verify-pet-log.mjs path/to/eqlog_Stoten_freeport.txt` to repeat it. The supplied log was not uploaded.
