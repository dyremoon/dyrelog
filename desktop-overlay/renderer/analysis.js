// Combat Analysis window — receives RAW encounter data relayed from the
// mini-mode window (see push-state/get-state/state-update in main.js and
// app.js's render()) and does its own grouping/aggregation with the same
// EQP engine the mini-mode window uses (see eqp-core.js, loaded alongside
// this file in analysis.html) rather than only ever rendering pre-computed
// stats shaped around a single encounter at a time.
//
// The core idea: eqp-core.js still locks onto ONE mob per encounter (see
// its own comments), so a continuous pull that kills several back-to-back
// targets genuinely produces several separate encounter objects. But
// browsing them that way was confusing and wrong for "how did that whole
// pull go" — six identical "a sonic bat" rows with no way to tell them
// apart, and no combined dps average across the pull. So this window
// re-groups eqp-core's raw encounters into SESSIONS — every encounter (and
// the live one, if any) that followed the previous one within the same
// gap window eqp-core already uses to decide a fight hasn't truly ended —
// and shows ONE row per session: a name listing what was fought, a
// timestamp, and the combined duration/dps across the whole thing. Click a
// session to see it combined, or pick one specific target within it via
// the pill row for that target's own breakdown alone. See buildSessions()/
// EQP.mergeEncounters() (eqp-core.js) for how the merge itself works.
(function () {
  "use strict";

  var SITE_BASE = "https://dyrelog.pages.dev";

  var selectedKey = null; // the session's first member's startTime, as a string
  var selectedMemberIndex = null; // null = combined session view; otherwise an index into session.members
  // "it also has an incoming tab, i like that" — "Outgoing" is everything
  // this window already showed (combatant table, healing, procs,
  // abilities, deep dive); "Incoming" is the new damage-taken/heals-
  // received view — see renderIncomingTab(). Deliberately one shared
  // toggle rather than per-session state; switching sessions while on
  // Incoming just keeps showing Incoming for the new session too.
  var activeDetailTab = "outgoing";
  var latest = { current: null, encounters: [], characterName: null, gapMs: 9000 };
  // Which combatant cards are expanded, keyed by "<view key>::<row name>"
  // so it survives the live re-render every second (state-update fires
  // roughly once a second while a fight is going) without either
  // forgetting what you had open or leaking one view's expanded rows into
  // a different one that happens to share a combatant name. The view key
  // folds in selectedMemberIndex too, so switching between "combined" and
  // one specific target doesn't share expanded state either.
  var expanded = new Set();
  // "Create a toggle button to combine pets+pet owners into one analysis"
  // (Sept 6) — off by default (unchanged behavior: a pet keeps its own
  // row/card). See buildAnalysisRows()'s combinePets parameter and
  // mergeAbilityArrays() below.
  var combinePets = false;

  document.getElementById("btn-open-site").addEventListener("click", function () {
    window.dyrelog.openExternal(SITE_BASE);
  });

  // Same "You" -> real character name swap as the mini-mode card (see
  // displayName() in app.js) — the underlying row key stays "You" since
  // that's what EQP.computeStats() returns, this is display-only.
  function displayName(rawName) {
    return rawName === "You" ? (latest.characterName || "You") : rawName;
  }

  var els = {
    empty: document.getElementById("empty"),
    layout: document.getElementById("layout"),
    list: document.getElementById("enc-list"),
    detail: document.getElementById("enc-detail")
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtNum(n) { return Math.round(n).toLocaleString(); }
  // Same abbreviation app.js's mini-mode card uses for "dps · total" — kept
  // as its own copy here since this window has no shared module system
  // with app.js (two separate <script> files, each its own IIFE).
  function fmtAbbrev(n) {
    n = Math.max(0, n || 0);
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "m";
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(Math.round(n));
  }
  function fmtDur(sec) {
    sec = Math.round(sec);
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  // A wall-clock timestamp for the session list/header — item 13 ("I want
  // the analysis to have a timestamp of when the fight happened").
  function fmtClock(ms) {
    var d = new Date(ms);
    var h = d.getHours(), m = d.getMinutes();
    var ampm = h >= 12 ? "PM" : "AM";
    h = h % 12; if (h === 0) h = 12;
    return h + ":" + (m < 10 ? "0" : "") + m + " " + ampm;
  }
  // eqp-core's own row shape keeps a combatant's self+pet damage folded
  // into ONE combined row by design (r.damage/r.dps — everything else,
  // like the header's own dps number, relies on that combined total
  // staying intact) — with the pet breakdown riding alongside as
  // r.selfDamage/r.petDamage/r.pets[]. That used to render as a single
  // "Dyremoon" row/card with a small "4,836 self · 4,409 pet" footnote,
  // which read as two unrelated numbers next to a bigger total rather than
  // as their own separate things ("I don't need two of those, I just need
  // 1 Dyremoon and 1 warder... I want to see the warder dps separate from
  // my dps... I want to see my dps separate from my pet's dps"). This
  // flattens each combatant row into its own self-only entry PLUS one
  // entry per pet, so the summary table and the deep-dive cards below both
  // show exactly one row per real "thing" — you, your pet, anyone else's
  // pet — matching how the live overlay's bar list already splits pets out
  // (see buildDisplayRows() in app.js). Purely a display-time split of
  // already-computed data; nothing here changes what any total sums to —
  // that's still whatever eqp-core's computeStats() returned (item 4's
  // "combined total dps at the top" comes from that unmodified total, via
  // the stat-chips above this table).
  // Combines several already-computed ability arrays (abilitiesArray()'s
  // shape in eqp-core.js — name/damage/hits/crits/misses/casts, plus a
  // .pct computed against a DIFFERENT denominator than the merged result
  // needs) back down to one row per ability name, dps/pct recomputed fresh
  // against `denom`. Used by combinePets below — a render-only merge, no
  // eqp-core.js change needed, mirroring mergeAbilities()+abilitiesArray()
  // there but operating on arrays instead of raw tally buckets.
  function mergeAbilityArrays(arrays, dur, denom) {
    var bucket = {};
    (arrays || []).forEach(function (arr) {
      (arr || []).forEach(function (a) {
        var d = bucket[a.name] || (bucket[a.name] = { name: a.name, damage: 0, hits: 0, crits: 0, misses: 0, casts: 0 });
        d.damage += a.damage;
        d.hits += a.hits;
        d.crits += a.crits;
        d.misses += a.misses || 0;
        d.casts += a.casts || 0;
      });
    });
    return Object.keys(bucket).map(function (name) {
      var a = bucket[name];
      return {
        name: a.name, damage: a.damage, hits: a.hits, crits: a.crits, misses: a.misses, casts: a.casts,
        dps: dur > 0 ? a.damage / dur : 0,
        pct: denom > 0 ? (a.damage / denom) * 100 : 0
      };
    }).sort(function (a, b) { return b.damage - a.damage; });
  }

  // combinePets (Sept 6 — "a toggle button to combine pets+pet owners into
  // one analysis") folds each pet's row and abilities back into its
  // owner's single row instead, using the OWNER's already-combined
  // damage/hits/crits (c.damage/c.hits/c.crits in eqp-core.js already
  // include pet contributions) rather than re-summing self+pet by hand.
  function buildAnalysisRows(rows, totalDamage, duration, combinePets) {
    var out = [];
    (rows || []).forEach(function (r) {
      var pets = r.pets || [];
      if (combinePets && pets.length) {
        out.push({
          name: displayName(r.name), ownerName: r.name, isPet: false, combinedPets: true,
          damage: r.damage,
          dps: duration > 0 ? r.damage / duration : 0,
          hits: r.hits,
          crits: r.crits,
          pct: totalDamage > 0 ? (r.damage / totalDamage) * 100 : 0,
          abilities: mergeAbilityArrays([r.abilities].concat(pets.map(function (p) { return p.abilities; })), duration, r.damage)
        });
        return;
      }
      var petHits = pets.reduce(function (sum, p) { return sum + p.hits; }, 0);
      var petCrits = pets.reduce(function (sum, p) { return sum + p.crits; }, 0);
      out.push({
        name: displayName(r.name), ownerName: r.name, isPet: false,
        damage: r.selfDamage,
        dps: duration > 0 ? r.selfDamage / duration : 0,
        hits: r.hits - petHits,
        crits: r.crits - petCrits,
        pct: totalDamage > 0 ? (r.selfDamage / totalDamage) * 100 : 0,
        abilities: r.abilities
      });
      pets.forEach(function (p) {
        out.push({
          name: p.name, ownerName: r.name, isPet: true,
          damage: p.damage, dps: p.dps, hits: p.hits, crits: p.crits,
          pct: totalDamage > 0 ? (p.damage / totalDamage) * 100 : 0,
          abilities: p.abilities
        });
      });
    });
    out.sort(function (a, b) { return b.damage - a.damage; });
    return out;
  }

  var DIFFICULTY_LABELS = { D1: "D1 · Awakened", D2: "D2 · Adaptive", D3: "D3 · Fused", D4: "D4 · Refined" };
  // Same six rank hues the mini-mode bar list uses (--rank1..--rank6 in
  // both style.css and analysis.css) — gives the deep dive a little visual
  // "flare and color" per item 7.5, and ties a combatant's accent here to
  // the same color they'd show as a bar in the overlay.
  var RANK_SWATCHES = ["--rank1", "--rank2", "--rank3", "--rank4", "--rank5", "--rank6"];

  // ---- session grouping ---------------------------------------------------
  // Mirrors currentSessionMembers() in app.js exactly (same gap-based
  // continuity eqp-core's own encounter-closing logic already uses) so the
  // live header over in the mini-mode card and this window's history list
  // always agree on what counts as "one fight." latest.encounters arrives
  // oldest-first; latest.current (if present) is the still-live tail.
  function buildSessions() {
    var gapMs = latest.gapMs || 9000;
    var sessions = [];
    (latest.encounters || []).forEach(function (enc) {
      var last = sessions[sessions.length - 1];
      if (last && (enc.startTime - last.lastEndTime) <= gapMs) {
        last.members.push(enc);
        last.lastEndTime = enc.endTime;
      } else {
        sessions.push({ members: [enc], lastEndTime: enc.endTime, isLive: false });
      }
    });
    if (latest.current) {
      var last2 = sessions[sessions.length - 1];
      if (last2 && (latest.current.startTime - last2.lastEndTime) <= gapMs) {
        last2.members.push(latest.current);
        last2.isLive = true;
      } else {
        sessions.push({ members: [latest.current], lastEndTime: latest.current.endTime, isLive: true });
      }
    }
    return sessions; // oldest-first
  }

  function sessionKey(session) { return String(session.members[0].startTime); }

  // "I like how it differentiates fights. It says a name and then + how
  // many people were there too" — a session's short label is
  // "<primary mob>[ (generation)][ +party size]", e.g. "Lady Vox (2) +1",
  // not a joined list of every distinct mob name fought (that full
  // breakdown lives in the "Mobs fought this session" table inside the
  // detail view instead — see renderMobsFoughtSection()).
  //
  // "Primary mob" is whichever mob took the most damage this session
  // (stats.byMob is already damage-sorted — see computeStats() in
  // eqp-core.js). "(generation)" is that SAME mob's own log-wide spawn
  // number (eqp-core.js's state.mobGenerations, via computeStats()'s
  // byMob[].generation) — "build the fuller version" of what was
  // originally a simpler, session-scoped kill count here: this is now a
  // running count of how many times this exact mob NAME has spawned
  // across the whole loaded log, matching what EQ Legends Companion's own
  // "(N)" suffix does (see eqp-core.js's assignMobGeneration() for the
  // full mechanics and its documented same-still-open-encounter caveat).
  // Only shown once it's actually informative (> 1) — a mob's first-ever
  // appearance doesn't need a "(1)" tag. "Party size" counts every OTHER
  // combatant with their own top-level row this session (pets fold onto
  // their owner's row — see combatant()'s pet-fold comment in
  // eqp-core.js — so a pet never inflates this).
  function sessionLabel(session) {
    var merged = EQP.mergeEncounters(session.members);
    var stats = EQP.computeStats(merged);
    var byMob = stats.byMob || [];
    if (!byMob.length) return "Unknown target";
    var primary = byMob[0];
    var partyCount = (stats.rows || []).filter(function (r) { return r.name !== "You"; }).length;
    return primary.name +
      (primary.generation > 1 ? " (" + primary.generation + ")" : "") +
      (partyCount > 0 ? " +" + partyCount : "");
  }

  // Merges a session's members with EQP.mergeEncounters() and computes
  // stats on the result — the live member (if any) gets the same 2s-grace
  // endTime extension app.js's own live view uses, so duration/dps don't
  // read as artificially truncated between ticks.
  function sessionData(session, nowMs) {
    var members = session.members;
    if (session.isLive) {
      var liveMember = members[members.length - 1];
      var extended = Object.assign({}, liveMember, { endTime: Math.max(liveMember.endTime, nowMs - 2000) });
      members = members.slice(0, -1).concat([extended]);
    }
    var merged = EQP.mergeEncounters(members);
    return { merged: merged, stats: EQP.computeStats(merged) };
  }

  function render() {
    var sessions = buildSessions();

    if (!sessions.length) {
      els.empty.hidden = false;
      els.layout.hidden = true;
      return;
    }
    els.empty.hidden = true;
    els.layout.hidden = false;

    var newestFirst = sessions.slice().reverse();
    var now = Date.now();

    if (selectedKey === null || !sessions.some(function (s) { return sessionKey(s) === selectedKey; })) {
      selectedKey = sessionKey(newestFirst[0]);
      selectedMemberIndex = null;
    }

    els.list.innerHTML = newestFirst.map(function (session) {
      var k = sessionKey(session);
      var data = sessionData(session, now);
      var lastMember = session.members[session.members.length - 1];
      var diff = lastMember.difficultyKnown ? (DIFFICULTY_LABELS[lastMember.difficulty] || "Base") : "Unknown tier";
      return (
        '<div class="enc-row' + (k === selectedKey ? " active" : "") + '" data-key="' + esc(k) + '">' +
          '<div class="mob">' + esc(sessionLabel(session)) + "</div>" +
          '<div class="meta">' + (session.isLive ? '<span class="live-tag">● live</span> &middot; ' : "") +
            fmtClock(session.members[0].startTime) + " &middot; " + fmtDur(data.stats.duration) + " &middot; " + diff +
            (data.merged.mobKillCount > 1 ? " &middot; " + data.merged.mobKillCount + " kills" : "") +
          "</div>" +
        "</div>"
      );
    }).join("");

    document.querySelectorAll(".enc-row").forEach(function (row) {
      row.addEventListener("click", function () {
        if (row.dataset.key === selectedKey) return; // already selected — don't reset the target-pill choice on a redundant click
        selectedKey = row.dataset.key;
        selectedMemberIndex = null;
        render();
      });
    });

    var selectedSession = sessions.find(function (s) { return sessionKey(s) === selectedKey; });
    renderDetail(selectedSession, now);
  }

  function renderDetail(session, now) {
    if (!session) { els.detail.innerHTML = '<p class="muted">Select a fight on the left to see its full breakdown.</p>'; return; }
    var data = sessionData(session, now);
    var merged = data.merged, stats = data.stats;
    var diff = merged.difficultyKnown ? (DIFFICULTY_LABELS[merged.difficulty] || "Base") : "Unknown tier (no zone-in line seen)";

    // "Combined" (every target in this session added together) is the
    // default; picking one target pill below narrows to just that member's
    // own stats instead — item 12's follow-up ("I can click into it... or
    // I can click each target to see what I did to each one").
    var activeStats, activeEnc, activeLabel, viewKey;
    if (selectedMemberIndex === null || !session.members[selectedMemberIndex]) {
      activeStats = stats;
      activeEnc = merged;
      activeLabel = sessionLabel(session) + (session.members.length > 1 ? " — combined" : "");
      viewKey = sessionKey(session);
    } else {
      var m = session.members[selectedMemberIndex];
      var isLiveMember = session.isLive && selectedMemberIndex === session.members.length - 1;
      var mExt = isLiveMember ? Object.assign({}, m, { endTime: Math.max(m.endTime, now - 2000) }) : m;
      activeStats = EQP.computeStats(mExt);
      activeEnc = mExt;
      activeLabel = m.mobName || "Unknown target";
      viewKey = sessionKey(session) + ":" + selectedMemberIndex;
    }

    // Flattened — one row per real "thing" (you, your pet, anyone else's
    // pet), never a combined row with a footnote. See buildAnalysisRows()'s
    // own comment for why.
    var rows = buildAnalysisRows(activeStats.rows, activeStats.totalDamage, activeStats.duration, combinePets);
    // The "% of total" column only means anything once there's someone to
    // compare against — with just you and no pet (the simplest case) it's
    // always a flat, meaningless 100.0% that just read as noise sitting
    // next to Hits (item 5/6.2 — "I don't understand what the % is...
    // those stats are funky"). Drop the whole column rather than show a
    // number that never varies; it comes back the moment there's a pet (or
    // an actual group) to split credit across.
    var showPct = rows.length > 1;
    var rowsHtml = rows.map(function (r, i) {
      var swatch = "var(" + RANK_SWATCHES[i % RANK_SWATCHES.length] + ")";
      var petTag = r.isPet ? ' <span class="pet-tag-mini">Pet</span>' : "";
      return (
        '<tr style="--swatch:' + swatch + '">' +
          '<td><span class="rank-dot"></span>' + esc(r.name) + petTag + "</td>" +
          '<td class="num">' + fmtNum(r.damage) + "</td>" +
          '<td class="num">' + r.dps.toFixed(1) + "</td>" +
          (showPct ? '<td class="num">' + r.pct.toFixed(1) + "%</td>" : "") +
          '<td class="num">' + r.hits + "</td>" +
          '<td class="num">' + r.crits + "</td>" +
        "</tr>"
      );
    }).join("");

    // Only worth showing the target selector when there's more than one
    // — a single-target session has nothing to switch between.
    var pillsHtml = "";
    if (session.members.length > 1) {
      pillsHtml =
        '<div class="target-pills">' +
          '<button class="target-pill' + (selectedMemberIndex === null ? " active" : "") + '" data-member="">All targets combined</button>' +
          session.members.map(function (m, i) {
            return '<button class="target-pill' + (selectedMemberIndex === i ? " active" : "") + '" data-member="' + i + '">' + esc(m.mobName || "Unknown target") + "</button>";
          }).join("") +
        "</div>";
    }

    // The per-combatant ability breakdown below only means something when
    // it's scoped to one actual enemy. Keyed off activeStats.byMob (see
    // "Add damage") rather than session.members/selectedMemberIndex now —
    // byMob reflects EVERY mob actually confirmed within whatever's
    // currently being viewed, whether that's several sequential kills (the
    // old multi-target case) or several mobs fought concurrently within
    // one single encounter (an add fought alongside an already-locked
    // target), which session.members alone could never represent. More
    // than one distinct mob in the current view means the numbers below
    // would just be each person's name and total again with no way to
    // tell which enemy any of it came from — exactly the "doesn't say
    // what enemy it is" confusion — so it's left out entirely rather than
    // show something that reads as clutter with no real answer to give.
    var activeByMob = activeStats.byMob || [];
    // "Remove the Deep Dive portion, and bake that into the analysis
    // portion. It seemingly has a lot of double-up information and serves
    // no purpose. the analysis IS the deep dive." — used to be a plain
    // summary table here, then a SEPARATE "Deep dive" section below
    // repeating the same name/damage/dps/% for each combatant just to add
    // an expand arrow. Now there's one Combatants section: still a plain
    // table on a multi-target view (per-ability breakdown isn't reliably
    // attributable across more than one confirmed mob — that constraint is
    // unchanged, see the big comment above), but a single-target view
    // renders the exact same numbers as expandable cards instead of a
    // table-plus-cards duplicate, with hits/crits folded into each card's
    // own header so nothing that used to be in the table is lost.
    var canExpand = activeByMob.length <= 1;
    var deepDiveMobName = activeByMob.length === 1 ?
      activeByMob[0].name + (activeByMob[0].generation > 1 ? " (" + activeByMob[0].generation + ")" : "") : null;
    // "Create a toggle button to combine pets+pet owners into one
    // analysis" — sits in the section header regardless of which layout
    // (cards vs. plain table) renders below, since either one already
    // reads combinePets via buildAnalysisRows() above.
    // Only merges pets EQ names after their owner ("Owner`s warder") — a
    // custom-named pet (a necro's skeleton, say) can't be linked to its
    // owner from the log text and stays a separate row.
    var combineToggleHtml =
      '<button class="btn-toggle-sm' + (combinePets ? " active" : "") + '" id="btn-combine-pets" type="button" title="Only merges pets EQ names after their owner (like &quot;Owner`s warder&quot;) — a custom-named pet (e.g. a necro\'s skeleton) can\'t be identified as a pet and stays separate.">' +
        (combinePets ? "&#10003; Pets combined with owners" : "Combine pets with owners") +
      "</button>";
    var combatantSectionHtml = canExpand
      ? (
          '<div class="section-label-row"><p class="section-label">Combatants' + (deepDiveMobName ? " against " + esc(deepDiveMobName) : "") + "</p>" + combineToggleHtml + "</div>" +
          '<p class="muted" style="font-size:0.8rem; margin:-6px 0 10px;">Click a combatant for its full spell/ability breakdown.</p>' +
          '<div class="combatants" id="combatants">' + rows.map(function (r, i) { return renderCombatantCard(r, i, viewKey, showPct); }).join("") + "</div>"
        )
      : (
          '<div class="section-label-row"><p class="section-label">Combatants</p>' + combineToggleHtml + "</div>" +
          "<table><thead><tr><th>Combatant</th><th class=\"num\">Damage</th><th class=\"num\">DPS</th>" +
            (showPct ? '<th class="num" title="Share of this fight\'s total damage">% of total</th>' : "") +
            '<th class="num">Hits</th><th class="num">Crits</th></tr></thead>' +
          "<tbody>" + (rowsHtml || '<tr><td colspan="' + (showPct ? 6 : 5) + '" class="muted">No damage recorded.</td></tr>') + "</tbody></table>" +
          '<p class="muted" style="font-size:0.8rem; margin-top:8px;">Per-ability breakdown isn\'t shown when more than one target was fought in this view — damage can\'t be reliably split by target at the ability level.</p>'
        );

    var outgoingHtml =
      wrapSection(renderDpsChartSection(activeStats), "analysis-section-dps") +
      wrapSection(renderMobsFoughtSection(stats), "analysis-section-mobs") +
      (pillsHtml ? wrapSection(pillsHtml + '<p class="section-label">' + esc(activeLabel) + "</p>", "analysis-section-mobs") : "") +
      wrapSection(combatantSectionHtml, "analysis-section-combatants") +
      wrapSection(renderHealingSection(activeStats.healing), "analysis-section-healing") +
      wrapSection(renderProcsSection(activeStats), "analysis-section-procs") +
      wrapSection(renderTeamAbilitySection(activeStats, combinePets), "analysis-section-team");

    els.detail.innerHTML =
      "<h2>" + esc(sessionLabel(session)) +
      (session.isLive ? ' <span class="badge badge-good">live</span>' : merged.mobKilled ? ' <span class="badge badge-good">killed</span>' : "") +
      "</h2>" +
      '<div class="stat-chips">' +
        '<span class="stat-chip">' + diff + "</span>" +
        '<span class="stat-chip">' + fmtClock(session.members[0].startTime) + "</span>" +
        '<span class="stat-chip">' + fmtDur(stats.duration) + " elapsed</span>" +
        (merged.mobKillCount > 1 ? '<span class="stat-chip">' + merged.mobKillCount + " kills</span>" : "") +
        '<span class="stat-chip accent">' + fmtNum(stats.totalDamage) + " total dmg</span>" +
        '<span class="stat-chip accent">' + (stats.raidDps || 0).toFixed(1) + " combined dps</span>" +
      "</div>" +
      '<div class="detail-tabs">' +
        '<button class="detail-tab' + (activeDetailTab === "outgoing" ? " active" : "") + '" data-tab="outgoing">Outgoing</button>' +
        '<button class="detail-tab' + (activeDetailTab === "incoming" ? " active" : "") + '" data-tab="incoming">Incoming</button>' +
      "</div>" +
      (activeDetailTab === "incoming" ? renderIncomingTab(activeEnc, activeStats) : outgoingHtml);

    document.querySelectorAll(".detail-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        activeDetailTab = btn.dataset.tab;
        render();
      });
    });
    document.querySelectorAll(".target-pill").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var v = btn.dataset.member;
        selectedMemberIndex = v === "" ? null : parseInt(v, 10);
        render();
      });
    });
    wireCombatantCards();
  }

  // "Then there should be sections around what mobs were fought in that
  // dps time frame" — a compact at-a-glance list of every distinct target
  // that made up this session, each with its own duration/dps/kills/
  // damage, sitting above the target-pill drill-down rather than only
  // being reachable by clicking through each pill one at a time. Only
  // shown once there's more than one distinct mob — a single-target
  // session has nothing to break down (its own h2/stat-chips already say
  // everything this would).
  //
  // Sourced from stats.byMob (EQP.computeStats(), fed by eqp-core.js's
  // per-encounter enc.mobs — see "Add damage") rather than session.members
  // now — session.members only ever captures SEQUENTIAL back-to-back
  // kills (this analysis window's own session-grouping), so it had no way
  // to represent an add fought CONCURRENTLY alongside an already-locked
  // target (e.g. a priest fought at the same time as Lady Vox); byMob
  // does, since it's built from every mob eqp-core actually confirmed
  // hostile within the fight, not just ones that got their own encounter
  // boundary. This also finally gives this table a real per-mob dps
  // column, not just duration/damage — "it should count all damage done
  // during that combat session, and then in analysis it can break it
  // down to what dps per mob if we want."
  function renderMobsFoughtSection(stats) {
    var byMob = stats.byMob || [];
    if (byMob.length <= 1) return "";
    var rowsHtml = byMob.map(function (m) {
      return (
        "<tr>" +
          "<td>" + esc((m.name || "Unknown target") + (m.generation > 1 ? " (" + m.generation + ")" : "")) +
            (m.mobKilled ? ' <span class="badge badge-good">killed</span>' : "") + "</td>" +
          '<td class="num">' + fmtDur(m.duration) + "</td>" +
          '<td class="num">' + m.dps.toFixed(1) + "</td>" +
          '<td class="num">' + (m.mobKillCount || 0) + "</td>" +
          '<td class="num">' + fmtNum(m.damage) + "</td>" +
        "</tr>"
      );
    }).join("");
    return (
      '<p class="section-label">Mobs fought this session</p>' +
      '<table><thead><tr><th>Mob</th><th class="num">Duration</th><th class="num">DPS</th><th class="num">Kills</th><th class="num">Damage dealt</th></tr></thead>' +
      "<tbody>" + rowsHtml + "</tbody></table>"
    );
  }

  // "id also like to see Peak DPS like this graph does. We can do a graph
  // if possible but if its hard i understand" — the graph itself, built
  // from eqp-core.js's per-second timeline (activeStats.timeline, fed by
  // enc.outBuckets/inBuckets — see blankEncounter()'s comment there).
  // Reconstructed after the fact from the log's own hit-by-hit data
  // rather than sampled live, so it works exactly the same whether you're
  // looking at the fight that's happening right now or one from earlier
  // this session — there's no separate "recording" step. A short centered
  // moving average (smoothSeries()) is applied only to what gets DRAWN;
  // nothing it touches feeds back into any real total (dps/damage/Peak
  // DPS in the main meter all stay untouched, unsmoothed numbers).
  function smoothSeries(values, windowSize) {
    var n = values.length;
    var half = Math.floor(windowSize / 2);
    var out = new Array(n);
    for (var i = 0; i < n; i++) {
      var sum = 0, count = 0;
      for (var j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) { sum += values[j]; count++; }
      out[i] = sum / count;
    }
    return out;
  }

  // mode "both" (default) is the original Outgoing chart — your own dps
  // line, plus an incoming line whenever there was any. mode "in" is the
  // Incoming tab's own chart (Sept 6 parity pass — "the incoming section
  // is very lackluster compared to outgoing, add the same tools"): just
  // the incoming line, peak-labeled the same way.
  function buildDpsChart(timeline, duration, mode) {
    mode = mode === "in" ? "in" : "both";
    if (!timeline || timeline.length < 2) return "";
    var outVals = timeline.map(function (p) { return p.out; });
    var inVals = timeline.map(function (p) { return p.in; });
    var smoothOut = smoothSeries(outVals, 5);
    var smoothIn = smoothSeries(inVals, 5);
    var hasIn = inVals.some(function (v) { return v > 0; });
    if (mode === "in" && !hasIn) return "";
    var showIn = mode === "in" ? true : hasIn;
    var showOut = mode !== "in";
    var primary = mode === "in" ? smoothIn : smoothOut;
    var maxVal = Math.max(1, showOut ? Math.max.apply(null, smoothOut) : 0, showIn ? Math.max.apply(null, smoothIn) : 0);
    maxVal *= 1.2; // headroom so the peak label never sits flush against the top edge

    var W = 640, H = 150, padL = 38, padR = 10, padT = 14, padB = 20;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var n = timeline.length;
    function xAt(i) { return padL + (n <= 1 ? 0 : (i / (n - 1)) * plotW); }
    function yAt(v) { return padT + plotH - (v / maxVal) * plotH; }
    function pathFor(vals) {
      return vals.map(function (v, i) { return (i === 0 ? "M" : "L") + xAt(i).toFixed(1) + "," + yAt(v).toFixed(1); }).join(" ");
    }

    // Peak marker sits on the SAME (smoothed) line that's actually drawn,
    // so the dot and its label always land exactly on the curve.
    var peakIdx = 0, peakVal = -1;
    primary.forEach(function (v, i) { if (v > peakVal) { peakVal = v; peakIdx = i; } });
    var peakX = xAt(peakIdx), peakY = yAt(peakVal);
    var peakLabelX = Math.min(Math.max(peakX, padL + 30), W - padR - 30);
    var peakAbove = peakY > padT + 18;
    var peakSuffix = mode === "in" ? " dps taken" : " dps";

    var gridHtml = [0.5, 1].map(function (frac) {
      var y = padT + plotH * (1 - frac);
      return (
        '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '" class="dps-grid" />' +
        '<text x="' + (padL - 6) + '" y="' + (y + 3).toFixed(1) + '" class="dps-axis-label" text-anchor="end">' + fmtAbbrev(maxVal * frac) + "</text>"
      );
    }).join("");

    return (
      '<div class="dps-chart-wrap">' +
        '<svg class="dps-chart" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none">' +
          gridHtml +
          (showIn && mode === "both" ? '<path d="' + pathFor(smoothIn) + '" class="dps-line-in" fill="none" />' : "") +
          (mode === "in" ? '<path d="' + pathFor(smoothIn) + '" class="dps-line-in-solo" fill="none" />' : '<path d="' + pathFor(smoothOut) + '" class="dps-line-out" fill="none" />') +
          '<circle cx="' + peakX.toFixed(1) + '" cy="' + peakY.toFixed(1) + '" r="3.5" class="dps-peak-dot' + (mode === "in" ? " dps-peak-dot-in" : "") + '" />' +
          '<text x="' + peakLabelX.toFixed(1) + '" y="' + (peakAbove ? peakY - 8 : peakY + 16).toFixed(1) + '" class="dps-peak-label" text-anchor="middle">Peak ' + fmtAbbrev(peakVal) + peakSuffix + "</text>" +
          '<text x="' + padL + '" y="' + (H - 4) + '" class="dps-axis-label">0:00</text>' +
          '<text x="' + (W - padR) + '" y="' + (H - 4) + '" class="dps-axis-label" text-anchor="end">' + fmtDur(duration) + "</text>" +
        "</svg>" +
        '<div class="dps-chart-legend">' +
          (mode === "in"
            ? '<span class="legend-item"><span class="legend-swatch in"></span>Incoming</span>'
            : '<span class="legend-item"><span class="legend-swatch out"></span>Your DPS</span>' +
              (showIn ? '<span class="legend-item"><span class="legend-swatch in"></span>Incoming</span>' : "")) +
        "</div>" +
      "</div>"
    );
  }

  function renderDpsChartSection(activeStats) {
    var chart = buildDpsChart(activeStats.timeline, activeStats.duration);
    if (!chart) return "";
    return '<p class="section-label">DPS over time</p>' + chart;
  }

  // Healing done during this view (combined session or one target) — see
  // the "heal" branch in eqp-core.js's ingest(). Attributed to whatever
  // fight was current when the heal landed (the log doesn't name a target
  // mob on a heal line at all, so there's no finer bucket to put it in).
  function renderHealingSection(healing) {
    if (!healing || !healing.length) return "";
    var rowsHtml = healing.map(function (h) {
      return (
        "<tr>" +
          "<td>" + esc(displayName(h.name)) + "</td>" +
          '<td class="num">' + fmtNum(h.amount) + "</td>" +
          '<td class="num">' + h.hps.toFixed(1) + "</td>" +
          '<td class="num">' + h.hits + "</td>" +
        "</tr>"
      );
    }).join("");
    return (
      '<p class="section-label">Healing</p>' +
      '<table><thead><tr><th>Healer</th><th class="num">Amount</th><th class="num">HPS</th><th class="num">Hits</th></tr></thead>' +
      "<tbody>" + rowsHtml + "</tbody></table>"
    );
  }

  // "it also has an incoming tab, i like that" — damage the group TOOK
  // during this view, broken down by MOB (matching the per-mob "Damage
  // breakdown" style in the reference screenshot), plus how much got
  // healed back off.
  //
  // Sourced from activeStats.byMob's totalTaken/takenDps (eqp-core.js's
  // enc.mobs[name].totalTaken, tallied by the "dealtByMob" branch in
  // ingest()) — melee damage a mob deals is always correctly attributed
  // to that specific mob. Non-melee/spell damage a mob deals usually
  // ISN'T (the log line often doesn't cleanly name the caster —
  // RE_NONMELEE_FROM's own "v1 doesn't break down damage taken by
  // source" comment) — that portion still counts toward the true total
  // (EQP.computeTakenStats()'s "Unknown (DoT/spell)" bucket) but can't be
  // credited to a specific mob, so it gets its own honestly-labeled row
  // instead of being silently folded into (or dropped from) the per-mob
  // numbers above it.
  //
  // Deliberately NOT attempted here: the "% hit / % resist" mitigation
  // breakdown a couple of reference tools show. An outgoing miss (yours,
  // against a mob) is already tracked (see the "miss" branch in
  // eqp-core.js), but an INCOMING miss/resist/parry/dodge/block (a mob's
  // attack failing against you) currently isn't recorded at all — that's
  // a real, separate parsing addition (new regexes for the "you parry!"/
  // "was resisted"-style lines), not something derivable from data
  // already collected. "Heals received" is the group's combined total
  // while this fight was live, not narrowed to just you — EQ's own heal
  // log lines don't carry enough to attribute a heal to a specific
  // recipient any more precisely than that (see the "heal" branch's own
  // comment).
  // "the incoming section is very lackluster compared to outgoing, add the
  // same/some same tools from outgoing into incoming" (Sept 6) — an
  // incoming-only DPS-over-time chart (buildDpsChart's own "in" mode) and
  // a Hits column pulled from EQP.computeTakenStats(), which already
  // tracks per-source hit counts that simply weren't being shown here
  // before — no engine change needed for either. What's still deliberately
  // NOT here (no per-ability incoming breakdown, no incoming crit count)
  // is a real EQ-log-format limit, not an oversight — see the big comment
  // above: an incoming hit only ever tells you which MOB dealt it, never
  // which spell/swing type.
  function renderIncomingChartSection(activeStats) {
    var chart = buildDpsChart(activeStats.timeline, activeStats.duration, "in");
    if (!chart) return "";
    return '<p class="section-label">Incoming damage over time</p>' + chart;
  }

  function renderIncomingBreakdownSection(activeEnc, activeStats) {
    var byMob = (activeStats.byMob || []).filter(function (m) { return m.totalTaken > 0; });
    var taken = EQP.computeTakenStats(activeEnc); // still the real total — see the comment above
    var totalTaken = taken.totalTaken;
    var dur = Math.max(activeStats.duration || 0, 1);
    var hitsByName = {};
    (taken.rows || []).forEach(function (r) { hitsByName[r.name] = r.hits; });
    var attributed = byMob.reduce(function (sum, m) { return sum + m.totalTaken; }, 0);
    var unattributed = Math.max(0, totalTaken - attributed);
    var rowsHtml = byMob.map(function (m) {
      return (
        "<tr>" +
          "<td>" + esc(m.name + (m.generation > 1 ? " (" + m.generation + ")" : "")) + "</td>" +
          '<td class="num">' + fmtNum(m.totalTaken) + "</td>" +
          '<td class="num">' + m.takenDps.toFixed(1) + "</td>" +
          '<td class="num">' + (totalTaken > 0 ? (m.totalTaken / totalTaken * 100).toFixed(1) : "0.0") + "%</td>" +
          '<td class="num">' + (hitsByName[m.name] || 0) + "</td>" +
        "</tr>"
      );
    }).join("");
    if (unattributed > 0) {
      rowsHtml += (
        '<tr class="muted">' +
          '<td>Unattributed (spell/DoT)</td>' +
          '<td class="num">' + fmtNum(unattributed) + "</td>" +
          '<td class="num">' + (unattributed / dur).toFixed(1) + "</td>" +
          '<td class="num">' + (totalTaken > 0 ? (unattributed / totalTaken * 100).toFixed(1) : "0.0") + "%</td>" +
          '<td class="num">' + (hitsByName["Unknown (DoT/spell)"] || 0) + "</td>" +
        "</tr>"
      );
    }
    return (
      '<p class="section-label">Damage breakdown</p>' +
      (totalTaken > 0 ?
        '<table><thead><tr><th>Mob</th><th class="num">Damage</th><th class="num">DPS</th>' +
          '<th class="num" title="Share of all incoming damage">% of total</th><th class="num">Hits</th></tr></thead>' +
          "<tbody>" + rowsHtml + "</tbody></table>" :
        '<p class="muted">No incoming damage recorded.</p>') +
      '<p class="muted">Incoming misses/resists/dodges aren\'t tracked yet — only landed hits. "Healing received" is the group\'s combined total, not split by who it landed on.</p>'
    );
  }

  function renderIncomingTab(activeEnc, activeStats) {
    var taken = EQP.computeTakenStats(activeEnc);
    var dur = Math.max(activeStats.duration || 0, 1);
    var healTotal = (activeStats.healing || []).reduce(function (sum, h) { return sum + h.amount; }, 0);
    return (
      '<div class="stat-chips">' +
        '<span class="stat-chip accent">' + fmtNum(taken.totalTaken) + " dmg taken</span>" +
        '<span class="stat-chip accent">' + (taken.totalTaken / dur).toFixed(1) + " dps taken</span>" +
        (healTotal > 0 ? '<span class="stat-chip">' + fmtNum(healTotal) + " healing received</span>" : "") +
      "</div>" +
      wrapSection(renderIncomingChartSection(activeStats), "analysis-section-incoming-dps") +
      wrapSection(renderIncomingBreakdownSection(activeEnc, activeStats), "analysis-section-incoming-breakdown") +
      wrapSection(renderHealingSection(activeStats.healing), "analysis-section-healing")
    );
  }

  // "I want a procs window like this" — a Companion-inspired panel of
  // just your own PASSIVE/triggered abilities (weapon procs, defensive
  // procs, aggro procs — anything that fires on its own rather than
  // something you actively cast), with a procs-per-minute rate and a
  // trigger count instead of damage/dps.
  //
  // The signal used to tell "proc" apart from "actively cast": did this
  // ability ever appear as one of YOUR OWN "You begin casting..." lines
  // (tallyCast() in eqp-core.js — a.casts). EQ's own log only ever shows a
  // cast-START line for the SUBMITTER's own casts (see that function's
  // "Only ever 'You'" comment) — never a groupmate's, never a pet's — so
  // "hits with zero casts" is only a meaningful "never manually
  // triggered" signal for your own breakdown, never anyone else's (theirs
  // reads as zero casts unconditionally, cast or not). That's why this is
  // scoped to the "You" row specifically, unlike "Damage by ability"
  // below, which deliberately combines everyone.
  //
  // MELEE_BUCKET_NAMES excludes the generic buckets that also naturally
  // have zero casts without being procs at all — plain melee swings
  // (abilityName()'s VERB_LABELS, mirrored here) and the two catch-all
  // buckets ("Non-melee", "Unnamed DoT tick") — those aren't triggered
  // effects, they're just what those bucket names already mean.
  //
  // NOT attempted: Companion's "~ Asp Venom Strike / Cobra Venom Strike"
  // style grouping (apparently the same proc chance randomly resolving to
  // one of a couple of named effects) — telling which spell names are
  // "variants of the same underlying proc" needs curated game knowledge
  // this project has no source for, not something derivable from the log.
  var MELEE_BUCKET_NAMES = {
    Melee: true, "Non-melee": true, "Unnamed DoT tick": true,
    Slash: true, Pierce: true, Crush: true, Claw: true, Bite: true,
    Sting: true, Maul: true, Hit: true, Punch: true, Kick: true,
    Gore: true, Smash: true, Rend: true, Slice: true, Bash: true,
    Shoot: true, Burn: true, Gouge: true, Cleave: true, Backstab: true,
    Strike: true
  };
  function renderProcsSection(stats) {
    var youRow = (stats.rows || []).find(function (r) { return r.name === "You"; });
    if (!youRow) return "";
    var procs = (youRow.abilities || []).filter(function (a) {
      return a.hits > 0 && a.casts === 0 && !MELEE_BUCKET_NAMES[a.name];
    });
    if (!procs.length) return "";
    procs.sort(function (a, b) { return b.hits - a.hits; });
    var durMin = Math.max(stats.duration, 1) / 60;
    var totalHits = procs.reduce(function (sum, a) { return sum + a.hits; }, 0);
    var rowsHtml = procs.map(function (a) {
      return (
        '<div class="proc-row">' +
          '<span class="proc-dot"></span>' +
          '<span class="proc-name">' + esc(a.name) + "</span>" +
          '<span class="proc-ppm">' + (a.hits / durMin).toFixed(2) + " ppm</span>" +
          '<span class="proc-count">×' + a.hits + "</span>" +
        "</div>"
      );
    }).join("");
    return (
      '<div class="section-label-row">' +
        '<p class="section-label">Procs</p>' +
        '<span class="section-stat">' + totalHits + " procs · " + (totalHits / durMin).toFixed(1) + " ppm</span>" +
      "</div>" +
      '<div class="procs-list">' + rowsHtml + "</div>"
    );
  }

  // Everyone's spells, kept separate per combatant (Sept 6 — "if multiple
  // users pierce/kick/backstab/use the same ability, those get separated
  // in their own line") instead of the old abilitiesTotal, which silently
  // merged e.g. every combatant's "Slash" into one row with no way to tell
  // who actually swung it. Sourced from eqp-core.js's abilitiesByCombatant
  // (owner/label/isPet per raw entry, pct already against
  // activeStats.totalDamage) — grouped here by display entity (label, or
  // owner when combinePets folds a pet's lines into its owner) + ability
  // name, re-summed and re-computed against the SAME denominator so the
  // combine toggle never has to touch eqp-core.js itself.
  function buildTeamAbilityRows(abilitiesByCombatant, combinePets, dur, totalDamage) {
    var bucket = {};
    (abilitiesByCombatant || []).forEach(function (a) {
      var entity = combinePets ? a.owner : a.label;
      var key = entity + "::" + a.name;
      var d = bucket[key] || (bucket[key] = { entity: entity, isPet: combinePets ? false : a.isPet, name: a.name, damage: 0, hits: 0, crits: 0, misses: 0, casts: 0 });
      d.damage += a.damage;
      d.hits += a.hits;
      d.crits += a.crits;
      d.misses += a.misses || 0;
      d.casts += a.casts || 0;
    });
    return Object.keys(bucket).map(function (k) {
      var d = bucket[k];
      return {
        entity: displayName(d.entity), isPet: d.isPet, name: d.name,
        damage: d.damage, hits: d.hits, crits: d.crits, misses: d.misses, casts: d.casts,
        dps: dur > 0 ? d.damage / dur : 0,
        pct: totalDamage > 0 ? (d.damage / totalDamage) * 100 : 0
      };
    }).sort(function (a, b) { return b.damage - a.damage; });
  }

  function renderTeamAbilityTable(rows) {
    if (!rows || !rows.length) return '<p class="muted">No ability breakdown yet.</p>';
    var maxDmg = rows.reduce(function (m, a) { return Math.max(m, a.damage); }, 0);
    var rowsHtml = rows.map(function (a) {
      var barPct = maxDmg > 0 ? Math.max(4, (a.damage / maxDmg) * 100) : 0;
      var castBadge = a.casts > 0 ? ' <span class="cast-badge" title="Times cast">&times;' + a.casts + "</span>" : "";
      var petTag = a.isPet ? ' <span class="pet-tag-mini">Pet</span>' : "";
      return (
        "<tr>" +
          "<td>" + esc(a.entity) + petTag + "</td>" +
          "<td>" + esc(a.name) + castBadge +
            '<div class="ability-bar"><div class="fill" style="--pct:' + barPct.toFixed(1) + '%"></div></div>' +
          "</td>" +
          '<td class="num">' + a.hits + "</td>" +
          '<td class="num">' + fmtNum(a.damage) + "</td>" +
          '<td class="num">' + a.pct.toFixed(1) + "%</td>" +
          '<td class="num">' + a.dps.toFixed(1) + "</td>" +
          '<td class="num">' + a.crits + "</td>" +
          '<td class="num">' + (a.misses || 0) + "</td>" +
        "</tr>"
      );
    }).join("");
    return (
      '<table class="ability-table team-ability-table"><thead><tr><th>Who</th><th>Ability</th><th class="num">Hits</th><th class="num">Damage</th>' +
        '<th class="num">% of total</th><th class="num">DPS</th><th class="num">Crits</th><th class="num">Misses</th></tr></thead>' +
      "<tbody>" + rowsHtml + "</tbody></table>"
    );
  }

  // "The bottom 'Damage by Ability' needs renaming/rebranding to explain
  // that its the full teams' breakdown" (Sept 6) — was
  // renderAbilitiesTotalSection()/abilitiesTotal, which read exactly like
  // one combatant's own breakdown at a glance. Respects the same
  // combinePets toggle as the Combatants section above.
  function renderTeamAbilitySection(activeStats, combinePets) {
    var rows = buildTeamAbilityRows(activeStats.abilitiesByCombatant, combinePets, activeStats.duration, activeStats.totalDamage);
    if (!rows.length) return "";
    return (
      '<p class="section-label">Full team — damage by ability</p>' +
      '<p class="muted" style="font-size:0.8rem; margin:-6px 0 10px;">Every participating combatant\'s damage this fight, broken down per ability — the same ability used by more than one combatant gets its own line each.</p>' +
      renderTeamAbilityTable(rows)
    );
  }

  // One card per row — you, your pet, anyone else's pet, each its own
  // separate card now (see buildAnalysisRows()) — click to expand into its
  // own ability breakdown: "each spell, each hit" as a per-ability
  // aggregate (hits/misses/crits/casts/damage per named spell, verb-split
  // melee, or DoT tick), since EQ's own log doesn't carry enough to
  // reconstruct a literal swing-by-swing list.
  function renderCombatantCard(r, i, viewKey, showPct) {
    var key = viewKey + "::" + r.name;
    var isOpen = expanded.has(key);
    var swatch = "var(" + RANK_SWATCHES[i % RANK_SWATCHES.length] + ")";
    var petTag = r.isPet ? ' <span class="pet-tag-mini">Pet</span>' : "";
    return (
      '<div class="combatant-card' + (isOpen ? " open" : "") + '" data-key="' + esc(key) + '" style="--swatch:' + swatch + '">' +
        '<div class="combatant-head" data-toggle="' + esc(key) + '">' +
          '<div class="who"><span class="disclosure">&#9656;</span><span class="cname">' + esc(r.name) + petTag + "</span></div>" +
          '<div class="stats"><span><b>' + fmtNum(r.damage) + "</b> dmg</span><span><b>" + r.dps.toFixed(1) + "</b> dps</span>" +
            (showPct ? "<span><b>" + r.pct.toFixed(1) + "%</b></span>" : "") +
            "<span><b>" + r.hits + "</b> hits</span><span><b>" + r.crits + "</b> crits</span></div>" +
        "</div>" +
        '<div class="combatant-body">' +
          renderAbilityTable(r.abilities) +
        "</div>" +
      "</div>"
    );
  }

  // Ability/Hits/Damage done/DPS/Crits/Misses — item 11's exact column
  // set, replacing the old Ability/Damage/DPS/%/Hits/Crits layout. The old
  // "%" column (each ability's share of ITS OWN combatant's damage) sat
  // right next to Hits and read as if it were somehow "% of hits" — it
  // wasn't wrong, just confusing next to a hit count, so it's gone rather
  // than relabeled; the little relative bar chart stays, since that's a
  // different (and clearer) way to see the same share at a glance. A cast
  // count (item 10 — only ever tracked for your own casts, see RE_CAST's
  // comment in eqp-core.js) shows as a small ×N badge next to the ability
  // name rather than its own column, since it wasn't part of the
  // requested column list and most abilities never have one at all (only
  // ones you cast yourself, and only casts landing after the fight was
  // already open — see tallyCast()'s comment).
  function renderAbilityTable(abilities) {
    if (!abilities || !abilities.length) return '<p class="muted">No ability breakdown yet.</p>';
    var maxDmg = abilities[0].damage || 0;
    var rowsHtml = abilities.map(function (a) {
      var barPct = maxDmg > 0 ? Math.max(4, (a.damage / maxDmg) * 100) : 0;
      var castBadge = a.casts > 0 ? ' <span class="cast-badge" title="Times cast">&times;' + a.casts + "</span>" : "";
      return (
        "<tr>" +
          "<td>" + esc(a.name) + castBadge +
            '<div class="ability-bar"><div class="fill" style="--pct:' + barPct.toFixed(1) + '%"></div></div>' +
          "</td>" +
          '<td class="num">' + a.hits + "</td>" +
          '<td class="num">' + fmtNum(a.damage) + "</td>" +
          '<td class="num">' + (a.pct != null ? a.pct.toFixed(1) : "0.0") + "%</td>" +
          '<td class="num">' + a.dps.toFixed(1) + "</td>" +
          '<td class="num">' + a.crits + "</td>" +
          '<td class="num">' + (a.misses || 0) + "</td>" +
        "</tr>"
      );
    }).join("");
    return (
      '<table class="ability-table"><thead><tr><th>Ability</th><th class="num">Hits</th><th class="num">Damage done</th>' +
        '<th class="num">% of dmg</th><th class="num">DPS</th><th class="num">Crits</th><th class="num">Misses</th></tr></thead>' +
      "<tbody>" + rowsHtml + "</tbody></table>"
    );
  }

  function wireCombatantCards() {
    document.querySelectorAll("[data-toggle]").forEach(function (head) {
      head.addEventListener("click", function () {
        var key = head.dataset.toggle;
        if (expanded.has(key)) expanded.delete(key); else expanded.add(key);
        head.closest(".combatant-card").classList.toggle("open", expanded.has(key));
      });
    });
    var combineBtn = document.getElementById("btn-combine-pets");
    if (combineBtn) {
      combineBtn.addEventListener("click", function () {
        combinePets = !combinePets;
        render();
      });
    }
  }

  // Settings > Theme — this window has its own copy of the same palettes
  // (see analysis.css's :root[data-theme="X"] blocks) but was never wired
  // up to actually apply one; it always showed the default look regardless
  // of what was picked in Settings. Same THEME_NAMES/data-theme pattern as
  // the mini-mode card's applySettings() in app.js.
  var THEME_NAMES = ["blue", "brass", "druidic", "magical", "girly", "hardcore", "metal"];
  function applyTheme(s) {
    if (!s) return;
    document.documentElement.setAttribute("data-theme", THEME_NAMES.indexOf(s.theme) !== -1 ? s.theme : "blue");
  }
  window.dyrelog.getSettings().then(applyTheme);
  window.dyrelog.onSettingsUpdate(applyTheme);

  window.dyrelog.getState().then(function (data) { latest = data || latest; render(); });
  window.dyrelog.onStateUpdate(function (data) { latest = data || latest; render(); });
})();
