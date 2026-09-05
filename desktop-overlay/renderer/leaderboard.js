// Leaderboards window — a thin read-only view of the same public API the
// website uses (GET /api/bosses, GET /api/bosses/:id/leaderboard, GET
// /api/leaderboard/highlights). The worker's CORS already allows this: it
// explicitly treats a null Origin (what a file:// page like this one
// sends) the same as the website's own origin — see corsOrigin() in
// worker/src/index.js, added originally for the browser overlay, which is
// also opened as a local file.
//
// "We should redesign the leaderboards tab in the overlay to be more like
// the website" — same two-panel shape as frontend/index.html now: a top
// D4-highlights panel, then a boss picker (a dropdown here, not the old
// left-side tab list) whose selection loads that boss's own leaderboard
// inline below it.
(function () {
  "use strict";

  var API_BASE = "https://dyrelog-api.dyremoon.workers.dev";
  var SITE_BASE = "https://dyrelog.pages.dev";
  var DIFFICULTY_LABELS = { D1: "D1 · Awakened", D2: "D2 · Adaptive", D3: "D3 · Fused", D4: "D4 · Refined" };

  var bosses = [];
  var selectedId = null;
  var bossesById = {};

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDifficulty(d) { return d ? (DIFFICULTY_LABELS[d] || d) : "Base"; }
  function fmtNum(n) { return Math.round(n).toLocaleString(); }
  function fmtDateOnly(ms) {
    if (!ms) return "—";
    var d = new Date(ms);
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
  }
  function bossOptionLabel(b) {
    return b.difficulty ? b.name + " — " + fmtDifficulty(b.difficulty) : b.name;
  }

  // One "open website" button, not two — it goes to whatever boss is
  // currently selected (if any), or the site's leaderboards home when
  // nothing's selected yet. See selectBoss() for the label/target update.
  document.getElementById("btn-open-site").addEventListener("click", function () {
    window.dyrelog.openExternal(selectedId ? SITE_BASE + "/boss.html?id=" + selectedId : SITE_BASE);
  });

  // ---- Highlights panel: top 10 D4 parses across every boss -------------
  async function loadHighlights() {
    var el = document.getElementById("highlights-list");
    try {
      var res = await fetch(API_BASE + "/api/leaderboard/highlights");
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();
      var highlights = data.highlights || [];
      if (!highlights.length) {
        el.innerHTML = '<p class="muted">No D4 (Refined) parses on the board yet — be the first.</p>';
        return;
      }
      el.innerHTML =
        "<table><thead><tr><th>#</th><th>Character</th><th>Class</th><th>Boss</th><th class=\"num\">DPS</th></tr></thead><tbody>" +
        highlights.map(function (h, i) {
          return (
            "<tr>" +
              '<td class="num">' + (i + 1) + "</td>" +
              "<td>" + esc(h.character_name) + ' <span class="muted">(' + esc(h.realm) + ")</span></td>" +
              '<td class="muted">' + esc(h.class_combo || "—") + "</td>" +
              "<td>" + esc(h.boss_name) + "</td>" +
              '<td class="num">' + fmtNum(h.dps) + "</td>" +
            "</tr>"
          );
        }).join("") +
        "</tbody></table>";
    } catch (err) {
      el.innerHTML = '<p class="muted">Can’t reach the leaderboard API right now.</p>';
    }
  }

  // ---- Boss picker (dropdown) + selected boss's leaderboard -------------
  // Grouped by category the same way frontend/index.html's own boss picker
  // is (see loadBossPicker() there) — this window used to just dump every
  // boss into one flat list, which is what didn't match the website.
  // <optgroup> keeps a raid's tiers together; "Dungeons" (bosses with no
  // category) sorts last, same as the website.
  function renderBossPicker() {
    var picker = document.getElementById("boss-picker");
    if (!bosses.length) {
      picker.innerHTML = '<option value="">No bosses yet</option>';
      return;
    }
    var groups = new Map();
    bosses.forEach(function (b) {
      var key = b.category || "Dungeons";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(b);
    });
    var orderedKeys = Array.from(groups.keys()).filter(function (k) { return k !== "Dungeons"; });
    if (groups.has("Dungeons")) orderedKeys.push("Dungeons");

    picker.innerHTML = orderedKeys.map(function (key) {
      return (
        '<optgroup label="' + esc(key) + '">' +
        groups.get(key).map(function (b) {
          return '<option value="' + b.id + '">' + esc(bossOptionLabel(b)) + "</option>";
        }).join("") +
        "</optgroup>"
      );
    }).join("");
  }

  async function selectBoss(id) {
    selectedId = String(id);
    updateOpenSiteButton();
    var detailEl = document.getElementById("boss-detail");
    detailEl.innerHTML = '<p class="muted">Loading&hellip;</p>';
    try {
      var res = await fetch(API_BASE + "/api/bosses/" + id + "/leaderboard");
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();
      renderBossDetail(data.boss, data.parses || [], data.entrantCount || 0);
    } catch (err) {
      detailEl.innerHTML = '<p class="muted">Can’t reach the leaderboard API right now.</p>';
    }
  }

  // The one open-website button's label/target follows whatever's
  // selected — see the click handler above. No separate per-boss button
  // duplicating it in the detail pane anymore.
  function updateOpenSiteButton() {
    var btn = document.getElementById("btn-open-site");
    var boss = selectedId && bossesById[selectedId];
    btn.textContent = boss ? "View " + boss.name + " on website ↗" : "Open full website ↗";
  }

  function renderBossDetail(boss, parses, entrantCount) {
    var detailEl = document.getElementById("boss-detail");
    var rowsHtml = parses.length
      ? '<table><thead><tr><th>#</th><th>Character</th><th>Class</th><th class="num">DPS</th><th class="num">Damage</th><th>Date</th></tr></thead><tbody>' +
        parses.map(function (p, i) {
          return (
            "<tr>" +
              '<td class="num">' + (i + 1) + "</td>" +
              "<td>" + esc(p.character_name) + ' <span class="muted">(' + esc(p.realm) + ")</span></td>" +
              '<td class="muted">' + esc(p.class_combo || "—") + "</td>" +
              '<td class="num">' + fmtNum(p.dps) + "</td>" +
              '<td class="num">' + fmtNum(p.damage) + "</td>" +
              '<td class="muted">' + fmtDateOnly(p.start_time) + "</td>" +
            "</tr>"
          );
        }).join("") +
        "</tbody></table>"
      : '<p class="muted">No verified parses for this boss yet — be the first to submit one.</p>';

    // "how many people are on that leaderboard (ex: Master Yael (4,330))" —
    // entrantCount is the real distinct-character total, not parses.length
    // (which is capped server-side), same as the website's own heading.
    var entryWord = entrantCount === 1 ? "entry" : "entries";
    detailEl.innerHTML =
      '<h3 class="boss-detail-heading">' + esc(boss.name) + ' <span class="muted">(' + fmtNum(entrantCount) + " " + entryWord + ")</span></h3>" +
      '<div class="boss-detail-meta">' + esc(fmtDifficulty(boss.difficulty)) + (boss.zone ? " &middot; " + esc(boss.zone) : "") + "</div>" +
      rowsHtml;
  }

  async function load() {
    var picker = document.getElementById("boss-picker");
    try {
      var res = await fetch(API_BASE + "/api/bosses");
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();
      bosses = data.bosses || [];
      bossesById = {};
      bosses.forEach(function (b) { bossesById[String(b.id)] = b; });
      renderBossPicker();
      picker.addEventListener("change", function () {
        if (picker.value) selectBoss(picker.value);
      });
      if (bosses.length) {
        // Same "default to whichever boss has the most tracked parses"
        // change as the website's picker (see handleBossList()'s
        // entrant_count in worker/src/leaderboard.js), not just whichever
        // boss sorts first alphabetically.
        var defaultBoss = bosses.reduce(function (best, b) {
          var count = Number(b.entrant_count) || 0;
          var bestCount = best ? (Number(best.entrant_count) || 0) : -1;
          return count > bestCount ? b : best;
        }, null) || bosses[0];
        picker.value = defaultBoss.id;
        selectBoss(defaultBoss.id);
      } else {
        document.getElementById("boss-detail").innerHTML = '<p class="muted">No bosses in the curated list yet.</p>';
      }
    } catch (err) {
      document.getElementById("empty").hidden = false;
      picker.innerHTML = '<option value="">Can’t load bosses</option>';
      document.getElementById("boss-detail").innerHTML = "";
    }
  }

  // ---- "My Kills" tab: personal best-per-boss, built entirely from local
  // history --------------------------------------------------------------
  // There's no way to fetch a real "your private submissions" list here —
  // Discord login was never wired up in this app (see app.js), so nothing
  // has ever actually been submitted to the server from it. What DOES
  // exist locally is every fight the mini-mode window has tracked, kept
  // across restarts (see loadHistory()/saveHistory() in main.js) — this
  // reduces that same history down to one best-DPS-parse row per boss
  // you've killed, exactly like a personal leaderboard, entirely offline.
  var latestState = { encounters: [], characterName: null };

  function buildPersonalBests(encounters) {
    var bestByBoss = {};
    (encounters || []).forEach(function (enc) {
      if (!enc.mobKilled) return; // only kills count, same as the public boards
      var stats = EQP.computeStats(enc);
      var youRow = (stats.rows || []).find(function (r) { return r.name === "You"; });
      if (!youRow) return;
      var name = enc.mobName || "Unknown";
      var existing = bestByBoss[name];
      if (!existing || youRow.dps > existing.dps) {
        bestByBoss[name] = { name: name, dps: youRow.dps, damage: youRow.damage, startTime: enc.startTime };
      }
    });
    return Object.keys(bestByBoss)
      .map(function (k) { return bestByBoss[k]; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  function renderPersonalList() {
    var el = document.getElementById("personal-list");
    var bests = buildPersonalBests(latestState.encounters);
    if (!bests.length) {
      el.innerHTML = '<p class="muted">No boss kills saved yet — kill something in the mini-mode overlay and your best parse against it will show up here.</p>';
      return;
    }
    el.innerHTML =
      '<table><thead><tr><th>Boss</th><th class="num">DPS</th><th class="num">Damage</th><th>Date</th></tr></thead><tbody>' +
      bests.map(function (b) {
        return (
          "<tr>" +
            "<td>" + esc(b.name) + "</td>" +
            '<td class="num">' + fmtNum(b.dps) + "</td>" +
            '<td class="num">' + fmtNum(b.damage) + "</td>" +
            '<td class="muted">' + fmtDateOnly(b.startTime) + "</td>" +
          "</tr>"
        );
      }).join("") +
      "</tbody></table>";
  }

  var lbTabs = document.getElementById("lb-tabs");
  var lbBody = document.getElementById("lb-body");
  var personalBody = document.getElementById("personal-body");
  lbTabs.addEventListener("click", function (e) {
    var btn = e.target.closest(".detail-tab");
    if (!btn) return;
    var view = btn.dataset.view;
    Array.prototype.forEach.call(lbTabs.querySelectorAll(".detail-tab"), function (b) {
      b.classList.toggle("active", b === btn);
    });
    lbBody.hidden = view !== "public";
    personalBody.hidden = view !== "personal";
    if (view === "personal") renderPersonalList();
  });

  window.dyrelog.getState().then(function (data) { latestState = data || latestState; renderPersonalList(); });
  window.dyrelog.onStateUpdate(function (data) { latestState = data || latestState; renderPersonalList(); });

  // Settings > Theme — same fix as the Analysis window (see analysis.js):
  // this window shares analysis.css's palettes but was never told which
  // one to apply.
  var THEME_NAMES = ["blue", "brass", "druidic", "magical", "girly", "hardcore", "metal"];
  function applyTheme(s) {
    if (!s) return;
    document.documentElement.setAttribute("data-theme", THEME_NAMES.indexOf(s.theme) !== -1 ? s.theme : "blue");
  }
  window.dyrelog.getSettings().then(applyTheme);
  window.dyrelog.onSettingsUpdate(applyTheme);

  loadHighlights();
  load();
})();
