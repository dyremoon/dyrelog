/* EQP core — pure parsing/stat engine for the EverQuest DPS tracker.
   No DOM access anywhere in this file, so it can run in a browser <script>
   or under plain Node for testing. */
(function (root) {
  "use strict";

  // ---- verb lists (melee) ------------------------------------------------
  // Combined base + third-person forms so one alternation matches "You slash"
  // and "A rat_snake slashes" without tracking grammatical agreement.
  var MELEE_VERBS = [
    "slash", "slashes", "pierce", "pierces", "crush", "crushes",
    "claw", "claws", "bite", "bites", "sting", "stings", "maul", "mauls",
    "hit", "hits", "punch", "punches", "kick", "kicks", "gore", "gores",
    "smash", "smashes", "rend", "rends", "slice", "slices", "bash", "bashes",
    "shoot", "shoots", "burn", "burns", "gouge", "gouges",
    "cleave", "cleaves", "backstab", "backstabs", "strike", "strikes"
  ].sort(function (a, b) { return b.length - a.length; }); // longest-first

  var VERB_ALT = MELEE_VERBS.join("|");

  // Normalizes either grammatical form of a melee verb ("slash"/"slashes")
  // down to one display label ("Slash") — used to split the generic
  // "Melee" ability bucket into actual attack types in the Analysis
  // window's deep dive (see abilityName() below and item 7.1: '"melee"
  // what kind?').
  var VERB_LABELS = {
    slash: "Slash", slashes: "Slash", pierce: "Pierce", pierces: "Pierce",
    crush: "Crush", crushes: "Crush", claw: "Claw", claws: "Claw",
    bite: "Bite", bites: "Bite", sting: "Sting", stings: "Sting",
    maul: "Maul", mauls: "Maul", hit: "Hit", hits: "Hit",
    punch: "Punch", punches: "Punch", kick: "Kick", kicks: "Kick",
    gore: "Gore", gores: "Gore", smash: "Smash", smashes: "Smash",
    rend: "Rend", rends: "Rend", slice: "Slice", slices: "Slice",
    bash: "Bash", bashes: "Bash", shoot: "Shoot", shoots: "Shoot",
    burn: "Burn", burns: "Burn", gouge: "Gouge", gouges: "Gouge",
    cleave: "Cleave", cleaves: "Cleave", backstab: "Backstab", backstabs: "Backstab",
    strike: "Strike", strikes: "Strike"
  };

  var RE_TIMESTAMP = /^\[(\w{3} \w{3} \d{1,2} \d{2}:\d{2}:\d{2} \d{4})\]\s?(.*)$/;

  // Group 5 = an optional one-word damage-type qualifier before "damage"
  // — "non-melee" for a direct-damage spell that names its caster
  // ("Fizmo hits a rat_snake for 156 points of non-melee damage."), but
  // also disease/fire/cold/poison/magic/etc. for a typed melee or pet
  // attack ("Dyremoon`s warder hits a rat_snake for 62 points of disease
  // damage."). Matching any single word here (rather than hardcoding
  // "non-melee" only) is what was missing — a mob-side pet ability tagged
  // with an element was silently going unrecognized.
  // Group 6 = an optional attributed-spell clause BEFORE the period
  // ("...for 50 points of poison damage by Blood Draw Strike.") — a
  // proc/skill that names itself doesn't put a period right after
  // "damage" the way plain melee does, so the period has to move to
  // after this clause instead of being hardcoded right after "damage".
  // Group 7 is an optional (Critical)/(Flurry)/etc tag.
  var RE_MELEE = new RegExp(
    "^(.+?) (" + VERB_ALT + ") (.+?) for (\\d+) points? of (\\S+ )?damage(?: by (.+?))?\\.(?:\\s*\\((.+?)\\))?\\s*$"
  );

  var RE_MISS = new RegExp(
    "^(.+?) tr(?:y|ies) to (" + VERB_ALT + ") (.+?), but (.+?)!?\\s*$"
  );

  // "You begin casting Starfire." — only ever appears for the log's own
  // owner (EQ doesn't log another player's cast-start line at all, unless
  // you're the one casting), so cast counts below are inherently "your own
  // casts only" — see item 10 ("how many casts of a nuke did I do").
  var RE_CAST = /^You begin casting (.+?)\.\s*$/;

  var RE_NONMELEE = /^(.+?) (?:have|has) taken (\d+) points? of (non-melee|falling) damage\.\s*$/;

  // Direct-damage spells that DO name a caster read exactly like RE_MELEE
  // ("Fizmo hit a rat_snake for 156 points of non-melee damage.") so
  // RE_MELEE is tried first; RE_NONMELEE only catches the unattributed
  // DoT-tick form ("A rat_snake has taken 22 points of non-melee damage.").

  // DoT ticks and procs that name their own spell instead of "non-melee":
  // "A scorn banshee has taken 259 damage from your Drifting Death X." or
  // "You have taken 3 damage from Strong Disease by a scorn banshee." Very
  // common (DoTs, life-drain procs, poison breath) — found missing after
  // comparing a real fight against another parser and coming up ~60% short
  // on total damage. Treated the same as RE_NONMELEE (unattributed to a
  // specific combatant, same as that regex already simplifies to) rather
  // than trying to parse out who cast it.
  var RE_NONMELEE_FROM = /^(.+?) (?:have|has) taken (\d+) (?:points? of )?damage from (.+?)\.?\s*$/i;

  // Damage-shield/thorns/reflect damage: "Dyremoon`s warder is pierced by
  // a wan ghoul knight's thorns for 20 points of non-melee damage." or
  // "YOU are pierced by a spite golem's thorns for 20 points of non-melee
  // damage!" — passive-voice, doesn't use any MELEE_VERBS verb at all.
  var RE_THORNS = /^(.+?) (?:is|are) \w+ by (?:(.+?)'s|your) (?:thorns|flames|spikes|retaliation) for (\d+) points? of (?:non-melee )?damage[.!]?\s*$/i;

  var RE_HEAL_OTHER = /^(.+?) (?:have|has) been healed for (\d+) points?(?: of damage)? by (.+?)\.?\s*$/i;
  var RE_HEAL_SELF = /^You have been healed for (\d+) points? by (.+?)\.?\s*$/i;

  var RE_SLAIN_BY = /^(.+?) has been slain by (.+?)!\s*$/;
  var RE_YOU_SLAIN = /^You have (?:been slain by|died)\.?\s*(.*)$/;
  var RE_YOU_SLAY = /^You have slain (.+?)!\s*$/;

  // A tiered instance's zone-in line names its own difficulty right in the
  // log text — "You have entered Nagafen's Lair - Group 2 (Adaptive)." —
  // confirmed against a real player log (not guessed). This is a far more
  // trustworthy signal than asking the player: it comes from the same
  // untouchable first-person log everything else here already trusts, so
  // there's nothing to lie about — editing it would break the "genuine
  // live log" assumption the whole submission pipeline already depends
  // on. A base (untiered) zone just has no trailing "(Tier)" at all.
  var ZONE_DIFFICULTY_LABELS = { Awakened: "D1", Adaptive: "D2", Fused: "D3", Refined: "D4" };
  var RE_ZONE = /^You have entered (.+?)(?:\s*\((Awakened|Adaptive|Fused|Refined)\))?\.\s*$/;

  var INTERESTING_HINT = /damage|slain|healed|died/i;

  // A player-owned pet is logged as "<Owner>`s <pettype>" — a backtick
  // apostrophe, e.g. "Dyremoon`s warder", "Fizmo`s snake" — always the
  // owner's real character name, even for your own pet (EQ never writes
  // "Your warder hits..." the way it writes "You hit..."). A mob's own
  // summoned pet reads differently ("King Tranix pet" — no possessive at
  // all), so this pattern only ever matches a *player's* pet and is safe
  // to fold onto its owner unconditionally.
  var RE_PET_OWNER = /^(.+?)[`']s\s+\S+$/;

  // Resolves a raw combatant name to who it should actually count
  // against: a player pet's name folds onto its owner (and onto "You"
  // specifically when the owner is the log's own submitting character —
  // see state.characterName), so a pet never shows up as its own row
  // diluting the owner's damage, and the *submitting* player's own pet
  // damage doesn't silently fail to count toward their parse at all.
  // Anything that isn't a pet name passes through unchanged.
  function resolveCombatant(state, name) {
    if (!name) return name;
    var m = RE_PET_OWNER.exec(name);
    var owner = m ? m[1] : name;
    if (state.characterName && owner === state.characterName) return "You";
    return owner;
  }

  // EQ capitalizes a mob's leading article when its name opens a sentence
  // ("A rotting corpse has taken..." vs "...hit a rotting corpse for..."),
  // so the same mob shows up two ways. Player names never start with an
  // article, so this only folds the mob case, leaving "Fizmo" alone.
  function canon(name) {
    if (!name) return name;
    var lower = name.charAt(0).toLowerCase() + name.slice(1);
    return /^(a |an |the )/.test(lower) ? lower : name;
  }

  function parseTimestamp(s) {
    // "Sun Sep 01 12:34:56 2026" — Date.parse handles this directly.
    var t = Date.parse(s);
    return isNaN(t) ? null : t;
  }

  // Returns a parsed event object, or null if the line isn't recognized.
  function parseLine(raw) {
    // EverQuest writes its logs with Windows-style CRLF line endings, so
    // every line coming out of a \n-split still has a trailing \r on it.
    // JS regex "." treats \r as a line terminator (it refuses to match
    // it), so leaving it on would make RE_TIMESTAMP — and everything
    // after it — fail on every single line. Strip it before any matching.
    if (raw.charCodeAt(raw.length - 1) === 13) raw = raw.slice(0, -1);
    var m = RE_TIMESTAMP.exec(raw);
    if (!m) return null;
    var time = parseTimestamp(m[1]);
    if (time === null) return null;
    var rest = m[2];
    if (!rest) return null;

    var mm;

    if ((mm = RE_MELEE.exec(rest))) {
      var source = canon(mm[1]), target = canon(mm[3]);
      var isSelfSource = source === "You";
      var isSelfTarget = target === "YOU";
      return {
        time: time, type: "hit",
        source: isSelfSource ? "You" : source,
        target: isSelfTarget ? "You" : target,
        amount: parseInt(mm[4], 10),
        nonMelee: mm[5] === "non-melee ",
        damageType: mm[5] ? mm[5].trim() : null,
        verb: mm[2], // raw matched verb ("slashes"/"crushes"/etc) — see VERB_LABELS/abilityName()
        viaSpell: mm[6] || null,
        modifier: mm[7] || null,
        selfInvolved: isSelfSource || isSelfTarget,
        raw: raw
      };
    }
    if ((mm = RE_NONMELEE.exec(rest))) {
      var tgt = canon(mm[1]);
      tgt = tgt === "You" ? "You" : tgt;
      return {
        time: time, type: "nonmelee",
        source: null, target: tgt,
        amount: parseInt(mm[2], 10),
        kind: mm[3],
        raw: raw
      };
    }
    if ((mm = RE_NONMELEE_FROM.exec(rest))) {
      var tgt2 = canon(mm[1]);
      if (tgt2 === "You") {
        // Incoming damage taken by the player from a source the sentence
        // doesn't cleanly name ("You have taken 3 damage from Strong
        // Disease by a scorn banshee.") — v1 doesn't break down damage
        // *taken* by source (that's a website-only feature), so just
        // count it, same as the plain RE_NONMELEE case.
        return {
          time: time, type: "nonmelee",
          source: null, target: "You",
          amount: parseInt(mm[2], 10),
          kind: "proc",
          raw: raw
        };
      }
      // Damage being dealt TO a mob/NPC — figure out who cast it so it
      // lands under the right combatant (You, your pet, or a groupmate)
      // instead of a catch-all. Two cases give us a real name: "from
      // your X" -> you; "from <name>'s X" (a pet's own proc, or a
      // groupmate's named proc) -> that name. A bare spell name with no
      // stated owner ("...from Envenomed Breath.") is genuinely
      // ambiguous — it's always been the player's own proc in solo
      // testing, but in a group it could just as easily be a groupmate's
      // unnamed proc, and guessing "You" would silently steal credit for
      // someone else's damage. So an unnamed case falls through to the
      // same "nonmelee" path plain unattributed DoTs already use below,
      // which respects the Solo mode checkbox instead of assuming.
      var attribution = mm[3];
      var possessive = /^(.+?)'s\s+/.exec(attribution);
      if (/^your\b/i.test(attribution) || possessive) {
        var src2 = /^your\b/i.test(attribution) ? "You" : canon(possessive[1]);
        return {
          time: time, type: "hit",
          source: src2, target: tgt2,
          amount: parseInt(mm[2], 10),
          nonMelee: true,
          damageType: null,
          viaSpell: attribution,
          modifier: null,
          selfInvolved: src2 === "You",
          raw: raw
        };
      }
      return {
        time: time, type: "nonmelee",
        source: null, target: tgt2,
        amount: parseInt(mm[2], 10),
        kind: "proc",
        raw: raw
      };
    }
    if ((mm = RE_THORNS.exec(rest))) {
      var tgt3 = canon(mm[1]);
      var isSelfTarget3 = tgt3 === "YOU";
      var owner = mm[2]; // undefined when the "your" branch matched
      var src3 = owner ? canon(owner) : "You";
      return {
        time: time, type: "hit",
        source: src3,
        target: isSelfTarget3 ? "You" : tgt3,
        amount: parseInt(mm[3], 10),
        nonMelee: true,
        damageType: null,
        viaSpell: "thorns",
        modifier: null,
        selfInvolved: src3 === "You" || isSelfTarget3,
        raw: raw
      };
    }
    if ((mm = RE_MISS.exec(rest))) {
      return {
        time: time, type: "miss",
        source: canon(mm[1]) === "You" ? "You" : canon(mm[1]),
        verb: mm[2], // matches abilityName()'s VERB_LABELS, same as a landed hit — see item 11
        target: canon(mm[3]),
        raw: raw
      };
    }
    if ((mm = RE_CAST.exec(rest))) {
      return { time: time, type: "cast", spell: mm[1], raw: raw };
    }
    if ((mm = RE_HEAL_SELF.exec(rest))) {
      return { time: time, type: "heal", target: "You", amount: parseInt(mm[1], 10), source: canon(mm[2]), raw: raw };
    }
    if ((mm = RE_HEAL_OTHER.exec(rest))) {
      return { time: time, type: "heal", target: canon(mm[1]), amount: parseInt(mm[2], 10), source: canon(mm[3]), raw: raw };
    }
    if ((mm = RE_SLAIN_BY.exec(rest))) {
      return { time: time, type: "death", victim: canon(mm[1]), killer: canon(mm[2]) === "You" ? "You" : canon(mm[2]), raw: raw };
    }
    if ((mm = RE_YOU_SLAY.exec(rest))) {
      return { time: time, type: "death", victim: canon(mm[1]), killer: "You", raw: raw };
    }
    if ((mm = RE_YOU_SLAIN.exec(rest))) {
      return { time: time, type: "death", victim: "You", killer: mm[1] || "unknown", raw: raw };
    }
    if ((mm = RE_ZONE.exec(rest))) {
      return {
        time: time, type: "zone", zone: mm[1],
        difficulty: mm[2] ? ZONE_DIFFICULTY_LABELS[mm[2]] : null,
        raw: raw
      };
    }
    if (INTERESTING_HINT.test(rest)) {
      return { time: time, type: "unmatched", raw: raw };
    }
    return null;
  }

  // ---- session/encounter state machine -----------------------------------

  function newState(opts) {
    opts = opts || {};
    // knownBossNames (optional): names of curated leaderboard bosses. When
    // given, it lets an encounter's tracked mob identity get promoted from
    // an incidental trash add to a real boss the moment the boss shows up
    // — see considerMobIdentity() below for why that matters.
    var knownBossNames = null;
    if (opts.knownBossNames instanceof Set) knownBossNames = opts.knownBossNames;
    else if (opts.knownBossNames) knownBossNames = new Set(opts.knownBossNames);
    return {
      encounters: [],
      current: null,
      unmatched: [],
      soloMode: !!opts.soloMode,
      gapMs: (opts.gapSeconds || 9) * 1000,
      maxUnmatched: opts.maxUnmatched || 40,
      knownBossNames: knownBossNames,
      // The submitting character's real name (e.g. "Dyremoon"), used only
      // to fold that player's own pet lines onto "You" — see
      // resolveCombatant(). Optional; without it, a pet still folds onto
      // its owner's real name, just not specifically onto "You".
      characterName: opts.characterName || null,
      // currentDifficulty/zoneKnown track the most recent zone-in line's
      // tier (see RE_ZONE above) so a new encounter can be stamped with
      // it the moment it starts. zoneKnown stays false until at least one
      // zone-in line has actually been seen — that's what lets a caller
      // tell "confirmed Base" (zoneKnown true, difficulty null) apart
      // from "genuinely don't know yet" (zoneKnown false, e.g. streaming
      // started mid-zone with no zone-in line captured).
      currentDifficulty: null,
      zoneKnown: false,
      // Global, log-wide spawn-generation numbering for mob NAMES — name ->
      // { gen: number, resolved: boolean }. Lives on state (not any one
      // encounter) because it has to survive across encounters closing and
      // new ones opening, for as long as this log's been parsed — see
      // assignMobGeneration()/resolveMobGeneration() below and
      // considerMobIdentity()'s comment for what this is and why.
      mobGenerations: {}
    };
  }

  function blankEncounter(startTime, difficulty, difficultyKnown) {
    return {
      startTime: startTime,
      endTime: startTime,
      mobName: null,
      mobKilled: false,
      // How many times a death line has matched this encounter's locked
      // mobName — almost always 1 (a kill closes the encounter on the
      // spot, see the "death" branch in ingest()), but stays available for
      // the rare case where more than one same-named kill lands inside
      // this same still-open encounter. Purely a display aid — it doesn't
      // change what damage gets attributed to what. See also the
      // session-grouping in analysis.js, which is the real fix for
      // browsing multiple back-to-back kills as one continuous fight.
      mobKillCount: 0,
      combatants: {}, // name -> {damage, hits, crits, misses} — damage DEALT to the mob
      damageTaken: {}, // name -> {damage, hits} — damage the mob (or adds) dealt to the group
      totalDamage: 0,
      totalTaken: 0,
      difficulty: difficulty || null,
      difficultyKnown: !!difficultyKnown,
      // Healing DONE during this encounter, name -> {amount, hits} — same
      // "attribute to whatever fight is current" simplification the
      // damageTaken bucket already uses below (a heal line doesn't name a
      // target mob at all, so there's no better bucket to put it in, and
      // it never opens or extends an encounter on its own — see the
      // "heal" branch in ingest()).
      healers: {},
      // Who last landed a *named* spell hit on the tracked mob (see the
      // "hit" branch below, where this gets set only on nonMelee hits —
      // plain melee swings never explain who owns a DoT). EQ's own log
      // never names the caster on a recurring DoT tick ("A rat_snake has
      // taken 12 points of non-melee damage." — no source at all), so
      // there's no way to know for certain; this is the same
      // last-known-caster heuristic other EQ parsers use for exactly this
      // gap, and it's a huge improvement over dumping every tick in
      // "Unattributed" when it's overwhelmingly still that same caster's
      // DoT still ticking. See the nonmelee branch in ingest().
      lastSpellCaster: null,
      // Every mob actually confirmed as hostile within this one continuous
      // combat session, name -> its own damage/kill sub-record — not just
      // mobName (the single "primary" identity above, still used for
      // display/boss-detection/submission). Added so an add fought
      // alongside an already-locked target (e.g. a priest add next to
      // Lady Vox) counts toward this encounter's totals AT ALL instead of
      // being silently dropped, while still being breakable out per-mob
      // for Analysis — see considerMobIdentity() below, computeStats()'s
      // byMob, and "it should count all damage done during that combat
      // session, and then in analysis it can break it down to what dps
      // per mob if we want."
      mobs: {},
      // "DPS over time" graph groundwork — a per-SECOND damage bucket, key
      // = Math.floor(ev.time / 1000) (an absolute epoch second, not one
      // relative to this encounter's own start), value = total damage that
      // second. outBuckets is your own combined self+pet damage dealt
      // (same "resolvedSource === 'You'" folding computeStats()'s rows
      // already rely on, so this always agrees with the header's own dps
      // number); inBuckets is damage the group took, from every source,
      // melee and non-melee alike (same total enc.totalTaken/
      // computeTakenStats() already track). Keying by ABSOLUTE second
      // rather than "seconds since this encounter started" is what makes
      // mergeEncounters() below trivial — merging several back-to-back
      // encounters' buckets is just adding same-keyed entries together,
      // no time-shifting needed, since a session's members never overlap
      // in real time. See addBucket()/computeStats()'s timeline field.
      outBuckets: {},
      inBuckets: {}
    };
  }

  // See blankEncounter()'s outBuckets/inBuckets comment above.
  function addBucket(map, timeMs, amount) {
    var b = Math.floor(timeMs / 1000);
    map[b] = (map[b] || 0) + amount;
  }

  function combatant(enc, name) {
    if (!enc.combatants[name]) {
      // pets: raw pet-name -> {damage, hits, crits, abilities}, filled in
      // only when a line folded onto this combatant via resolveCombatant()
      // (see the "hit" branch in ingest()). abilities: ability/spell name
      // -> {damage, hits, crits} — this combatant's OWN breakdown only
      // (a pet fold updates the pet's own abilities sub-ledger instead,
      // never this one — see the hit branch). Damage above already
      // includes whatever ends up in pets/abilities — these are purely a
      // breakdown for display (the Analysis window's deep-dive view), not
      // a second ledger, so nothing downstream that only reads .damage
      // (submission scoring, the leaderboard) needs to know they exist.
      enc.combatants[name] = { name: name, damage: 0, hits: 0, crits: 0, misses: 0, pets: {}, abilities: {} };
    }
    return enc.combatants[name];
  }

  // Turns a hit event into a human spell/ability name for the Analysis
  // window's per-combatant breakdown (see computeStats()'s abilities[]).
  // This groups by *ability*, not by individual swing — EQ's own log
  // doesn't carry enough to reconstruct every single hit as its own row,
  // but it does name enough procs/DoTs/pet abilities to group meaningfully
  // by what dealt the damage instead of lumping it all as one number.
  function abilityName(ev) {
    if (!ev.viaSpell) {
      if (ev.nonMelee) return "Non-melee";
      return (ev.verb && VERB_LABELS[ev.verb]) || "Melee";
    }
    if (ev.viaSpell === "thorns") return "Thorns";
    var m = /^your\s+(.+)$/i.exec(ev.viaSpell);
    if (m) return m[1];
    var m2 = /^.+?'s\s+(.+)$/.exec(ev.viaSpell);
    if (m2) return m2[1];
    return ev.viaSpell;
  }

  function tallyAbility(bucket, abName, amount, isCrit) {
    var ab = bucket[abName] || (bucket[abName] = { name: abName, damage: 0, hits: 0, crits: 0, misses: 0, casts: 0 });
    ab.damage += amount;
    ab.hits += 1;
    if (isCrit) ab.crits += 1;
  }

  // A swing that didn't land at all — tracked per-ability now (bucketed by
  // melee verb, same VERB_LABELS a landed hit uses) so the Analysis
  // window's ability table can show hits AND misses on the same row
  // instead of a hit count that quietly excludes every whiff — see item 11
  // ("Ability / Hits / Damage done / DPS / Crits / Misses").
  function tallyMiss(bucket, abName) {
    var ab = bucket[abName] || (bucket[abName] = { name: abName, damage: 0, hits: 0, crits: 0, misses: 0, casts: 0 });
    ab.misses += 1;
  }

  // A completed "begin casting" line — tallied onto the SAME bucket a
  // landed/resisted hit for that spell would use (abilityName() already
  // strips "your "/"'s " prefixes down to the bare spell name, and so
  // does RE_CAST, so "Starfire" from a cast lines up with "Starfire" from
  // a hit) — see item 10.
  function tallyCast(bucket, abName) {
    var ab = bucket[abName] || (bucket[abName] = { name: abName, damage: 0, hits: 0, crits: 0, misses: 0, casts: 0 });
    ab.casts += 1;
  }

  function attacker(enc, name) {
    if (!enc.damageTaken[name]) {
      enc.damageTaken[name] = { name: name, damage: 0, hits: 0 };
    }
    return enc.damageTaken[name];
  }

  // Ends the current encounter (if any) and files it into history.
  function closeEncounter(state) {
    if (state.current) {
      // Every mob confirmed within this encounter that never got a
      // confirmed death (fled, feared out of range, simply stopped being
      // hit) has its spawn-generation treated as "done" the moment the
      // whole encounter itself goes quiet — otherwise a genuinely new
      // spawn of that same name later would keep reusing this same
      // generation number forever, since nothing else would have ever
      // resolved it. A death mid-fight already resolves its own name
      // immediately (see the "death" branch in ingest()); this is the
      // catch-all for everything that didn't.
      Object.keys(state.current.mobs || {}).forEach(function (name) {
        resolveMobGeneration(state, name);
      });
    }
    if (state.current && state.current.totalDamage > 0) {
      state.encounters.push(state.current);
    }
    state.current = null;
  }

  // Call this periodically in live mode (e.g. every tick) so a fight ends
  // even if no further lines arrive (mob feared out of log range, etc.)
  function checkTimeout(state, nowTime) {
    if (state.current && (nowTime - state.current.endTime) > state.gapMs) {
      closeEncounter(state);
    }
  }

  function isCombatEvent(ev) {
    return ev.type === "hit" || ev.type === "nonmelee";
  }

  // Fresh per-mob sub-record for enc.mobs — see its comment in
  // blankEncounter() and considerMobIdentity() below.
  function blankMobRecord(name) {
    return {
      name: name,
      startTime: null,
      endTime: null,
      totalDamage: 0,
      totalTaken: 0,
      mobKilled: false,
      mobKillCount: 0,
      // Which spawn of this exact mob NAME this is, log-wide — stamped
      // once by considerMobIdentity() the moment this record is first
      // created; see its comment and assignMobGeneration() below.
      generation: null,
      combatants: {} // name -> {damage, hits, crits} — this ONE mob's own breakdown
    };
  }

  // A name's generation only advances once its PREVIOUS one has actually
  // resolved (a confirmed death, or its encounter going quiet for the gap
  // window with no kill — see resolveMobGeneration() and closeEncounter())
  // — as long as the same instance just keeps getting re-confirmed (e.g.
  // re-merged into a still-continuing encounter, or fought again within
  // the same still-open fight), it keeps the same number rather than
  // incrementing on every re-mention.
  function assignMobGeneration(state, name) {
    var g = state.mobGenerations[name];
    if (!g || g.resolved) {
      g = state.mobGenerations[name] = { gen: g ? g.gen + 1 : 1, resolved: false };
    }
    return g.gen;
  }
  // Marks a name's current generation as "done" — see the two call sites
  // (an individual mob's own death, and closeEncounter()'s catch-all for
  // anything that never died but went quiet) for what "done" means here.
  function resolveMobGeneration(state, name) {
    var g = state.mobGenerations && state.mobGenerations[name];
    if (g) g.resolved = true;
  }

  // Tallies one hit's damage onto a specific per-mob record (enc.mobs[x]) —
  // the same damage that already went into the encounter's COMBINED
  // totalDamage/combatants above, just also broken out per mob so Analysis
  // can show "dps per mob" on request. Deliberately a simpler ledger than
  // the top-level one (no pets{}/abilities{} sub-breakdown) — this exists
  // for "how much of the fight was against this mob," not a second full
  // ability breakdown per mob per person.
  function tallyMobHit(mobRec, name, amount, isCrit, time) {
    mobRec.totalDamage += amount;
    if (mobRec.startTime === null) mobRec.startTime = time;
    mobRec.endTime = time;
    var mc = mobRec.combatants[name] || (mobRec.combatants[name] = { name: name, damage: 0, hits: 0, crits: 0 });
    mc.damage += amount;
    mc.hits += 1;
    if (isCrit) mc.crits += 1;
  }

  // Establishes/updates an encounter's tracked mob identity, AND confirms
  // `name` as a hostile mob within this encounter at all (enc.mobs[name] —
  // see its comment in blankEncounter()). enc.mobName is the single
  // "primary" identity used for display/boss-detection/submission — the
  // first mob ever seen locks in by default (unchanged from before) — but
  // if knownBossNames was supplied and a *different* mob shows up that IS
  // a curated boss while the currently-locked mob is NOT one, identity
  // gets promoted to the boss. Whatever had accumulated against the old
  // mob (and every other mob confirmed so far) is discarded, not merged —
  // the point isn't just "track the boss instead of the add from now on,"
  // it's "never let add damage sit inside the number that ends up
  // representing the boss." A trash pull that happens to precede a named
  // boss (very common — nothing stops three adds from being in combat
  // when the boss runs in) would otherwise either mis-lock onto the first
  // add and silently drop all the real boss damage, or — if this reset
  // weren't here — let the add's damage pad the boss's total, which is
  // exactly the "bring extra adds for free DPS" exploit this exists to
  // close.
  //
  // Once a known boss is locked in, nothing can replace it as the PRIMARY
  // identity — if a second curated boss name somehow appears in the same
  // encounter, the first one locked wins for mobName/submission purposes;
  // the second is still confirmed into enc.mobs like any other add (its
  // damage now counts toward the encounter total — see "Add damage" —
  // it just never becomes the thing the fight is named/submitted as).
  function considerMobIdentity(state, enc, name) {
    if (!name) return;
    if (!enc.mobs[name]) {
      enc.mobs[name] = blankMobRecord(name);
      // Global, log-wide spawn-generation numbering — "an icy terror (7)"
      // meaning the 7th time this exact mob name has been confirmed
      // hostile in this loaded log, not a count scoped to the current
      // pull or session. Mirrors what EQ Legends Companion's own "(N)"
      // suffix does — computed from the same plain-text log, not deeper
      // game access (its own AGENTS.md: "mobKey strips it for lookups") —
      // "build the fuller version." See assignMobGeneration() above.
      enc.mobs[name].generation = assignMobGeneration(state, name);
    }
    if (enc.mobName === name) return;
    if (!enc.mobName) {
      enc.mobName = name;
      return;
    }
    var nameIsBoss = state.knownBossNames && state.knownBossNames.has(name);
    var currentIsBoss = state.knownBossNames && state.knownBossNames.has(enc.mobName);
    if (nameIsBoss && !currentIsBoss) {
      var bossRec = enc.mobs[name]; // freshly created above (or already tracked, if seen before) — kept as-is
      // Every OTHER mob getting wiped below is having its data discarded
      // outright (see the big comment above), not merged — treat that as
      // its own instance being "done" too, so a genuine later reappearance
      // of that same name gets a fresh generation number instead of
      // silently reusing this discarded one indefinitely.
      Object.keys(enc.mobs).forEach(function (n) {
        if (n !== name) resolveMobGeneration(state, n);
      });
      enc.mobName = name;
      // Reset the shared combined totals to reflect ONLY this boss's own
      // sub-ledger (bossRec.combatants/totalDamage/totalTaken — kept in
      // lockstep with every hit landed on/by this specific mob via
      // tallyMobHit(), regardless of whether it was the encounter's
      // "primary" identity yet) rather than blanking everything to zero.
      // Promotion almost always happens the INSTANT a mob is first
      // confirmed — before any of ITS OWN damage has been tallied at all,
      // so a plain zero was always correct then — but
      // EQP.reconsiderCurrentMob() can also trigger this retroactively,
      // well after the boss has already been accumulating damage as an
      // ordinary concurrent "add" (its own comment explains why). Zeroing
      // everything in that case would silently throw away every hit
      // already landed ON the boss itself too, not just the OTHER mobs'
      // damage this reset is actually meant to discard. (The per-ability
      // and per-pet breakdown for that pre-promotion window still can't
      // be recovered this way — the mob sub-ledger doesn't carry it — so
      // total damage/dps come back correct, but a combatant's own Deep
      // Dive ability list may undercount for whatever they did to this
      // mob before it became the primary identity. Retroactive promotion
      // itself is meant to be rare after the boss-list on-disk cache in
      // app.js — mostly a cold first-ever launch.)
      enc.combatants = {};
      Object.keys(bossRec.combatants || {}).forEach(function (cname) {
        var bc = bossRec.combatants[cname];
        enc.combatants[cname] = { name: cname, damage: bc.damage, hits: bc.hits, crits: bc.crits, misses: 0, pets: {}, abilities: {} };
      });
      enc.damageTaken = {};
      if (bossRec.totalTaken) {
        // No per-attacker split lives on the mob sub-record (see
        // blankMobRecord()'s comment) — fold it onto the same generic
        // bucket an unattributed incoming hit already uses rather than
        // lose it outright.
        enc.damageTaken["Unknown (DoT/spell)"] = { name: "Unknown (DoT/spell)", damage: bossRec.totalTaken, hits: 0 };
      }
      enc.totalDamage = bossRec.totalDamage;
      enc.totalTaken = bossRec.totalTaken || 0;
      enc.mobs = {};
      enc.mobs[name] = bossRec;
    }
  }

  // Re-checks every mob already confirmed within the CURRENT still-open
  // encounter against state.knownBossNames — for when that list finishes
  // loading (a network fetch in app.js/the browser overlay) AFTER a
  // fight already started and locked onto a non-boss mob (e.g. an add
  // pulled just before the boss showed up, or the whole app having just
  // launched with the boss list not back yet). Without this, a fight
  // that began before the boss list was ready stays stuck on the wrong
  // identity for its ENTIRE duration — considerMobIdentity() only ever
  // re-checks promotion at the moment a NEW mob name is first confirmed,
  // so a mob already sitting in enc.mobs never gets a second look once
  // more curated names become known. Callers should invoke this right
  // after updating state.knownBossNames. See "i killed vox again... and
  // still no popup to submit."
  function reconsiderCurrentMob(state) {
    if (!state.current) return;
    Object.keys(state.current.mobs).forEach(function (name) {
      considerMobIdentity(state, state.current, name);
    });
  }

  function ingest(state, ev) {
    if (!ev) return;

    if (ev.type === "unmatched") {
      state.unmatched.push(ev.raw);
      if (state.unmatched.length > state.maxUnmatched) state.unmatched.shift();
      return;
    }

    if (isCombatEvent(ev)) {
      if (!state.current || (ev.time - state.current.endTime) > state.gapMs) {
        closeEncounter(state);
        state.current = blankEncounter(ev.time, state.currentDifficulty, state.zoneKnown);
      }
      var enc = state.current;
      enc.endTime = ev.time;

      if (ev.type === "hit") {
        // Resolve source through the pet-fold *before* checking "did the
        // player touch this mob" — otherwise a pet's opening attack (which
        // logs under the pet's own raw name, e.g. "Dyremoon`s warder
        // hits...") never satisfies the literal `ev.source === "You"`
        // check below, so a brand-new encounter that starts with your pet
        // swinging first never gets its mobName set until your own "You"
        // line finally lands — every pet hit before that point silently
        // has no tracked mob to attribute against and gets dropped. See
        // resolveCombatant()'s pet-fold comment above.
        var resolvedSourceForIdentity = resolveCombatant(state, ev.source);
        if (resolvedSourceForIdentity === "You") considerMobIdentity(state, enc, ev.target);
        else if (ev.target === "You") considerMobIdentity(state, enc, ev.source);

        // Confirmed-hostile check now, instead of "is this literally
        // enc.mobName" — enc.mobs{} holds every mob considerMobIdentity()
        // has confirmed within this ONE continuous combat session, not
        // just the single primary one, so damage against a concurrent add
        // (a priest fought alongside Lady Vox, say) counts too instead of
        // silently vanishing. See "Add damage" / blankEncounter()'s mobs
        // comment.
        var dealtToMob = !!enc.mobs[ev.target];
        var dealtByMob = !!enc.mobs[ev.source];

        if (dealtToMob && !dealtByMob) {
          var resolvedSource = resolvedSourceForIdentity;
          var c = combatant(enc, resolvedSource);
          c.damage += ev.amount;
          c.hits += 1;
          var isCrit = ev.modifier && /crit/i.test(ev.modifier);
          if (isCrit) c.crits += 1;
          enc.totalDamage += ev.amount;
          // ev.source !== resolvedSource means this line just folded onto
          // its owner (a pet's own name, pre-fold) — keep a per-pet
          // sub-total (including the pet's OWN ability breakdown) so the
          // UI can show "how much of this was the pet, and from what" —
          // see combatant()'s comment — without touching the combined
          // number anything else reads.
          if (ev.source !== resolvedSource) {
            if (!c.pets[ev.source]) c.pets[ev.source] = { name: ev.source, damage: 0, hits: 0, crits: 0, abilities: {} };
            var petTotal = c.pets[ev.source];
            petTotal.damage += ev.amount;
            petTotal.hits += 1;
            if (isCrit) petTotal.crits += 1;
            tallyAbility(petTotal.abilities, abilityName(ev), ev.amount, isCrit);
          } else {
            // A direct (non-pet-folded) action — goes in this combatant's
            // own breakdown, which is what selfDamage above is the sum of.
            tallyAbility(c.abilities, abilityName(ev), ev.amount, isCrit);
          }
          // Only a hit that actually NAMES a spell/ability tells us
          // anything about who owns a DoT — a plain melee swing doesn't,
          // so it never overwrites this. Originally this checked
          // ev.nonMelee, but that flag is only true for the literal
          // "non-melee" damage-type string — a typed proc that still
          // names its caster ("...for 30 points of poison damage by
          // Blood Draw Strike.") has ev.nonMelee === false yet clearly
          // does name someone via ev.viaSpell, so it was being missed and
          // silently understating who a following unnamed tick should be
          // attributed to. See lastSpellCaster's comment in
          // blankEncounter() and the nonmelee branch below.
          if (ev.viaSpell) enc.lastSpellCaster = resolvedSource;
          // Per-mob breakdown — which SPECIFIC confirmed mob this hit
          // landed on, so Analysis can show dps per mob even though the
          // combined totals above no longer require it to be enc.mobName.
          tallyMobHit(enc.mobs[ev.target], resolvedSource, ev.amount, isCrit, ev.time);
          // "DPS over time" graph — only your own combined (self+pet)
          // output counts toward the "out" line, same as c.damage above.
          if (resolvedSource === "You") addBucket(enc.outBuckets, ev.time, ev.amount);
        } else if (dealtByMob) {
          var a = attacker(enc, resolveCombatant(state, ev.target));
          a.damage += ev.amount;
          a.hits += 1;
          enc.totalTaken += ev.amount;
          addBucket(enc.inBuckets, ev.time, ev.amount);
          var srcMobRec = enc.mobs[ev.source];
          srcMobRec.totalTaken += ev.amount;
          if (srcMobRec.startTime === null) srcMobRec.startTime = ev.time;
          srcMobRec.endTime = ev.time;
        }
        // else: a line involving neither "You" nor any confirmed mob (an
        // add that never got confirmed via a "You" line either way) —
        // skipped, not guessed at.
      } else if (ev.type === "nonmelee") {
        if (ev.target === "You") {
          var a2 = attacker(enc, "Unknown (DoT/spell)");
          a2.damage += ev.amount;
          a2.hits += 1;
          enc.totalTaken += ev.amount;
          addBucket(enc.inBuckets, ev.time, ev.amount);
        } else {
          considerMobIdentity(state, enc, ev.target);
          if (enc.mobs[ev.target]) {
            // EQ's own log doesn't name a caster on a recurring DoT tick,
            // so exact attribution genuinely isn't possible from this line
            // alone — but "whoever last landed a named spell hit on this
            // mob" is very likely still the same DoT still ticking, so use
            // that instead of a blanket "Unattributed" whenever it's known.
            // Solo mode still wins outright (nothing to guess when you're
            // the only possible source), and a tick before anyone's first
            // named spell hit still has no better answer than Unattributed.
            var who = state.soloMode ? "You" : (enc.lastSpellCaster || "Unattributed");
            var c2 = combatant(enc, who);
            c2.damage += ev.amount;
            c2.hits += 1;
            enc.totalDamage += ev.amount;
            if (who === "You") addBucket(enc.outBuckets, ev.time, ev.amount);
            // EQ's own log never names the caster OR the spell on a
            // recurring DoT tick, so there's no real ability name to give
            // this — bucketed generically rather than left out of the
            // abilities breakdown entirely (which would make its sum fall
            // short of this combatant's selfDamage in the Analysis window).
            tallyAbility(c2.abilities, "Unnamed DoT tick", ev.amount, false);
            tallyMobHit(enc.mobs[ev.target], who, ev.amount, false, ev.time);
          }
          // else: a DoT tick landing on a mob that's never been confirmed
          // via a "You" line either way — skipped, same reasoning as the
          // hit-event case above.
        }
      }
    } else if (ev.type === "death") {
      if (state.current) {
        state.current.endTime = ev.time;
        considerMobIdentity(state, state.current, ev.victim);
        // Any confirmed mob's own death gets recorded on its own per-mob
        // record — an add dying mid-fight is still worth showing as
        // "killed" in its own row of Analysis's per-mob breakdown, even
        // though (see below) only the PRIMARY mob's death actually ends
        // the whole encounter.
        var deadMobRec = state.current.mobs[ev.victim];
        if (deadMobRec) {
          deadMobRec.mobKilled = true;
          deadMobRec.mobKillCount += 1;
          deadMobRec.endTime = ev.time;
          // Resolve this name's generation on its own confirmed death,
          // ahead of closeEncounter()'s own catch-all for the (common)
          // case where this encounter still has other things going on
          // and won't close for a while yet — e.g. a curated boss fight
          // that runs long after this specific add died. NOTE: within
          // THIS SAME still-open encounter, a fresh same-named respawn
          // still folds into the SAME enc.mobs[name] bucket and keeps its
          // ORIGINAL generation number rather than rolling a new one —
          // its damage is already merging into that one running total
          // (same "same mob name" limitation documented on enc.mobs/
          // computeStats()'s byMob), so relabeling only the generation
          // number without splitting the totals would just be misleading.
          // A genuinely new number only ever shows up once THIS mob's
          // whole encounter closes and a later, separate encounter
          // confirms that name again.
          resolveMobGeneration(state, ev.victim);
        }
        // Only the tracked (primary) mob's own death ends the encounter —
        // an unrelated add dying mid-fight (very possible with adds active
        // alongside a boss) must not prematurely close out or mark
        // "killed" on a fight the actual boss is still very much in.
        if (state.current.mobName === ev.victim) {
          state.current.mobKilled = true;
          state.current.mobKillCount += 1;
          closeEncounter(state);
        }
      }
    } else if (ev.type === "zone") {
      state.zoneKnown = true;
      state.currentDifficulty = ev.difficulty;
    } else if (ev.type === "heal") {
      // Only tallied while a fight is actually in progress — a heal with
      // no encounter open (topping off between pulls) isn't a combat
      // stat worth tracking, and unlike a hit/nonmelee line a heal never
      // opens a new encounter or extends one's endTime by itself.
      if (state.current) {
        var healer = resolveCombatant(state, ev.source);
        var h = state.current.healers[healer] || (state.current.healers[healer] = { name: healer, amount: 0, hits: 0 });
        h.amount += ev.amount;
        h.hits += 1;
      }
    } else if (ev.type === "miss") {
      // Same attribution rules as a landed hit (dealtToMob/dealtByMob, pet
      // fold included, confirmed-mob check per the "Add damage" change
      // above rather than the single locked mobName) but tallied as a
      // miss on the same per-ability bucket instead of damage — see
      // tallyMiss() above and item 11. Only an outgoing miss against a
      // confirmed mob is tracked; the mob missing you is a different stat
      // ("survivability", not "your accuracy") that nothing here breaks
      // out per-ability today.
      if (state.current) {
        var encM = state.current;
        var resolvedMissSource = resolveCombatant(state, ev.source);
        var dealtToMobM = !!encM.mobs[ev.target];
        var dealtByMobM = !!encM.mobs[ev.source];
        if (dealtToMobM && !dealtByMobM) {
          var cM = combatant(encM, resolvedMissSource);
          var abNameM = (ev.verb && VERB_LABELS[ev.verb]) || "Melee";
          if (ev.source !== resolvedMissSource) {
            if (!cM.pets[ev.source]) cM.pets[ev.source] = { name: ev.source, damage: 0, hits: 0, crits: 0, abilities: {} };
            tallyMiss(cM.pets[ev.source].abilities, abNameM);
          } else {
            tallyMiss(cM.abilities, abNameM);
          }
        }
      }
    } else if (ev.type === "cast") {
      // Only ever "You" — see RE_CAST's comment (EQ doesn't log another
      // player's cast-start line). Attributed to whatever fight is
      // current, same "attribute to current" simplification healers/
      // damageTaken already use; a cast that completes just BEFORE the
      // resulting hit opens a brand-new encounter (very common — the cast
      // itself takes time, so it's still mid-air when the pull "starts")
      // has nowhere to land yet and is dropped, same tradeoff as every
      // other current-only bucket here.
      if (state.current) {
        var casterRow = combatant(state.current, "You");
        tallyCast(casterRow.abilities, ev.spell);
      }
    }
  }

  function durationSeconds(enc) {
    var d = (enc.endTime - enc.startTime) / 1000;
    return d > 0 ? d : 1;
  }

  // Sorts an abilities{} map into a display-ready array. `denom` is what
  // each ability's pct is relative to — the owning combatant/pet's OWN
  // damage (selfDamage or pet.damage), not the raid or encounter total,
  // so "this spell was 40% of my damage" reads correctly at every level.
  function abilitiesArray(bucket, dur, denom) {
    return Object.keys(bucket).map(function (name) {
      var a = bucket[name];
      return {
        name: a.name,
        damage: a.damage,
        hits: a.hits,
        crits: a.crits,
        misses: a.misses || 0,
        casts: a.casts || 0,
        dps: a.damage / dur,
        pct: denom > 0 ? (a.damage / denom) * 100 : 0
      };
    }).sort(function (a, b) { return b.damage - a.damage; });
  }

  // Sorts enc.healers{} into a display-ready array for the Analysis
  // window's Healing section — see the "heal" branch in ingest().
  function healersArray(bucket, dur) {
    return Object.keys(bucket).map(function (name) {
      var h = bucket[name];
      return { name: h.name, amount: h.amount, hits: h.hits, hps: h.amount / dur };
    }).sort(function (a, b) { return b.amount - a.amount; });
  }

  // Folds one abilities{} bucket's entries into a shared running total —
  // used to build the encounter-WIDE ability breakdown below (every
  // combatant's and every pet's damage, combined per named ability),
  // since the per-row abilities[] arrays computeStats() already returns
  // only ever cover one combatant (or one pet) at a time — see item 7.4
  // ("what is the total damage done by each spell? I don't see that").
  function mergeAbilities(dest, bucket) {
    Object.keys(bucket).forEach(function (name) {
      var a = bucket[name];
      var d = dest[name] || (dest[name] = { name: name, damage: 0, hits: 0, crits: 0, misses: 0, casts: 0 });
      d.damage += a.damage;
      d.hits += a.hits;
      d.crits += a.crits;
      d.misses += a.misses || 0;
      d.casts += a.casts || 0;
    });
  }

  function computeStats(enc) {
    var dur = durationSeconds(enc);
    var allAbilities = {};
    var rows = Object.keys(enc.combatants).map(function (name) {
      var c = enc.combatants[name];
      mergeAbilities(allAbilities, c.abilities || {});
      // Pet/self split — derived purely for display. c.damage (and this
      // row's own .damage below) stays the combined total everything else
      // already relies on; petDamage/selfDamage/pets/abilities are extra
      // fields a renderer can ignore entirely and get the old behavior
      // back.
      var petNames = Object.keys(c.pets || {});
      var petDamage = 0;
      var pets = petNames.map(function (pn) {
        var p = c.pets[pn];
        petDamage += p.damage;
        mergeAbilities(allAbilities, p.abilities || {});
        return {
          name: pn, damage: p.damage, hits: p.hits, crits: p.crits,
          dps: p.damage / dur, pct: c.damage > 0 ? (p.damage / c.damage) * 100 : 0,
          abilities: abilitiesArray(p.abilities || {}, dur, p.damage)
        };
      });
      pets.sort(function (a, b) { return b.damage - a.damage; });
      var selfDamage = c.damage - petDamage;
      return {
        name: name,
        damage: c.damage,
        hits: c.hits,
        crits: c.crits,
        dps: c.damage / dur,
        pct: enc.totalDamage > 0 ? (c.damage / enc.totalDamage) * 100 : 0,
        selfDamage: selfDamage,
        petDamage: petDamage,
        pets: pets,
        abilities: abilitiesArray(c.abilities || {}, dur, selfDamage)
      };
    });
    rows.sort(function (a, b) { return b.damage - a.damage; });
    // Per-mob breakdown — every mob actually confirmed within this fight
    // (enc.mobs, see blankEncounter()'s comment and "Add damage"), each
    // with its OWN damage/dps/duration and its own combatant rows, so
    // Analysis can show "what did I do to each target" even when several
    // were fought concurrently and their damage is already combined into
    // totalDamage/rows above. A mob's own duration is its own first-to-
    // last-hit window, not the whole encounter's — a short-lived add
    // shows a real dps number, not one diluted by the rest of the fight.
    var byMob = Object.keys(enc.mobs || {}).map(function (name) {
      var m = enc.mobs[name];
      var mdur = (m.startTime !== null && m.endTime !== null && m.endTime > m.startTime) ? (m.endTime - m.startTime) / 1000 : dur;
      if (mdur <= 0) mdur = 1;
      var mRows = Object.keys(m.combatants || {}).map(function (cname) {
        var mc = m.combatants[cname];
        return {
          name: cname,
          damage: mc.damage,
          hits: mc.hits,
          crits: mc.crits,
          dps: mc.damage / mdur,
          pct: m.totalDamage > 0 ? (mc.damage / m.totalDamage) * 100 : 0
        };
      });
      mRows.sort(function (a, b) { return b.damage - a.damage; });
      return {
        name: name,
        damage: m.totalDamage,
        dps: m.totalDamage / mdur,
        duration: mdur,
        mobKilled: !!m.mobKilled,
        mobKillCount: m.mobKillCount || 0,
        // Which spawn of this name, log-wide — see blankMobRecord()'s
        // comment. null on data from before this existed (never happens
        // in practice — every enc.mobs[] entry gets one the moment it's
        // created — but callers should still treat null/1 as "don't
        // bother showing a suffix," same as computeStats() itself doesn't
        // know these numbers changed shape between app versions).
        generation: m.generation || null,
        pct: enc.totalDamage > 0 ? (m.totalDamage / enc.totalDamage) * 100 : 0,
        // How much THIS mob dealt back to the group — melee only (see the
        // "dealtByMob" branch in ingest()); incoming non-melee/spell
        // damage doesn't reliably name its source in the log and isn't
        // attributed to a specific mob here (see RE_NONMELEE_FROM's own
        // "v1 doesn't break down damage taken by source" comment) — it
        // still counts in enc.totalTaken/computeTakenStats(), just not
        // split out per mob. Used by the Incoming tab's "Damage
        // breakdown" table.
        totalTaken: m.totalTaken || 0,
        takenDps: m.totalTaken ? m.totalTaken / mdur : 0,
        rows: mRows
      };
    });
    byMob.sort(function (a, b) { return b.damage - a.damage; });
    return {
      rows: rows,
      duration: dur,
      totalDamage: enc.totalDamage,
      raidDps: enc.totalDamage / dur,
      healing: healersArray(enc.healers || {}, dur),
      // Every combatant's + every pet's abilities, combined per named
      // ability — the whole-encounter view item 7.4 asked for, as
      // opposed to the per-row abilities[] above (one person/pet only).
      abilitiesTotal: abilitiesArray(allAbilities, dur, enc.totalDamage),
      byMob: byMob,
      // "DPS over time" graph — one entry per second of this fight, from
      // enc.startTime to enc.endTime inclusive, t = seconds elapsed (0 at
      // the first entry) so a renderer never has to know the underlying
      // absolute epoch seconds outBuckets/inBuckets are keyed by. Gaps
      // (seconds with no damage logged either way) come back as explicit
      // 0s rather than being skipped, so a line chart reads as a real
      // continuous timeline instead of silently compressing quiet
      // stretches. See blankEncounter()'s outBuckets/inBuckets comment.
      timeline: buildTimeline(enc)
    };
  }

  function buildTimeline(enc) {
    if (enc.startTime == null || enc.endTime == null || enc.endTime <= enc.startTime) return [];
    var startSec = Math.floor(enc.startTime / 1000);
    var endSec = Math.floor(enc.endTime / 1000);
    var out = enc.outBuckets || {};
    var inn = enc.inBuckets || {};
    var series = [];
    for (var s = startSec; s <= endSec; s++) {
      series.push({ t: s - startSec, out: out[s] || 0, in: inn[s] || 0 });
    }
    return series;
  }

  // Merges several already-finished (or the live) encounter objects into
  // ONE synthetic encounter with the same shape blankEncounter() produces,
  // so computeStats() can run on it completely unmodified. This is what
  // lets a continuous combat session spanning several back-to-back kills
  // (e.g. 4 trash mobs pulled together) be viewed and dps-averaged as ONE
  // combined fight, while each source encounter's own damage still lives
  // untouched in state.encounters for a per-target breakdown — see "I
  // dont want separate analytics per mob... I would like the dps average
  // for the entire fight" and the session-grouping in analysis.js/app.js
  // that calls this. Purely a display-time aggregation: it never changes
  // state.encounters itself or anything ingest() already decided.
  function mergeEncounters(encounters) {
    var merged = {
      startTime: null, endTime: 0, mobName: null, mobNames: [],
      mobKilled: false, mobKillCount: 0,
      combatants: {}, damageTaken: {}, totalDamage: 0, totalTaken: 0,
      difficulty: null, difficultyKnown: false, healers: {},
      // Per-mob breakdown, folded together across every source encounter
      // the same way combatants{} above is — so computeStats()'s byMob
      // reflects the WHOLE viewed session (every distinct target across
      // however many back-to-back kills AND however many were fought
      // concurrently within any one of them), not just one source
      // encounter's own confirmed mobs. See blankEncounter()'s mobs
      // comment and computeStats()'s byMob.
      mobs: {},
      // Keyed by absolute epoch second (see blankEncounter()'s comment),
      // so folding several source encounters together is just summing
      // same-keyed entries — a session's members never overlap in real
      // time, so there's no time-shifting to do here at all.
      outBuckets: {},
      inBuckets: {}
    };
    encounters.forEach(function (enc) {
      if (merged.startTime === null || enc.startTime < merged.startTime) merged.startTime = enc.startTime;
      if (enc.endTime > merged.endTime) merged.endTime = enc.endTime;
      merged.totalDamage += enc.totalDamage;
      merged.totalTaken += enc.totalTaken;
      merged.mobKillCount += enc.mobKillCount || 0;
      if (enc.mobKilled) merged.mobKilled = true;
      if (enc.mobName && merged.mobNames.indexOf(enc.mobName) === -1) merged.mobNames.push(enc.mobName);
      // Last-known difficulty wins — every member of one continuous pull
      // is virtually always the same tier anyway.
      if (enc.difficultyKnown) { merged.difficulty = enc.difficulty; merged.difficultyKnown = true; }
      Object.keys(enc.combatants || {}).forEach(function (name) {
        var c = enc.combatants[name];
        var m = merged.combatants[name] || (merged.combatants[name] = { name: name, damage: 0, hits: 0, crits: 0, misses: 0, pets: {}, abilities: {} });
        m.damage += c.damage; m.hits += c.hits; m.crits += c.crits; m.misses += c.misses || 0;
        mergeAbilities(m.abilities, c.abilities || {});
        Object.keys(c.pets || {}).forEach(function (pname) {
          var p = c.pets[pname];
          var mp = m.pets[pname] || (m.pets[pname] = { name: pname, damage: 0, hits: 0, crits: 0, abilities: {} });
          mp.damage += p.damage; mp.hits += p.hits; mp.crits += p.crits;
          mergeAbilities(mp.abilities, p.abilities || {});
        });
      });
      Object.keys(enc.damageTaken || {}).forEach(function (name) {
        var dt = enc.damageTaken[name];
        var m2 = merged.damageTaken[name] || (merged.damageTaken[name] = { name: name, damage: 0, hits: 0 });
        m2.damage += dt.damage; m2.hits += dt.hits;
      });
      Object.keys(enc.healers || {}).forEach(function (name) {
        var h = enc.healers[name];
        var mh = merged.healers[name] || (merged.healers[name] = { name: name, amount: 0, hits: 0 });
        mh.amount += h.amount; mh.hits += h.hits;
      });
      Object.keys(enc.mobs || {}).forEach(function (name) {
        var mrec = enc.mobs[name];
        var isNewMergedMob = !merged.mobs[name];
        var mm = merged.mobs[name] || (merged.mobs[name] = blankMobRecord(name));
        // The EARLIEST generation seen for this name within the merged
        // view — set once, at first creation, never overwritten by a
        // later source encounter. A session that happens to kill the same
        // name twice back-to-back (each its own raw encounter, each its
        // own generation number) still folds into ONE byMob entry for
        // that name either way (same as damage/kills already do) — this
        // just settles on "which spawn did this session's view of that
        // name START as" rather than showing a second, unrelated number
        // for the same combined row.
        if (isNewMergedMob) mm.generation = mrec.generation;
        if (mrec.startTime !== null && (mm.startTime === null || mrec.startTime < mm.startTime)) mm.startTime = mrec.startTime;
        if (mrec.endTime !== null && mrec.endTime > mm.endTime) mm.endTime = mrec.endTime;
        mm.totalDamage += mrec.totalDamage;
        mm.totalTaken += mrec.totalTaken || 0;
        mm.mobKillCount += mrec.mobKillCount || 0;
        if (mrec.mobKilled) mm.mobKilled = true;
        Object.keys(mrec.combatants || {}).forEach(function (cname) {
          var cc = mrec.combatants[cname];
          var mcc = mm.combatants[cname] || (mm.combatants[cname] = { name: cname, damage: 0, hits: 0, crits: 0 });
          mcc.damage += cc.damage; mcc.hits += cc.hits; mcc.crits += cc.crits;
        });
      });
      Object.keys(enc.outBuckets || {}).forEach(function (b) {
        merged.outBuckets[b] = (merged.outBuckets[b] || 0) + enc.outBuckets[b];
      });
      Object.keys(enc.inBuckets || {}).forEach(function (b) {
        merged.inBuckets[b] = (merged.inBuckets[b] || 0) + enc.inBuckets[b];
      });
    });
    // The display-facing "what did I fight" label — the one name if it
    // was a single target, else every distinct name joined, so a session
    // list/header can read honestly as "a noxious spider, a cave bat"
    // instead of just whichever target happened to be locked last.
    merged.mobName = merged.mobNames.length <= 1 ? (merged.mobNames[0] || null) : merged.mobNames.join(", ");
    return merged;
  }

  function computeTakenStats(enc) {
    var dur = durationSeconds(enc);
    var rows = Object.keys(enc.damageTaken).map(function (name) {
      var a = enc.damageTaken[name];
      return { name: a.name, damage: a.damage, hits: a.hits, dps: a.damage / dur };
    });
    rows.sort(function (x, y) { return y.damage - x.damage; });
    return { rows: rows, totalTaken: enc.totalTaken };
  }

  var EQP = {
    parseLine: parseLine,
    parseTimestamp: parseTimestamp,
    newState: newState,
    ingest: ingest,
    closeEncounter: closeEncounter,
    checkTimeout: checkTimeout,
    computeStats: computeStats,
    computeTakenStats: computeTakenStats,
    durationSeconds: durationSeconds,
    mergeEncounters: mergeEncounters,
    reconsiderCurrentMob: reconsiderCurrentMob
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = EQP;
  } else {
    root.EQP = EQP;
  }
})(typeof window !== "undefined" ? window : this);
