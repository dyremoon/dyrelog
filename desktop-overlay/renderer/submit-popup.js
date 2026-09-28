(function () {
  "use strict";

  var els = {
    title: document.getElementById("title"),
    sub: document.getElementById("sub"),
    actions: document.getElementById("actions")
  };
  var autoCloseTimer = null;

  function fmtNum(n) { return Math.round(n || 0).toLocaleString(); }
  function fmtAbbrev(n) {
    n = Math.max(0, n || 0);
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "m";
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(Math.round(n));
  }

  function clearActions() { els.actions.innerHTML = ""; }
  function addButton(label, cls, onClick) {
    var b = document.createElement("button");
    b.className = cls;
    b.textContent = label;
    b.addEventListener("click", onClick);
    els.actions.appendChild(b);
    return b;
  }

  function waitingText(n) {
    return n > 0 ? " · " + n + " more " + (n === 1 ? "kill" : "kills") + " waiting" : "";
  }

  function showAsk(payload) {
    if (autoCloseTimer) { clearTimeout(autoCloseTimer); autoCloseTimer = null; }
    els.title.textContent = "Submit " + (payload.mobName || "this kill") + "?";
    els.sub.textContent = fmtNum(payload.dps) + " dps · " + fmtAbbrev(payload.damage) + " damage" + waitingText(payload.waiting);
    els.sub.className = "sub";
    clearActions();
    addButton("Discard", "btn-secondary", function () { window.dyrelog.discardSubmit(); });
    addButton("Submit", "btn-primary", function () { window.dyrelog.confirmSubmit(); });
  }

  function showPending(payload) {
    if (autoCloseTimer) { clearTimeout(autoCloseTimer); autoCloseTimer = null; }
    els.title.textContent = "Submitting " + (payload.mobName || "your kill") + "…";
    els.sub.innerHTML = '<span class="spinner"></span>Uploading';
    els.sub.className = "sub";
    clearActions();
  }

  function showNeedsLogin(payload) {
    if (autoCloseTimer) { clearTimeout(autoCloseTimer); autoCloseTimer = null; }
    var n = payload.waiting || 1;
    els.title.textContent = "Log in to submit";
    els.sub.textContent = n > 1
      ? "Log in with Discord to submit your " + n + " kills. They'll wait while you log in."
      : "Log in with Discord to submit this kill. It'll wait while you log in.";
    els.sub.className = "sub";
    clearActions();
    addButton("Not now", "btn-secondary", function () { window.dyrelog.discardSubmit(); });
    addButton("Log in", "btn-primary", function () {
      window.dyrelog.loginWithDiscord();
      window.close();
    });
  }

  function showResult(result) {
    clearActions();
    var next = result.waiting > 0;
    if (result.ok && result.difficultyUnverified) {
      els.title.textContent = "Saved to My Kills";
      els.sub.textContent = "Not on the leaderboard: Dyrelog didn't see which difficulty you zoned into. Keep Dyrelog running when you zone in, and your next kill there will count.";
      els.sub.className = "sub";
      addButton(next ? "Next kill" : "OK", "btn-secondary", function () { window.dyrelog.submitPopupDone(); });
    } else if (result.ok) {
      els.title.textContent = result.title || (result.status === "verified" && result.visibility !== "private" ? "On the leaderboard!" : "Submitted");
      els.sub.textContent = result.message ? result.message
        : result.status === "verified" && result.visibility !== "private" ? "Your kill is live."
        : result.status === "verified" ? "Saved as private. Only you can see it."
        : result.status === "pending_review" || result.status === "flagged" ? "Waiting for review. Check My Kills for the result."
        : "Saved to My Kills.";
      els.sub.className = "sub ok";
      autoCloseTimer = setTimeout(function () { window.dyrelog.submitPopupDone(); }, next ? 1800 : 2500);
    } else {
      els.title.textContent = result.title || "Couldn't submit";
      els.sub.textContent = result.error || "Something went wrong. Try again in a minute.";
      els.sub.className = result.queued ? "sub" : "sub err";
      addButton(next ? "Next kill" : "Close", "btn-secondary", function () { window.dyrelog.submitPopupDone(); });
    }
  }

  window.dyrelog.onSubmitPopupShow(function (payload) {
    if (payload.needsLogin) showNeedsLogin(payload);
    else if (payload.pending) showPending(payload);
    else showAsk(payload);
  });
  window.dyrelog.onSubmitPopupResult(showResult);
})();
