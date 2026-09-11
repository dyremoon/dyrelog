/* Shared combat parser and statistics engine; no DOM access. */
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
  ].sort(function (a, b) { return b.length - a.length; });

  var VERB_ALT = MELEE_VERBS.join("|");

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

  var RE_MELEE = new RegExp(
    "^(.+?) (" + VERB_ALT + ") (.+?) for (\\d+) points? of (\\S+ )?damage(?: by (.+?))?\\.(?:\\s*\\((.+?)\\))?\\s*$"
  );

  var RE_MISS = new RegExp(
    "^(.+?) tr(?:y|ies) to (" + VERB_ALT + ") (.+?), but (.+?)!?\\s*$"
  );

  var RE_CAST = /^You begin casting (.+?)\.\s*$/;

  var RE_NONMELEE = /^(.+?) (?:have|has) taken (\d+) points? of (non-melee|falling) damage\.\s*$/;

  var RE_NONMELEE_FROM = /^(.+?) (?:have|has) taken (\d+) (?:points? of )?damage from (.+?)\.?\s*$/i;

  var RE_THORNS = /^(.+?) (?:is|are) \w+ by (?:(.+?)'s|your) (?:thorns|flames|spikes|retaliation) for (\d+) points? of (?:non-melee )?damage[.!]?\s*$/i;

  var RE_HEAL_OTHER = /^(.+?) (?:have|has) been healed for (\d+) points?(?: of damage)? by (.+?)\.?\s*$/i;
  var RE_HEAL_SELF = /^You have been healed for (\d+) points? by (.+?)\.?\s*$/i;

  var RE_SLAIN_BY = /^(.+?) has been slain by (.+?)!\s*$/;
  var RE_YOU_SLAIN = /^You have (?:been slain by|died)\.?\s*(.*)$/;
  var RE_YOU_SLAY = /^You have slain (.+?)!\s*$/;

  var ZONE_DIFFICULTY_LABELS = { Awakened: "D1", Adaptive: "D2", Fused: "D3", Refined: "D4" };
  var RE_ZONE = /^You have entered (.+?)(?:\s*\((Awakened|Adaptive|Fused|Refined)\))?\.\s*$/;

  var INTERESTING_HINT = /damage|slain|healed|died/i;

  // Possessive pet names identify the owner; named summons require separate ownership evidence.
  var RE_PET_OWNER = /^(.+?)[`']s\s+\S+$/;

  function parsePetOwnership(raw) {
    var stamp = RE_TIMESTAMP.exec(raw.replace(/\r$/, ""));
    if (!stamp) return null;
    var match = /^([A-Za-z]+) told you, 'Attacking (.+) Master\.'$/.exec(stamp[2]);
    var time = parseTimestamp(stamp[1]);
    if (!match || time === null) return null;
    return { type: "petOwnership", petName: match[1], ownerName: "You",
      confidence: 100, source: "direct-attack-response", learnedAt: time,
      time: time, selfInvolved: true, raw: raw.replace(/\r$/, "") };
  }

  function petKey(name) { return String(name || "").trim().toLowerCase(); }
  function petOwner(state, name) {
    var explicit = RE_PET_OWNER.exec(name || "");
    var known = state.petOwners.get(petKey(name));
    return explicit ? explicit[1] : known ? known.ownerName : null;
  }

  function privateField(enc, key, initial) {
    if (!enc[key]) Object.defineProperty(enc, key, { value: initial, writable: true });
    return enc[key];
  }
  function pendingHits(enc) { return privateField(enc, "_pendingPetHits", []); }
  function anonymousTicks(enc) { return privateField(enc, "_anonymousPetTicks", []); }
  function sourceBuckets(enc, name) {
    var all = privateField(enc, "_sourceBuckets", Object.create(null));
    return all[name] || (all[name] = {});
  }
  function rememberUnresolved(state, enc, name) {
    if (!name || resolveCombatant(state, name) === "You" || petOwner(state, name)) return;
    var key = petKey(name);
    if (!state.pendingPetEncounters.has(key)) state.pendingPetEncounters.set(key, new Set());
    state.pendingPetEncounters.get(key).add(enc);
  }
  function moveCounts(bucket, from, to, fields) {
    var old = bucket[from];
    if (!old || from === to) return;
    var dest = bucket[to] || (bucket[to] = { name: to });
    fields.forEach(function (field) { dest[field] = (dest[field] || 0) + (old[field] || 0); });
    delete bucket[from];
  }
  function transferPetDamage(state, enc, evidence) {
    var key = petKey(evidence.petName);
    var owner = resolveCombatant(state, evidence.petName);
    var moved = 0;
    Object.keys(enc.combatants).filter(function (name) { return petKey(name) === key && name !== owner; }).forEach(function (name) {
      var old = enc.combatants[name];
      if (Object.keys(old.pets || {}).length) return;
      anonymousTicks(enc).filter(function (tick) { return tick.source === name; }).forEach(function (tick) {
        old.damage -= tick.amount; old.hits -= 1;
        var ab = old.abilities["Unnamed DoT tick"];
        if (ab) { ab.damage -= tick.amount; ab.hits -= 1; }
        var unknown = combatant(enc, "Unattributed");
        unknown.damage += tick.amount; unknown.hits += 1;
        tallyAbility(unknown.abilities, "Unnamed DoT tick", tick.amount, false);
        var mob = enc.mobs[tick.target];
        if (mob && mob.combatants[name]) {
          mob.combatants[name].damage -= tick.amount; mob.combatants[name].hits -= 1;
          var u = mob.combatants.Unattributed || (mob.combatants.Unattributed = { name: "Unattributed", damage: 0, hits: 0, crits: 0 });
          u.damage += tick.amount; u.hits += 1;
        }
      });
      enc._anonymousPetTicks = anonymousTicks(enc).filter(function (tick) { return tick.source !== name; });
      var dest = combatant(enc, owner);
      var pet = dest.pets[name] || (dest.pets[name] = { name: name, damage: 0, hits: 0, crits: 0, abilities: {} });
      ["damage", "hits", "crits"].forEach(function (field) {
        dest[field] += old[field]; pet[field] += old[field];
      });
      mergeAbilities(pet.abilities, old.abilities);
      moved += old.damage;
      delete enc.combatants[name];
      Object.keys(enc.mobs).forEach(function (mob) {
        moveCounts(enc.mobs[mob].combatants, name, owner, ["damage", "hits", "crits"]);
      });
      if (owner === "You") {
        var buckets = sourceBuckets(enc, name);
        Object.keys(buckets).forEach(function (second) { enc.outBuckets[second] = (enc.outBuckets[second] || 0) + buckets[second]; });
      }
      moveCounts(enc.damageTaken, name, owner, ["damage", "hits"]);
      moveCounts(enc.healers, name, owner, ["amount", "hits"]);
    });
    var recover = pendingHits(enc).filter(function (hit) { return petKey(hit.source) === key; });
    enc._pendingPetHits = pendingHits(enc).filter(function (hit) { return petKey(hit.source) !== key; });
    if (recover.length) {
      var end = enc.endTime;
      var before = enc.totalDamage;
      var replay = Object.create(state);
      replay.current = enc; replay.gapMs = Infinity; replay.encounters = [];
      recover.forEach(function (hit) { ingest(replay, hit); });
      enc.endTime = end;
      moved += enc.totalDamage - before;
    }
    if (evidence.raw && !(enc.petEvidence || []).includes(evidence.raw)) {
      (enc.petEvidence || (enc.petEvidence = [])).push(evidence.raw);
    }
    enc.petAttributionRevision = (enc.petAttributionRevision || 0) + 1;
    return moved;
  }
  function assignPetOwner(state, evidence) {
    if (!evidence || !evidence.petName || !evidence.ownerName || evidence.confidence !== 100) return false;
    var key = petKey(evidence.petName);
    var old = state.petOwners.get(key);
    // Never let a conflicting equal/weaker signal redirect an established pet.
    if (old) return petKey(old.ownerName) === petKey(evidence.ownerName);
    var owned = RE_PET_OWNER.exec(evidence.petName);
    if (owned || key === "you" || key === petKey(state.characterName) || key === petKey(evidence.ownerName)) return false;
    var pending = state.pendingPetEncounters.get(key);
    if (pending && Array.from(pending).some(function (enc) {
      return Object.keys(enc.combatants).some(function (name) {
        return petKey(name) === key && Object.keys(enc.combatants[name].pets || {}).length;
      });
    })) return false;
    state.petOwners.set(key, Object.assign({}, evidence));
    state.knownPlayerNames.add(evidence.petName);
    state.knownPlayerNames.add(resolveCombatant(state, evidence.petName));
    var moved = 0;
    if (pending) pending.forEach(function (enc) {
      if (enc.startTime <= (state.petDeaths.get(key) || -Infinity)) return;
      moved += transferPetDamage(state, enc, evidence);
      if (enc !== state.current && enc.totalDamage > 0 && !state.encounters.includes(enc)) {
        state.encounters.push(enc);
        state.encounters.sort(function (a, b) { return a.startTime - b.startTime; });
      }
    });
    state.pendingPetEncounters.delete(key);
    if (state.onPetOwnership) state.onPetOwnership({ petName: evidence.petName,
      ownerName: evidence.ownerName === "You" ? state.characterName || "You" : evidence.ownerName,
      source: evidence.source, learnedAt: evidence.learnedAt, reassignedDamage: moved });
    return true;
  }

  function encounterRawText(enc, lines) {
    var prefix = [], suffix = [];
    (enc.petEvidence || []).forEach(function (raw) {
      var ev = parsePetOwnership(raw);
      if (!ev || lines.includes(raw)) return;
      if (ev.time < enc.startTime - 2000) prefix.push(raw);
      else if (ev.time > enc.endTime + 2000) suffix.push(raw);
    });
    return prefix.concat(lines, suffix).join("\n");
  }

  function resolveCombatant(state, name) {
    if (!name) return name;
    var owner = petOwner(state, name) || name;
    if (state.characterName && petKey(owner) === petKey(state.characterName)) return "You";
    return owner;
  }

  function canon(name) {
    if (!name) return name;
    var lower = name.charAt(0).toLowerCase() + name.slice(1);
    return /^(a |an |the )/.test(lower) ? lower : name;
  }

  function parseTimestamp(s) {
    var t = Date.parse(s);
    return isNaN(t) ? null : t;
  }

  function parseLine(raw) {
    var ownership = parsePetOwnership(raw);
    if (ownership) return ownership;
    // Strip CRLF carriage returns before matching timestamped log lines.
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
        return {
          time: time, type: "nonmelee",
          source: null, target: "You",
          amount: parseInt(mm[2], 10),
          kind: "proc",
          raw: raw
        };
      }
      var tagMatch = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(mm[3]);
      var attribution = (tagMatch ? tagMatch[1] : mm[3]).replace(/\.\s*$/, "");
      var criticalTag = tagMatch ? tagMatch[2] : null;
      var possessive = /^(.+?)'s\s+/.exec(attribution);
      var byClause = /^(.+?)\s+by\s+(.+)$/i.exec(attribution);
      if (/^your\b/i.test(attribution) || possessive || byClause) {
        var src2 = /^your\b/i.test(attribution) ? "You"
          : possessive ? canon(possessive[1]) : canon(byClause[2]);
        return {
          time: time, type: "hit",
          source: src2, target: tgt2,
          amount: parseInt(mm[2], 10),
          nonMelee: true,
          damageType: null,
          viaSpell: attribution,
          modifier: criticalTag,
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
      var owner = mm[2];
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
        verb: mm[2],
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


  function newState(opts) {
    opts = opts || {};
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
      knownPlayerNames: new Set(),
      characterName: opts.characterName || null,
      petOwners: new Map(),
      petDeaths: new Map(),
      pendingPetEncounters: new Map(),
      onPetOwnership: typeof opts.onPetOwnership === "function" ? opts.onPetOwnership : null,
      currentDifficulty: null,
      zoneKnown: false,
      // Spawn generations identify separate occurrences of a mob name across encounters.
      mobGenerations: {}
    };
  }

  function blankEncounter(startTime, difficulty, difficultyKnown) {
    return {
      startTime: startTime,
      endTime: startTime,
      mobName: null,
      mobKilled: false,
      mobKillCount: 0,
      combatants: {},
      damageTaken: {},
      totalDamage: 0,
      totalTaken: 0,
      difficulty: difficulty || null,
      difficultyKnown: !!difficultyKnown,
      healers: {},
      lastSpellCaster: null,
      mobs: {},
      outBuckets: {},
      inBuckets: {}
    };
  }

  function addBucket(map, timeMs, amount) {
    var b = Math.floor(timeMs / 1000);
    map[b] = (map[b] || 0) + amount;
  }

  function combatant(enc, name) {
    if (!enc.combatants[name]) {
      enc.combatants[name] = { name: name, damage: 0, hits: 0, crits: 0, misses: 0, pets: {}, abilities: {} };
    }
    return enc.combatants[name];
  }

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
    // "Envenomed Bolt VI by Stoten" -> "Envenomed Bolt VI" (the "by <name>" case above).
    var m3 = /^(.+?)\s+by\s+.+$/i.exec(ev.viaSpell);
    if (m3) return m3[1];
    return ev.viaSpell;
  }

  function tallyAbility(bucket, abName, amount, isCrit) {
    var ab = bucket[abName] || (bucket[abName] = { name: abName, damage: 0, hits: 0, crits: 0, misses: 0, casts: 0 });
    ab.damage += amount;
    ab.hits += 1;
    if (isCrit) ab.crits += 1;
  }

  function tallyMiss(bucket, abName) {
    var ab = bucket[abName] || (bucket[abName] = { name: abName, damage: 0, hits: 0, crits: 0, misses: 0, casts: 0 });
    ab.misses += 1;
  }

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

  function closeEncounter(state) {
    if (state.current) {
      Object.keys(state.current.mobs || {}).forEach(function (name) {
        resolveMobGeneration(state, name);
      });
    }
    if (state.current && state.current.totalDamage > 0) {
      state.encounters.push(state.current);
    }
    state.current = null;
  }

  function checkTimeout(state, nowTime) {
    if (state.current && (nowTime - state.current.endTime) > state.gapMs) {
      closeEncounter(state);
    }
  }

  function isCombatEvent(ev) {
    return ev.type === "hit" || ev.type === "nonmelee";
  }

  function blankMobRecord(name) {
    return {
      name: name,
      startTime: null,
      endTime: null,
      totalDamage: 0,
      totalTaken: 0,
      mobKilled: false,
      mobKillCount: 0,
      generation: null,
      combatants: {}
    };
  }

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

  function tallyMobHit(mobRec, name, amount, isCrit, time) {
    mobRec.totalDamage += amount;
    if (mobRec.startTime === null || time < mobRec.startTime) mobRec.startTime = time;
    if (mobRec.endTime === null || time > mobRec.endTime) mobRec.endTime = time;
    var mc = mobRec.combatants[name] || (mobRec.combatants[name] = { name: name, damage: 0, hits: 0, crits: 0 });
    mc.damage += amount;
    mc.hits += 1;
    if (isCrit) mc.crits += 1;
  }

  function stripTierSuffix(name) {
    return name ? name.replace(/\s*\+\d+\s*$/, "") : name;
  }
  function isKnownBossName(state, name) {
    if (!state.knownBossNames || !name) return false;
    return state.knownBossNames.has(name) || state.knownBossNames.has(stripTierSuffix(name));
  }

  function considerMobIdentity(state, enc, name) {
    if (!name) return;
    if (!enc.mobs[name]) {
      enc.mobs[name] = blankMobRecord(name);
      // Spawn generations identify separate occurrences of a mob name across encounters.
      enc.mobs[name].generation = assignMobGeneration(state, name);
    }
    if (enc.mobName === name) return;
    if (!enc.mobName) {
      enc.mobName = name;
      return;
    }
    var nameIsBoss = isKnownBossName(state, name);
    var currentIsBoss = isKnownBossName(state, enc.mobName);
    if (nameIsBoss && !currentIsBoss) {
      var bossRec = enc.mobs[name];





      Object.keys(enc.mobs).forEach(function (n) {
        if (n !== name) resolveMobGeneration(state, n);
      });
      enc.mobName = name;
      enc.combatants = {};
      if (enc._sourceBuckets) enc._sourceBuckets = Object.create(null);
      if (enc._anonymousPetTicks) enc._anonymousPetTicks = [];
      if (enc._pendingPetHits) enc._pendingPetHits = enc._pendingPetHits.filter(function (hit) { return hit.target === name; });
      Object.keys(bossRec.combatants || {}).forEach(function (cname) {
        var bc = bossRec.combatants[cname];
        enc.combatants[cname] = { name: cname, damage: bc.damage, hits: bc.hits, crits: bc.crits, misses: 0, pets: {}, abilities: {} };
      });
      enc.damageTaken = {};
      if (bossRec.totalTaken) {
        // The mob ledger has no incoming attacker breakdown, so preserve its total in an unknown-source bucket.
        enc.damageTaken["Unknown (DoT/spell)"] = { name: "Unknown (DoT/spell)", damage: bossRec.totalTaken, hits: 0 };
      }
      enc.totalDamage = bossRec.totalDamage;
      enc.totalTaken = bossRec.totalTaken || 0;
      enc.mobs = {};
      enc.mobs[name] = bossRec;
    }
  }

  function reconsiderCurrentMob(state) {
    if (!state.current) return;
    Object.keys(state.current.mobs).forEach(function (name) {
      considerMobIdentity(state, state.current, name);
    });
  }

  function ingest(state, ev) {
    if (!ev) return;

    if (ev.type === "petOwnership") {
      assignPetOwner(state, ev);
      return;
    }

    if (ev.type === "unmatched") {
      state.unmatched.push(ev.raw);
      if (state.unmatched.length > state.maxUnmatched) state.unmatched.shift();
      return;
    }

    if (isCombatEvent(ev)) {
      if (!state.current || (ev.time - state.current.endTime) > state.gapMs) {
        closeEncounter(state);
        // Without ownership evidence, matching names in separate fights may
        // be different summons. Only revisit the current/latest encounter;
        // established ownership itself continues across encounter boundaries.
        state.pendingPetEncounters.clear();
        state.current = blankEncounter(ev.time, state.currentDifficulty, state.zoneKnown);
        state.current.petEvidence = Array.from(state.petOwners.values()).map(function (p) { return p.raw; }).filter(Boolean);
      }
      var enc = state.current;
      enc.endTime = ev.time;

      if (ev.type === "hit") {
        var resolvedSourceForIdentity = resolveCombatant(state, ev.source);
        if (resolvedSourceForIdentity === "You") considerMobIdentity(state, enc, ev.target);
        else if (resolveCombatant(state, ev.target) === "You") considerMobIdentity(state, enc, ev.source);

        var dealtToMob = !!enc.mobs[ev.target];
        var dealtByMob = !!enc.mobs[ev.source];

        if (dealtToMob && !dealtByMob) {
          var resolvedSource = resolvedSourceForIdentity;
          // Dealt real damage to a confirmed mob => definitely a player
          // (or their pet, folded), never a mob itself — see
          // state.knownPlayerNames' own comment above.
          state.knownPlayerNames.add(resolvedSource);
          state.knownPlayerNames.add(ev.source);
          var c = combatant(enc, resolvedSource);
          c.damage += ev.amount;
          addBucket(sourceBuckets(enc, ev.source), ev.time, ev.amount);
          c.hits += 1;
          var isCrit = ev.modifier && /crit/i.test(ev.modifier);
          if (isCrit) c.crits += 1;
          enc.totalDamage += ev.amount;
          if (petOwner(state, ev.source)) {
            if (!c.pets[ev.source]) c.pets[ev.source] = { name: ev.source, damage: 0, hits: 0, crits: 0, abilities: {} };
            var petTotal = c.pets[ev.source];
            petTotal.damage += ev.amount;
            petTotal.hits += 1;
            if (isCrit) petTotal.crits += 1;
            tallyAbility(petTotal.abilities, abilityName(ev), ev.amount, isCrit);
          } else {
            tallyAbility(c.abilities, abilityName(ev), ev.amount, isCrit);
          }
          if (ev.nonMelee || ev.viaSpell) enc.lastSpellCaster = ev.source;
          tallyMobHit(enc.mobs[ev.target], resolvedSource, ev.amount, isCrit, ev.time);
          // "DPS over time" graph — only your own combined (self+pet)
          // output counts toward the "out" line, same as c.damage above.
          if (resolvedSource === "You") addBucket(enc.outBuckets, ev.time, ev.amount);
          rememberUnresolved(state, enc, ev.source);
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
        } else if (!petOwner(state, ev.source) && resolvedSourceForIdentity !== "You") {
          // Preserve only until evidence identifies this attacker. These
          // events have not contributed to any damage ledger yet.
          rememberUnresolved(state, enc, ev.source);
          pendingHits(enc).push(ev);
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
        } else if (state.knownPlayerNames.has(ev.target)) {
        } else {
          considerMobIdentity(state, enc, ev.target);
          if (enc.mobs[ev.target]) {
            var rawWho = state.soloMode ? "You" : (enc.lastSpellCaster || null);
            var who = rawWho ? resolveCombatant(state, rawWho) : "Unattributed";
            if ((rawWho && petOwner(state, rawWho)) || (enc.combatants[who] && enc.combatants[who].pets && Object.keys(enc.combatants[who].pets).length)) {
              who = "Unattributed";
              rawWho = null;
            }
            var c2 = combatant(enc, who);
            if (rawWho && who !== "You" && !petOwner(state, rawWho)) {
              rememberUnresolved(state, enc, rawWho);
              anonymousTicks(enc).push({ source: rawWho, target: ev.target, amount: ev.amount, time: ev.time });
            }
            c2.damage += ev.amount;
            c2.hits += 1;
            enc.totalDamage += ev.amount;
            if (who === "You") addBucket(enc.outBuckets, ev.time, ev.amount);
            if (rawWho && petOwner(state, rawWho)) {
              if (!c2.pets[rawWho]) c2.pets[rawWho] = { name: rawWho, damage: 0, hits: 0, crits: 0, abilities: {} };
              var petTick = c2.pets[rawWho];
              petTick.damage += ev.amount;
              petTick.hits += 1;
              tallyAbility(petTick.abilities, "Unnamed DoT tick", ev.amount, false);
            } else {
              tallyAbility(c2.abilities, "Unnamed DoT tick", ev.amount, false);
            }
            tallyMobHit(enc.mobs[ev.target], who, ev.amount, false, ev.time);
          }
          // else: a DoT tick landing on a mob that's never been confirmed
          // via a "You" line either way — skipped, same reasoning as the
          // hit-event case above.
        }
      }
    } else if (ev.type === "death") {
      var deadPetKey = petKey(ev.victim);
      state.petDeaths.set(deadPetKey, ev.time);
      if (state.petOwners.has(deadPetKey)) {
        state.petOwners.delete(deadPetKey);
        state.pendingPetEncounters.delete(deadPetKey);
        return; // A verified pet's death must not create a hostile mob.
      }
      // A later reuse of a name cannot claim damage from its previous life.
      state.pendingPetEncounters.delete(deadPetKey);
      if (state.current) {
        state.current.endTime = ev.time;
        considerMobIdentity(state, state.current, ev.victim);
        var deadMobRec = state.current.mobs[ev.victim];
        if (deadMobRec) {
          deadMobRec.mobKilled = true;
          deadMobRec.mobKillCount += 1;
          deadMobRec.endTime = ev.time;
          resolveMobGeneration(state, ev.victim);
        }
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
      if (state.current) {
        var healer = resolveCombatant(state, ev.source);
        var h = state.current.healers[healer] || (state.current.healers[healer] = { name: healer, amount: 0, hits: 0 });
        h.amount += ev.amount;
        h.hits += 1;
      }
    } else if (ev.type === "miss") {
      if (state.current) {
        var encM = state.current;
        var resolvedMissSource = resolveCombatant(state, ev.source);
        var dealtToMobM = !!encM.mobs[ev.target];
        var dealtByMobM = !!encM.mobs[ev.source];
        if (dealtToMobM && !dealtByMobM) {
          var cM = combatant(encM, resolvedMissSource);
          var abNameM = (ev.verb && VERB_LABELS[ev.verb]) || "Melee";
          rememberUnresolved(state, encM, ev.source);
          if (petOwner(state, ev.source)) {
            if (!cM.pets[ev.source]) cM.pets[ev.source] = { name: ev.source, damage: 0, hits: 0, crits: 0, abilities: {} };
            tallyMiss(cM.pets[ev.source].abilities, abNameM);
          } else {
            tallyMiss(cM.abilities, abNameM);
          }
        }
      }
    } else if (ev.type === "cast") {
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

  function healersArray(bucket, dur) {
    return Object.keys(bucket).map(function (name) {
      var h = bucket[name];
      return { name: h.name, amount: h.amount, hits: h.hits, hps: h.amount / dur };
    }).sort(function (a, b) { return b.amount - a.amount; });
  }

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
        generation: m.generation || null,
        pct: enc.totalDamage > 0 ? (m.totalDamage / enc.totalDamage) * 100 : 0,
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
      abilitiesTotal: abilitiesArray(allAbilities, dur, enc.totalDamage),
      byMob: byMob,
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

  function mergeEncounters(encounters) {
    var merged = {
      startTime: null, endTime: 0, mobName: null, mobNames: [],
      mobKilled: false, mobKillCount: 0,
      combatants: {}, damageTaken: {}, totalDamage: 0, totalTaken: 0,
      difficulty: null, difficultyKnown: false, healers: {},
      mobs: {},
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
    parsePetOwnership: parsePetOwnership,
    assignPetOwner: assignPetOwner,
    encounterRawText: encounterRawText,
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
})(typeof window !== "undefined" ? window
  : typeof globalThis !== "undefined" ? globalThis
  : typeof self !== "undefined" ? self
  : null);

// ESM glue for the Worker (see the file-header note above) — no-op in a
// plain <script> tag or CommonJS context, since import/export statements
// are simply never reached there.
