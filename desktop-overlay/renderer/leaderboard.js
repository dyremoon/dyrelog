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
  var bossRequest = 0;
  var currentBoard = null;
  var fightRequest = 0;
  var personalSort = { key: 'dps', dir: -1 };
  var boardSort = { key: 'dps', dir: -1 };
  function sortRows(rows, key, dir) { return rows.slice().sort(function (a, b) { var av = key === 'difficulty' ? Number((a.difficulty || 'D0').slice(1)) : key === 'character' ? String(a.character_name || a.name).toLowerCase() : key === 'name' ? String(a.name || '').toLowerCase() : key === 'date' ? Number(a.startTime || a.start_time || 0) : key === 'visibility' ? String(a.sortVisibility || a.visibility || '').toLowerCase() : key === 'review' ? String(a.sortReview || a.status || '').toLowerCase() : Number(a[key] || 0); var bv = key === 'difficulty' ? Number((b.difficulty || 'D0').slice(1)) : key === 'character' ? String(b.character_name || b.name).toLowerCase() : key === 'name' ? String(b.name || '').toLowerCase() : key === 'date' ? Number(b.startTime || b.start_time || 0) : key === 'visibility' ? String(b.sortVisibility || b.visibility || '').toLowerCase() : key === 'review' ? String(b.sortReview || b.status || '').toLowerCase() : Number(b[key] || 0); return typeof av === 'string' ? av.localeCompare(bv) * dir : (av - bv) * dir; }); }
  function sortHeader(label, key, state) { return '<button class="table-sort" data-sort-key="' + key + '">' + label + (state.key === key ? (state.dir < 0 ? ' ↓' : ' ↑') : '') + '</button>'; }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDifficulty(d) { return d ? (DIFFICULTY_LABELS[d] || d) : "D0"; }
  function fmtNum(n) { return Math.round(n).toLocaleString(); }
  function fmtDateOnly(ms) {
    if (!ms) return "—";
    var d = new Date(ms);
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
  }
  function bossOptionLabel(b) {
    var count = Number(b.entrant_count) || 0;
    return b.name + ' (' + count.toLocaleString() + ')';
  }

  // One "open website" button, not two — it goes to whatever boss is
  // currently selected (if any), or the site's leaderboards home when
  // nothing's selected yet. See selectBoss() for the label/target update.
  document.getElementById("btn-open-site").addEventListener("click", function () {
    window.dyrelog.openExternal(selectedId ? SITE_BASE + "/boss.html?id=" + selectedId : SITE_BASE);
  });

  // Item 5 — "inside of the Leaderboards overlay, I want a link to
  // 'submission settings'." Jumps Settings straight to the Options tab
  // (Account + Leaderboard submission live there) instead of the default
  // Appearance tab — see openSettings()'s tab argument in preload.js.
  document.getElementById("btn-submission-settings").addEventListener("click", function () {
    window.dyrelog.openSettings("options");
  });

  // ---- Highlights panel: top 10 parses across every difficulty and boss -------------
  async function loadHighlights() {
    var el = document.getElementById("highlights-list");
    try {
      var res = await fetch(API_BASE + "/api/leaderboard/highlights");
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();
      var highlights = data.highlights || [];
      if (!highlights.length) {
        el.innerHTML = '<p class="muted">No public verified parses this week yet.</p>';
        return;
      }
      el.innerHTML =
        "<table><thead><tr><th>#</th><th>Character</th><th>Class</th><th>Boss</th><th>Difficulty</th><th class=\"num\">DPS</th></tr></thead><tbody>" +
        highlights.map(function (h, i) {
          return (
            "<tr>" +
              '<td class="num">' + (i + 1) + "</td>" +
              "<td>" + esc(h.character_name) + ' <span class="muted">(' + esc(h.realm) + ")</span></td>" +
              '<td class="muted">' + esc(h.class_combo || "—") + "</td>" +
              "<td>" + esc(h.boss_name) + "</td><td>" + esc(h.difficulty || "D0") + "</td>" +
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
    var generation = ++bossRequest;
    selectedId = String(id);
    updateOpenSiteButton();
    var detailEl = document.getElementById("boss-detail");
    detailEl.innerHTML = '<p class="muted">Loading&hellip;</p>';
    try {
      var boss = bossesById[selectedId];
      var results = await Promise.all(boss.tiers.map(async function (tier) {
        var res = await fetch(API_BASE + "/api/bosses/" + tier.id + "/leaderboard");
        if (!res.ok) throw new Error("HTTP " + res.status);
        var data = await res.json();
        return (data.parses || []).map(function (row) { return Object.assign({}, row, { difficulty: tier.difficulty || 'D0' }); });
      }));
      if (generation !== bossRequest) return;
      currentBoard = { boss: boss, rows: results.flat() };
      renderBossDetail(boss, currentBoard.rows, 0);
    } catch (err) {
      if (generation === bossRequest) detailEl.innerHTML = '<p class="muted">Can’t reach the leaderboard API right now.</p>';
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

  function renderBossDetail(boss, parses) {
    var detail = document.getElementById('boss-detail');
    detail.innerHTML = '<h3>' + esc(boss.name) + '</h3>' +
      '<div class="lb-picker-row"><fieldset id="difficulty-filter" class="difficulty-checks"><legend>Difficulty</legend>' +
      '<label><input id="difficulty-all" type="checkbox" checked> All</label>' +
      ['D0', 'D1', 'D2', 'D3', 'D4'].map(d => '<label><input type="checkbox" value="' + d + '" checked> ' + d + '</label>').join('') + '</fieldset>' +
      '<label for="board-sort">Sort</label><select id="board-sort"><option value="dps">Highest DPS</option><option value="difficulty">Difficulty: D4 to D0</option></select></div>' +
      '<p class="muted">Best parses per character and difficulty; up to 50 entries per boss tier.</p><div id="board-rows"></div>';
    function update() {
      var difficulties = Array.from(document.getElementById('difficulty-filter').querySelectorAll('input[type="checkbox"]:checked'), input => input.value).filter(value => value !== 'on');
      var rows = BossBrowser.rankRows(parses, difficulties, document.getElementById('board-sort').value || 'dps');
      document.getElementById('board-rows').innerHTML = difficulties.length ? renderFightRows(rows, true) : '<p class="muted">Select at least one difficulty to show parses.</p>';
      document.getElementById('board-rows').querySelectorAll('[data-sort-key]').forEach(function (button) { button.addEventListener('click', function () { var key = button.dataset.sortKey; if (boardSort.key === key) boardSort.dir *= -1; else { boardSort.key = key; boardSort.dir = 1; } update(); }); });
    }
    document.getElementById('difficulty-filter').addEventListener('change', function (event) {
      var all = document.getElementById('difficulty-all');
      var boxes = Array.from(document.getElementById('difficulty-filter').querySelectorAll('input[value]'));
      if (event.target === all) boxes.forEach(function (box) { box.checked = all.checked; });
      else all.checked = boxes.every(function (box) { return box.checked; });
      update();
    });
    document.getElementById('board-sort').addEventListener('change', update);
    update();
  }

  function renderFightRows(rows, showDifficulty) {
    if (!rows.length) return '<p class="muted">No public verified parses for this selection.</p>';
    var state = boardSort;
    rows = sortRows(rows, state.key, state.dir);
    return '<table><thead><tr><th>#</th><th>' + sortHeader('Character', 'character', state) + '</th><th>Class</th>' + (showDifficulty ? '<th>' + sortHeader('Difficulty', 'difficulty', state) + '</th>' : '') +
      '<th>' + sortHeader('DPS', 'dps', state) + '</th><th>' + sortHeader('Damage', 'damage', state) + '</th><th></th></tr></thead><tbody>' + rows.map(function (p, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(p.character_name) + ' <span class="muted">(' + esc(p.realm) + ')</span></td><td>' + esc(p.class_combo || '—') + '</td>' +
          (showDifficulty ? '<td>' + esc(p.difficulty || 'D0') + '</td>' : '') + '<td>' + fmtNum(p.dps) + '</td><td>' + fmtNum(p.damage) + '</td><td>' +
          (showDifficulty ? '<button class="view-lb-link" data-encounter-id="' + Number(p.encounter_id) + '">Analyze</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  async function openFight(id) {
    var generation = ++fightRequest;
    var panel = document.getElementById('fight-body');
    var detail = document.getElementById('fight-detail');
    panel.dataset.returnView = personalBody.hidden ? 'public' : 'personal';
    lbBody.hidden = true;
    personalBody.hidden = true;
    panel.hidden = false;
    detail.innerHTML = '<p class="muted">Loading fight…</p>';
    try {
      var response = await fetch(API_BASE + '/api/encounters/' + encodeURIComponent(id));
      if (!response.ok) throw new Error('Unavailable');
      var data = await response.json();
      if (generation !== fightRequest) return;
      detail.innerHTML = '<h2>' + esc(data.encounter.boss_name || 'Fight') + '</h2><p class="muted">' +
        esc(new Date(data.encounter.start_time).toLocaleString()) + ' · ' + (data.encounter.killed ? 'Killed' : 'Not killed') + ' · ' +
        fmtNum(data.encounter.raid_dps) + ' raid DPS</p>' + renderFightRows(data.parses || [], false);
    } catch (_err) {
      if (generation === fightRequest) detail.innerHTML = '<p class="muted">This fight is unavailable. It may be private, under review, removed, or temporarily unreachable.</p>';
    }
  }

  document.getElementById('fight-back').addEventListener('click', function () {
    ++fightRequest;
    var panel = document.getElementById('fight-body');
    panel.hidden = true;
    lbBody.hidden = panel.dataset.returnView !== 'public';
    personalBody.hidden = panel.dataset.returnView !== 'personal';
  });
  document.getElementById('boss-detail').addEventListener('click', function (event) {
    var button = event.target.closest('[data-encounter-id]');
    if (button) openFight(button.dataset.encounterId);
  });
  async function load() {
    var picker = document.getElementById("boss-picker");
    try {
      var res = await fetch(API_BASE + "/api/bosses");
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();
      bosses = BossBrowser.groupBosses(data.bosses || []);
      bossesById = {};
      bossNames = new Set();
      bosses.forEach(function (b) { bossesById[String(b.id)] = b; if (b.name) bossNames.add(b.name); });
      renderPersonalList(); // in case "My Kills" was already open when this resolved
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
  var submissionRows = null;
  var refreshGeneration = 0;
  var refreshTimer = null;

  function scheduleStatusRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshSubmissionStatuses, 250);
  }

  async function refreshSubmissionStatuses() {
    var generation = ++refreshGeneration;
    var ids = Array.from(new Set(buildPersonalBests(latestState.encounters)
      .map(function (b) { return Number(b.submissionId); })
      .filter(function (id) { return Number.isSafeInteger(id) && id > 0; })));
    var rows = [];
    try {
      for (var i = 0; i < ids.length; i += 50) {
        var result = await window.dyrelog.getSubmissionStatuses(ids.slice(i, i + 50));
        if (!result.ok || !Array.isArray(result.submissions)) throw new Error('Status unavailable');
        rows = rows.concat(result.submissions);
      }
      if (generation !== refreshGeneration) return;
      submissionRows = rows;
    } catch (_err) {
      if (generation !== refreshGeneration) return;
      submissionRows = null;
    }
    renderPersonalList();
  }

  // Only real bosses (the curated list `load()` fetches below) belong on
  // "My Kills" — every regular trash mob you've killed was showing up here
  // too before, since this used to key off ANY tracked encounter. Exact-
  // match on mobName, same convention as app.js's own isKnownBoss() gating
  // the Submit prompt. Left null until the boss list actually loads so a
  // slow/failed fetch briefly shows everything rather than wrongly hiding
  // real bosses — this list is read-only and re-renders once bosses arrive,
  // so a brief over-show here is just a flicker, not a wrong Submit.
  var bossNames = null;
  // Same "+N" tier-suffix normalization as app.js's isKnownBoss() — see
  // its comment there ("I'm in a +4").
  function stripTierSuffix(name) {
    return name ? name.replace(/\s*\+\d+\s*$/, "") : name;
  }
  function isKnownBoss(mobName) {
    if (!bossNames) return true; // bosses haven't loaded (or failed) — don't hide everything yet
    return !!findBossByName(mobName);
  }

  function buildPersonalBests(encounters) {
    var bestByBoss = {};
    (encounters || []).forEach(function (enc) {
      if (!enc.mobKilled) return; // only kills count, same as the public boards
      var name = enc.mobName || "Unknown";
      if (!isKnownBoss(name)) return; // trash mob — not on the curated boss list
      var stats = EQP.computeStats(enc);
      var youRow = (stats.rows || []).find(function (r) { return r.name === "You"; });
      if (!youRow) return;
      var difficulty = enc.difficultyKnown ? enc.difficulty : 'D0';
      var bestKey = name + '|' + difficulty;
      var existing = bestByBoss[bestKey];
      if (!existing || youRow.dps > existing.dps) {
        bestByBoss[bestKey] = {
          name: name, dps: youRow.dps, damage: youRow.damage, startTime: enc.startTime,
          difficulty: difficulty,
          // Written by main.js's recordSubmission() once a submit actually
          // resolves — see performSubmit()'s result there. Absent (null)
          // until then, which reads the same as "not public" below.
          submissionId: enc.submissionId || null,
          status: enc.submissionStatus || null,
          visibility: enc.submissionVisibility || null
        };
      }
    });
    return Object.keys(bestByBoss)
      .map(function (k) { return bestByBoss[k]; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  // "I want a button in 'My kills' to view that boss on the public
  // leaderboards." Matches on the same exact-or-tier-stripped name as
  // isKnownBoss() above, since a "My Kills" row's name can still carry a
  // "+N" suffix the curated bosses list itself doesn't.
  function findBossByName(name) {
    if (!name || !bosses.length) return null;
    var stripped = stripTierSuffix(name);
    for (var i = 0; i < bosses.length; i++) {
      if (BossBrowser.key(bosses[i].name) === BossBrowser.key(stripped)) return bosses[i];
    }
    return null;
  }

  // Switches to the Public Leaderboards tab already scoped to one boss —
  // same tab-toggle bookkeeping the lbTabs click handler below does.
  function viewBossOnPublicLeaderboard(bossId) {
    var tabBtn = lbTabs.querySelector('.detail-tab[data-view="public"]');
    Array.prototype.forEach.call(lbTabs.querySelectorAll(".detail-tab"), function (b) {
      b.classList.toggle("active", b === tabBtn);
    });
    lbBody.hidden = false;
    personalBody.hidden = true;
    var picker = document.getElementById("boss-picker");
    picker.value = bossId;
    selectBoss(bossId);
  }

  // "I want the 'view on leaderboard' to only appear if there is a public
  // log of it. Then that link takes the user to the log in the public log.
  // Secondly, I want a link to the bosses leaderboard if you click the
  // boss's name. I also don't want the bosses name to be 'xyz D4' I want it
  // to be 'xyz' then with a column called difficulty." Three separate
  // changes below: (1) name/difficulty split into two columns, (2) the boss
  // NAME is now always a link (when matched) straight to that boss's public
  // leaderboard, regardless of this particular kill's own status, (3) the
  // old "View on leaderboard" button only shows once this exact kill is
  // actually verified+public, and now opens that exact log on the website
  // instead of just the boss's leaderboard.
  function renderPersonalList() {
    var el = document.getElementById("personal-list");
    var bests = buildPersonalBests(latestState.encounters);
    if (!bests.length) {
      el.innerHTML = '<p class="muted">No boss kills saved yet — kill something in the mini-mode overlay and your best parse against it will show up here.</p>';
      return;
    }
    var selectedDifficulties = (el.dataset.difficulties || 'D0,D1,D2,D3,D4').split(',').filter(Boolean);
    var visibleBests = bests.filter(function (b) { return selectedDifficulties.indexOf(b.difficulty) !== -1; });
    el.innerHTML = '<fieldset id="personal-difficulty" class="difficulty-checks"><legend>Difficulty</legend><label><input id="personal-difficulty-all" type="checkbox"> All</label>' +
      ['D0', 'D1', 'D2', 'D3', 'D4'].map(function (d) { return '<label><input type="checkbox" value="' + d + '"> ' + d + '</label>'; }).join('') + '</fieldset>' +
      '<table><thead><tr><th>' + sortHeader('Boss', 'name', personalSort) + '</th><th>' + sortHeader('Difficulty', 'difficulty', personalSort) + '</th><th class="num">' + sortHeader('DPS', 'dps', personalSort) + '</th><th class="num">' + sortHeader('Damage', 'damage', personalSort) + '</th><th>' + sortHeader('Date', 'date', personalSort) + '</th><th>' + sortHeader('Visibility', 'visibility', personalSort) + '</th><th>' + sortHeader('Review', 'review', personalSort) + '</th><th></th></tr></thead><tbody>' +
      sortRows(visibleBests.map(function (b) { var s = SubmissionView.describeSubmission(b, submissionRows); return Object.assign({}, b, { sortVisibility: s.visibility, sortReview: s.review }); }), personalSort.key, personalSort.dir).map(function (b) {
        var matchedBoss = findBossByName(b.name);
        var nameCell = matchedBoss
          ? '<a href="#" class="boss-name-link" data-boss-id="' + matchedBoss.id + '">' + esc(stripTierSuffix(b.name)) + "</a>"
          : esc(stripTierSuffix(b.name));
        var submission = SubmissionView.describeSubmission(b, submissionRows);
        var viewCell = '<button class="view-lb-link" data-fight-key="' + esc(String(b.startTime)) + '">Analyze</button>';
        return (
          "<tr>" +
            "<td>" + nameCell + "</td>" +
            '<td class="muted">' + esc(fmtDifficulty(b.difficulty)) + "</td>" +
            '<td class="num">' + fmtNum(b.dps) + "</td>" +
            '<td class="num">' + fmtNum(b.damage) + "</td>" +
            '<td class="muted">' + fmtDateOnly(b.startTime) + "</td>" +
            '<td>' + esc(submission.visibility) + '</td>' +
            '<td class="muted">' + esc(submission.review) + '</td>' +
            '<td>' + viewCell + "</td>" +
          "</tr>"
        );
      }).join("") +
      "</tbody></table>";
    var personalDifficulty = document.getElementById('personal-difficulty');
    el.querySelectorAll('[data-sort-key]').forEach(function (button) { button.addEventListener('click', function () { var key = button.dataset.sortKey; if (personalSort.key === key) personalSort.dir *= -1; else { personalSort.key = key; personalSort.dir = 1; } renderPersonalList(); }); });
    var personalAll = document.getElementById('personal-difficulty-all');
    var personalBoxes = Array.from(personalDifficulty.querySelectorAll('input[value]'));
    personalBoxes.forEach(function (box) { box.checked = selectedDifficulties.indexOf(box.value) !== -1; });
    personalAll.checked = personalBoxes.every(function (box) { return box.checked; });
    personalDifficulty.addEventListener('change', function (event) {
      if (event.target === personalAll) personalBoxes.forEach(function (box) { box.checked = personalAll.checked; });
      else personalAll.checked = personalBoxes.every(function (box) { return box.checked; });
      el.dataset.difficulties = personalBoxes.filter(function (box) { return box.checked; }).map(function (box) { return box.value; }).join(',');
      renderPersonalList();
    });
  }
  document.getElementById("personal-list").addEventListener("click", function (evt) {
    var nameBtn = evt.target.closest(".boss-name-link[data-boss-id]");
    if (nameBtn) { evt.preventDefault(); viewBossOnPublicLeaderboard(nameBtn.dataset.bossId); return; }
    var viewBtn = evt.target.closest(".view-lb-link[data-fight-key]");
    if (viewBtn) window.dyrelog.openAnalysisFight(viewBtn.dataset.fightKey);
  });

  var lbTabs = document.getElementById("lb-tabs");
  var lbBody = document.getElementById("lb-body");
  var personalBody = document.getElementById("personal-body");
  lbTabs.addEventListener("click", function (e) {
    var btn = e.target.closest(".detail-tab");
    if (!btn) return;
    var view = btn.dataset.view;
    ++fightRequest;
    document.getElementById("fight-body").hidden = true;
    Array.prototype.forEach.call(lbTabs.querySelectorAll(".detail-tab"), function (b) {
      b.classList.toggle("active", b === btn);
    });
    lbBody.hidden = view !== "public";
    personalBody.hidden = view !== "personal";
    if (view === "personal") { renderPersonalList(); scheduleStatusRefresh(); }
  });

  function applyState(data) {
    var before = JSON.stringify(buildPersonalBests(latestState.encounters));
    latestState = data || latestState;
    renderPersonalList();
    if (before !== JSON.stringify(buildPersonalBests(latestState.encounters))) scheduleStatusRefresh();
  }
  window.dyrelog.getState().then(applyState);
  window.dyrelog.onStateUpdate(applyState);
  window.dyrelog.onAuthUpdate(function () {
    ++refreshGeneration;
    submissionRows = null;
    renderPersonalList();
    scheduleStatusRefresh();
  });
  window.addEventListener('focus', scheduleStatusRefresh);
  setInterval(function () { if (!document.hidden && !personalBody.hidden) scheduleStatusRefresh(); }, 30000);

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
