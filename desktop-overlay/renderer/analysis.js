(function () {
  "use strict";

  var SITE_BASE = "https://dyrelog.pages.dev";

  var selectedKey = null;
  window.dyrelog.onFightPicked(function (key) { selectedKey = String(key); render(); });
  var selectedMemberIndex = null;






  var activeDetailTab = "outgoing";
  var latest = { current: null, encounters: [], characterName: null, gapMs: 9000 };
  var expanded = new Set();
  var combinePets = false;

  document.getElementById("btn-open-site").addEventListener("click", function () {
    var sessions = buildSessions();
    var session = sessions.find(function (s) { return sessionKey(s) === selectedKey; });
    var submitted = session && session.members.find(function (m) { return m.submissionId != null; });
    if (submitted) {
      var url = SITE_BASE + "/analyze.html?submissionId=" + encodeURIComponent(submitted.submissionId) +
        "&name=" + encodeURIComponent(latest.characterName || "");
      window.dyrelog.openExternal(url);
    } else {
      window.dyrelog.openExternal(SITE_BASE + "/analyze.html");
    }
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
  function fmtClock(ms) {
    var d = new Date(ms);
    var h = d.getHours(), m = d.getMinutes();
    var ampm = h >= 12 ? "PM" : "AM";
    h = h % 12; if (h === 0) h = 12;
    return h + ":" + (m < 10 ? "0" : "") + m + " " + ampm;
  }
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
  var RANK_SWATCHES = ["--rank1", "--rank2", "--rank3", "--rank4", "--rank5", "--rank6"];

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
    return sessions;
  }

  function sessionKey(session) { return String(session.members[0].startTime); }

  function sessionLabel(session) {
    var merged = EQP.mergeEncounters(session.members);
    var stats = EQP.computeStats(merged);
    var byMob = stats.byMob || [];
    if (!byMob.length) return "Unknown target";
    var primary = byMob[0];
    var partyCount = (stats.rows || []).filter(function (r) { return r.name !== "You"; }).length;
    return primary.name +
      (primary.generation > 1 ? " (spawn " + primary.generation + ")" : "") +
      (partyCount > 0 ? " +" + partyCount : "");
  }

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

  // Wraps a section's inner HTML in the bordered .analysis-section card
  // (see analysis.css) — "" stays "" so a section with nothing to show
  // (no healing, single mob, etc.) never renders an empty bordered box.
  function wrapSection(html, extraClass) {
    if (!html) return "";
    return '<div class="analysis-section' + (extraClass ? " " + extraClass : "") + '">' + html + "</div>";
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
      // No zone-in line seen for this fight (started mid-zone, or before
      // the app was tailing) — assumed D0 rather than shown as
      // "unknown," same fallback an explicitly-detected base zone gets.
      var diff = DIFFICULTY_LABELS[lastMember.difficulty] || "D0";
      return (
        '<div class="enc-row' + (k === selectedKey ? " active" : "") + '" data-key="' + esc(k) + '">' +
          '<div class="mob" title="The number in parentheses is which spawn of this mob name this is in your whole loaded log — not a kill count.">' + esc(sessionLabel(session)) + "</div>" +
          '<div class="meta">' + (session.isLive ? '<span class="live-tag">● live</span> &middot; ' : "") +
            fmtClock(session.members[0].startTime) + " &middot; " + fmtDur(data.stats.duration) + " &middot; " + diff +
            (data.merged.mobKillCount > 1 ? " &middot; " + data.merged.mobKillCount + " kills" : "") +
            " &middot; " + (data.stats.raidDps || 0).toFixed(1) + " dps" +
          "</div>" +
        "</div>"
      );
    }).join("");

    document.querySelectorAll(".enc-row").forEach(function (row) {
      row.addEventListener("click", function () {
        if (row.dataset.key === selectedKey) return;
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
    // Same "assume D0 when no zone-in line was seen" fallback as the list above.
    var diff = DIFFICULTY_LABELS[merged.difficulty] || "D0";

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

    var activeByMob = activeStats.byMob || [];
    var canExpand = true;
    var deepDiveMobName = activeByMob.length === 1 ?
      activeByMob[0].name + (activeByMob[0].generation > 1 ? " (spawn " + activeByMob[0].generation + ")" : "") : null;
    var combineToggleHtml =
      '<button class="btn-toggle-sm' + (combinePets ? " active" : "") + '" id="btn-combine-pets" type="button" title="Only merges pets EQ names after their owner (like &quot;Owner`s warder&quot;) — a custom-named pet (e.g. a necro\'s skeleton) can\'t be identified as a pet and stays separate.">' +
        (combinePets ? "&#10003; Pets combined with owners" : "Combine pets with owners") +
      "</button>";
    var multiMobCaveat = activeByMob.length > 1
      ? '<p class="muted" style="font-size:0.8rem; margin:-6px 0 10px;">More than one target was fought in this view — click a combatant for its full spell/ability breakdown across all of them (not split out per target).</p>'
      : '<p class="muted" style="font-size:0.8rem; margin:-6px 0 10px;">Click a combatant for its full spell/ability breakdown.</p>';
    var combatantSectionHtml =
      '<div class="section-label-row"><p class="section-label">Combatants' + (deepDiveMobName ? " against " + esc(deepDiveMobName) : "") + "</p>" + combineToggleHtml + "</div>" +
      multiMobCaveat +
      '<div class="combatants" id="combatants">' + rows.map(function (r, i) { return renderCombatantCard(r, i, viewKey, showPct); }).join("") + "</div>";

    var dpsChartSection = renderDpsChartSection(activeStats);
    var outgoingHtml =
      wrapSection(dpsChartSection.html, "analysis-section-dps") +
      wrapSection(renderMobsFoughtSection(stats), "analysis-section-mobs") +
      (pillsHtml ? wrapSection(pillsHtml, "analysis-section-mobs") : "") +
      wrapSection(combatantSectionHtml, "analysis-section-combatants") +
      wrapSection(renderHealingSection(activeStats.healing), "analysis-section-healing") +
      wrapSection(renderProcsSection(activeStats), "analysis-section-procs") +
      wrapSection(renderTeamAbilitySection(activeStats, combinePets), "analysis-section-team");

    var incomingTab = activeDetailTab === "incoming" ? renderIncomingTab(activeEnc, activeStats) : null;

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
      (incomingTab ? incomingTab.html : outgoingHtml);

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
    var activeChartWire = incomingTab ? incomingTab.wire : dpsChartSection.wire;
    if (activeChartWire) activeChartWire(els.detail);
  }

  function renderMobsFoughtSection(stats) {
    var byMob = stats.byMob || [];
    if (byMob.length <= 1) return "";
    var rowsHtml = byMob.map(function (m) {
      return (
        "<tr>" +
          "<td>" + esc((m.name || "Unknown target") + (m.generation > 1 ? " (spawn " + m.generation + ")" : "")) +
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
      "<tbody>" + rowsHtml + "</tbody></table>" +
      '<p class="muted" style="font-size:0.8rem; margin-top:8px;">If two mobs share the exact same name and are fought at the same time, the log has no way to tell them apart, so their damage is combined into one row above.</p>'
    );
  }

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

  function buildDpsChart(timeline, duration, mode) {
    mode = mode === "in" ? "in" : "both";
    if (!timeline || timeline.length < 2) return null;
    var outVals = timeline.map(function (p) { return p.out; });
    var inVals = timeline.map(function (p) { return p.in; });
    var smoothOut = smoothSeries(outVals, 5);
    var smoothIn = smoothSeries(inVals, 5);
    var hasIn = inVals.some(function (v) { return v > 0; });
    if (mode === "in" && !hasIn) return null;
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
    function pctX(x) { return (x / W * 100).toFixed(2) + "%"; }
    function pctY(y) { return (y / H * 100).toFixed(2) + "%"; }
    function pathFor(vals) {
      return vals.map(function (v, i) { return (i === 0 ? "M" : "L") + xAt(i).toFixed(1) + "," + yAt(v).toFixed(1); }).join(" ");
    }

    var peakIdx = 0, peakVal = -1;
    primary.forEach(function (v, i) { if (v > peakVal) { peakVal = v; peakIdx = i; } });
    var peakX = xAt(peakIdx), peakY = yAt(peakVal);
    var peakAbove = peakY > padT + 18;
    var peakSuffix = mode === "in" ? " dps taken" : " dps";
    // Clamped in the SAME svg-unit space the dot lives in, then converted
    // to a % just like every other overlay label below, so it never runs
    // off either edge of the chart regardless of how wide it renders.
    var peakLabelX = Math.min(Math.max(peakX, padL + 30), W - padR - 30);

    var gridHtml = [0.5, 1].map(function (frac) {
      var y = padT + plotH * (1 - frac);
      return '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '" class="dps-grid" />';
    }).join("");

    var overlayHtml =
      [0.5, 1].map(function (frac) {
        return '<div class="dps-axis-label dps-axis-label-y" style="top:' + pctY(padT + plotH * (1 - frac)) + '; right:' + (100 - parseFloat(pctX(padL - 6))).toFixed(2) + '%;">' + fmtAbbrev(maxVal * frac) + "</div>";
      }).join("") +
      '<div class="dps-axis-label dps-axis-label-x" style="left:' + pctX(padL) + '; top:' + pctY(H - 4) + ';">0:00</div>' +
      '<div class="dps-axis-label dps-axis-label-x dps-axis-label-x-end" style="left:' + pctX(W - padR) + '; top:' + pctY(H - 4) + ';">' + fmtDur(duration) + "</div>" +
      '<div class="dps-peak-label" style="left:' + pctX(peakLabelX) + '; top:' + pctY(peakAbove ? peakY - 8 : peakY + 16) + ';">Peak ' + fmtAbbrev(peakVal) + peakSuffix + "</div>";

    var html =
      '<div class="dps-chart-wrap">' +
        '<div class="dps-chart-plot">' +
          '<svg class="dps-chart" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none">' +
            gridHtml +
            (showIn && mode === "both" ? '<path d="' + pathFor(smoothIn) + '" class="dps-line-in" fill="none" />' : "") +
            (mode === "in" ? '<path d="' + pathFor(smoothIn) + '" class="dps-line-in-solo" fill="none" />' : '<path d="' + pathFor(smoothOut) + '" class="dps-line-out" fill="none" />') +
            '<line class="dps-hover-line" x1="0" y1="' + padT + '" x2="0" y2="' + (H - padB) + '" hidden />' +
            '<circle cx="' + peakX.toFixed(1) + '" cy="' + peakY.toFixed(1) + '" r="3.5" class="dps-peak-dot' + (mode === "in" ? " dps-peak-dot-in" : "") + '" />' +
          "</svg>" +
          overlayHtml +
          '<div class="dps-hover-tip" hidden></div>' +
        "</div>" +
        '<div class="dps-chart-legend">' +
          (mode === "in"
            ? '<span class="legend-item"><span class="legend-swatch in"></span>Incoming</span>'
            : '<span class="legend-item"><span class="legend-swatch out"></span>Your DPS</span>' +
              (showIn ? '<span class="legend-item"><span class="legend-swatch in"></span>Incoming</span>' : "")) +
        "</div>" +
      "</div>";

    function wire(root) {
      var wrap = root.querySelector(".dps-chart-wrap");
      if (!wrap) return;
      var svg = wrap.querySelector(".dps-chart");
      var hoverLine = wrap.querySelector(".dps-hover-line");
      var tip = wrap.querySelector(".dps-hover-tip");
      function showAt(clientX) {
        var rect = svg.getBoundingClientRect();
        if (!rect.width) return;
        var svgX = (clientX - rect.left) / rect.width * W;
        var rel = Math.max(0, Math.min(1, (svgX - padL) / plotW));
        var idx = Math.round(rel * (n - 1));
        var x = xAt(idx);
        hoverLine.setAttribute("x1", x.toFixed(1));
        hoverLine.setAttribute("x2", x.toFixed(1));
        hoverLine.removeAttribute("hidden");
        var outV = Math.round(smoothOut[idx]), inV = Math.round(smoothIn[idx]);
        var rows = mode === "in"
          ? '<div class="tip-row"><span class="tip-dot tip-dot-in"></span>Incoming <b>' + inV + " dps</b></div>"
          : '<div class="tip-row"><span class="tip-dot tip-dot-out"></span>Your DPS <b>' + outV + " dps</b></div>" +
            (hasIn ? '<div class="tip-row"><span class="tip-dot tip-dot-in"></span>Incoming <b>' + inV + " dps</b></div>" : "");
        tip.innerHTML = '<div class="tip-time">' + fmtDur(timeline[idx].t) + " &middot; 5s rolling</div>" + rows;
        tip.hidden = false;
        // Keep the tooltip box itself away from the very edges so it
        // never gets clipped by the chart's own bounds.
        tip.style.left = Math.min(Math.max(x / W * 100, 14), 86).toFixed(2) + "%";
      }
      wrap.addEventListener("mousemove", function (evt) { showAt(evt.clientX); });
      wrap.addEventListener("mouseleave", function () { hoverLine.setAttribute("hidden", ""); tip.hidden = true; });
    }

    return { html: html, wire: wire };
  }

  function renderDpsChartSection(activeStats) {
    var chart = buildDpsChart(activeStats.timeline, activeStats.duration);
    if (!chart) return { html: "", wire: null };
    return { html: '<p class="section-label">DPS over time</p>' + chart.html, wire: chart.wire };
  }

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

  function renderIncomingChartSection(activeStats) {
    var chart = buildDpsChart(activeStats.timeline, activeStats.duration, "in");
    if (!chart) return { html: "", wire: null };
    return { html: '<p class="section-label">Incoming damage over time</p>' + chart.html, wire: chart.wire };
  }

  function renderIncomingBreakdownSection(activeEnc, activeStats) {
    var byMob = (activeStats.byMob || []).filter(function (m) { return m.totalTaken > 0; });
    var taken = EQP.computeTakenStats(activeEnc);
    var totalTaken = taken.totalTaken;
    var dur = Math.max(activeStats.duration || 0, 1);
    var hitsByName = {};
    (taken.rows || []).forEach(function (r) { hitsByName[r.name] = r.hits; });
    var attributed = byMob.reduce(function (sum, m) { return sum + m.totalTaken; }, 0);
    var unattributed = Math.max(0, totalTaken - attributed);
    var rowsHtml = byMob.map(function (m) {
      return (
        "<tr>" +
          "<td>" + esc(m.name + (m.generation > 1 ? " (spawn " + m.generation + ")" : "")) + "</td>" +
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
    var chartSection = renderIncomingChartSection(activeStats);
    var html =
      '<div class="stat-chips">' +
        '<span class="stat-chip accent">' + fmtNum(taken.totalTaken) + " dmg taken</span>" +
        '<span class="stat-chip accent">' + (taken.totalTaken / dur).toFixed(1) + " dps taken</span>" +
        (healTotal > 0 ? '<span class="stat-chip">' + fmtNum(healTotal) + " healing received</span>" : "") +
      "</div>" +
      wrapSection(chartSection.html, "analysis-section-incoming-dps") +
      wrapSection(renderIncomingBreakdownSection(activeEnc, activeStats), "analysis-section-incoming-breakdown") +
      wrapSection(renderHealingSection(activeStats.healing), "analysis-section-healing");
    return { html: html, wire: chartSection.wire };
  }

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
    procs.sort(function (a, b) { return b.damage - a.damage; });
    var dur = Math.max(stats.duration, 1);
    var durMin = dur / 60;
    var totalHits = procs.reduce(function (sum, a) { return sum + a.hits; }, 0);
    var totalDamage = procs.reduce(function (sum, a) { return sum + a.damage; }, 0);
    var rowsHtml = procs.map(function (a) {
      return (
        '<div class="proc-row">' +
          '<span class="proc-dot"></span>' +
          '<span class="proc-name">' + esc(a.name) + "</span>" +
          '<span class="proc-stat">' + fmtNum(a.damage) + "</span>" +
          '<span class="proc-stat">' + (a.damage / dur).toFixed(1) + " dps</span>" +
          '<span class="proc-stat">' + a.pct.toFixed(1) + "%</span>" +
          '<span class="proc-ppm">' + (a.hits / durMin).toFixed(2) + " ppm</span>" +
          '<span class="proc-count">×' + a.hits + "</span>" +
        "</div>"
      );
    }).join("");
    return (
      '<div class="section-label-row">' +
        '<p class="section-label">Procs</p>' +
        '<span class="section-stat">' + fmtNum(totalDamage) + " dmg · " + totalHits + " procs · " + (totalHits / durMin).toFixed(1) + " ppm</span>" +
      "</div>" +
      '<div class="procs-list">' + rowsHtml + "</div>"
    );
  }

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

  function renderTeamAbilitySection(activeStats, combinePets) {
    var rows = buildTeamAbilityRows(activeStats.abilitiesByCombatant, combinePets, activeStats.duration, activeStats.totalDamage);
    if (!rows.length) return "";
    return (
      '<p class="section-label">Full team — damage by ability</p>' +
      '<p class="muted" style="font-size:0.8rem; margin:-6px 0 10px;">Every participating combatant\'s damage this fight, broken down per ability — the same ability used by more than one combatant gets its own line each.</p>' +
      renderTeamAbilityTable(rows)
    );
  }

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
