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
    "shoot", "shoots", "burn", "burns", "gouge", "gouges"
  ].sort(function (a, b) { return b.length - a.length; }); // longest-first

  var VERB_ALT = MELEE_VERBS.join("|");

  var RE_TIMESTAMP = /^\[(\w{3} \w{3} \d{1,2} \d{2}:\d{2}:\d{2} \d{4})\]\s?(.*)$/;

  // Group 5 = "non-melee " when a direct-damage spell names its caster
  // ("Fizmo hits a rat_snake for 156 points of non-melee damage."); absent
  // for ordinary melee. Group 6 = an optional (Critical)/(Flurry)/etc tag.
  var RE_MELEE = new RegExp(
    "^(.+?) (" + VERB_ALT + ") (.+?) for (\\d+) points? of (non-melee )?damage\\.(?:\\s*\\((.+?)\\))?\\s*$"
  );

  var RE_MISS = new RegExp(
    "^(.+?) tr(?:y|ies) to (?:" + VERB_ALT + ") (.+?), but (.+?)!?\\s*$"
  );

  var RE_NONMELEE = /^(.+?) (?:have|has) taken (\d+) points? of (non-melee|falling) damage\.\s*$/;

  // Direct-damage spells that DO name a caster read exactly like RE_MELEE
  // ("Fizmo hit a rat_snake for 156 points of non-melee damage.") so
  // RE_MELEE is tried first; RE_NONMELEE only catches the unattributed
  // DoT-tick form ("A rat_snake has taken 22 points of non-melee damage.").

  var RE_HEAL_OTHER = /^(.+?) (?:have|has) been healed for (\d+) points?(?: of damage)? by (.+?)\.?\s*$/i;
  var RE_HEAL_SELF = /^You have been healed for (\d+) points? by (.+?)\.?\s*$/i;

  var RE_SLAIN_BY = /^(.+?) has been slain by (.+?)!\s*$/;
  var RE_YOU_SLAIN = /^You have (?:been slain by|died)\.?\s*(.*)$/;
  var RE_YOU_SLAY = /^You have slain (.+?)!\s*$/;

  var RE_ZONE = /^You have entered (.+?)\.\s*$/;

  var INTERESTING_HINT = /damage|slain|healed|died/i;

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
        nonMelee: !!mm[5],
        modifier: mm[6] || null,
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
    if ((mm = RE_MISS.exec(rest))) {
      return { time: time, type: "miss", source: canon(mm[1]) === "You" ? "You" : canon(mm[1]), target: canon(mm[2]), raw: raw };
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
      return { time: time, type: "zone", zone: mm[1], raw: raw };
    }
    if (INTERESTING_HINT.test(rest)) {
      return { time: time, type: "unmatched", raw: raw };
    }
    return null;
  }

  // ---- session/encounter state machine -----------------------------------

  function newState(opts) {
    opts = opts || {};
    return {
      encounters: [],
      current: null,
      unmatched: [],
      soloMode: !!opts.soloMode,
      gapMs: (opts.gapSeconds || 9) * 1000,
      maxUnmatched: opts.maxUnmatched || 40
    };
  }

  function blankEncounter(startTime) {
    return {
      startTime: startTime,
      endTime: startTime,
      mobName: null,
      mobKilled: false,
      combatants: {}, // name -> {damage, hits, crits, misses} — damage DEALT to the mob
      damageTaken: {}, // name -> {damage, hits} — damage the mob (or adds) dealt to the group
      totalDamage: 0,
      totalTaken: 0
    };
  }

  function combatant(enc, name) {
    if (!enc.combatants[name]) {
      enc.combatants[name] = { name: name, damage: 0, hits: 0, crits: 0, misses: 0 };
    }
    return enc.combatants[name];
  }

  function attacker(enc, name) {
    if (!enc.damageTaken[name]) {
      enc.damageTaken[name] = { name: name, damage: 0, hits: 0 };
    }
    return enc.damageTaken[name];
  }

  // Ends the current encounter (if any) and files it into history.
  function closeEncounter(state) {
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
        state.current = blankEncounter(ev.time);
      }
      var enc = state.current;
      enc.endTime = ev.time;

      if (ev.type === "hit") {
        // Establish the encounter's mob identity from the first line that
        // involves "You" — everything else is classified against it.
        if (!enc.mobName) {
          if (ev.source === "You") enc.mobName = ev.target;
          else if (ev.target === "You") enc.mobName = ev.source;
        }

        var dealtToMob = ev.target === enc.mobName ||
          (enc.mobName === null && ev.source === "You");
        var dealtByMob = ev.source === enc.mobName;

        if (dealtToMob && !dealtByMob) {
          var c = combatant(enc, ev.source);
          c.damage += ev.amount;
          c.hits += 1;
          if (ev.modifier && /crit/i.test(ev.modifier)) c.crits += 1;
          enc.totalDamage += ev.amount;
        } else if (dealtByMob) {
          var a = attacker(enc, ev.target);
          a.damage += ev.amount;
          a.hits += 1;
          enc.totalTaken += ev.amount;
        }
        // else: a line involving neither "You" nor the established mob
        // (e.g. an unrelated add) — skipped in v1 rather than guessed at.
      } else if (ev.type === "nonmelee") {
        var targetIsMob = ev.target === enc.mobName || (!enc.mobName && ev.target !== "You");
        if (ev.target === "You") {
          var a2 = attacker(enc, "Unknown (DoT/spell)");
          a2.damage += ev.amount;
          a2.hits += 1;
          enc.totalTaken += ev.amount;
        } else if (targetIsMob) {
          if (!enc.mobName) enc.mobName = ev.target;
          var who = state.soloMode ? "You" : "Unattributed";
          var c2 = combatant(enc, who);
          c2.damage += ev.amount;
          c2.hits += 1;
          enc.totalDamage += ev.amount;
        }
      }
    } else if (ev.type === "death") {
      if (state.current) {
        state.current.endTime = ev.time;
        if (!state.current.mobName || state.current.mobName === ev.victim) {
          state.current.mobName = ev.victim;
        }
        if (ev.killer !== "You" && state.current.combatants[ev.killer] === undefined) {
          // a player/pet name landed the kill line — fine, no-op
        }
        state.current.mobKilled = true;
        closeEncounter(state);
      }
    }
    // heal / zone / miss: not used for damage math in v1, safe to ignore here.
  }

  function durationSeconds(enc) {
    var d = (enc.endTime - enc.startTime) / 1000;
    return d > 0 ? d : 1;
  }

  function computeStats(enc) {
    var dur = durationSeconds(enc);
    var rows = Object.keys(enc.combatants).map(function (name) {
      var c = enc.combatants[name];
      return {
        name: name,
        damage: c.damage,
        hits: c.hits,
        crits: c.crits,
        dps: c.damage / dur,
        pct: enc.totalDamage > 0 ? (c.damage / enc.totalDamage) * 100 : 0
      };
    });
    rows.sort(function (a, b) { return b.damage - a.damage; });
    return { rows: rows, duration: dur, totalDamage: enc.totalDamage, raidDps: enc.totalDamage / dur };
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
    durationSeconds: durationSeconds
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = EQP;
  } else {
    root.EQP = EQP;
  }
})(typeof window !== "undefined" ? window : this);
