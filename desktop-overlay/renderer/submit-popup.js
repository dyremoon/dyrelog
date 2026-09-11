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

  function showAsk(payload) {
    if (autoCloseTimer) { clearTimeout(autoCloseTimer); autoCloseTimer = null; }
    els.title.textContent = "Submit " + (payload.mobName || "this kill") + "?";
    els.sub.textContent = fmtNum(payload.dps) + " dps · " + fmtAbbrev(payload.damage) + " total damage";
    els.sub.className = "sub";
    clearActions();
    addButton("Discard", "btn-secondary", function () { window.dyrelog.discardSubmit(); });
    addButton("Submit", "btn-primary", function () { window.dyrelog.confirmSubmit(); });
  }

  function showPending(payload) {
    if (autoCloseTimer) { clearTimeout(autoCloseTimer); autoCloseTimer = null; }
    els.title.textContent = "Submitting " + (payload.mobName || "your kill") + "…";
    els.sub.innerHTML = '<span class="spinner"></span>Talking to the leaderboard';
    els.sub.className = "sub";
    clearActions();
  }

  function showNeedsLogin() {
    if (autoCloseTimer) { clearTimeout(autoCloseTimer); autoCloseTimer = null; }
    els.title.textContent = "Log in to submit kills";
    els.sub.textContent = "You're not logged in with Discord yet.";
    els.sub.className = "sub";
    clearActions();
    addButton("Dismiss", "btn-secondary", function () { window.dyrelog.discardSubmit(); });
    addButton("Log In", "btn-primary", function () {
      window.dyrelog.loginWithDiscord();
      window.close();
    });
  }

  function showResult(result) {
    clearActions();
    if (result.ok) {
      els.title.textContent = "Submitted!";
      els.sub.textContent = result.status === "verified" ? "Live on the leaderboard now."
        : result.status === "pending_review" ? "Pending a quick manual review."
        : "Saved to your history.";
      els.sub.className = "sub ok";
      autoCloseTimer = setTimeout(function () { window.close(); }, 2500);
    } else {
      els.title.textContent = "Couldn't submit";
      els.sub.textContent = result.error || "Something went wrong.";
      els.sub.className = "sub err";
      addButton("Dismiss", "btn-secondary", function () { window.close(); });
    }
  }

  window.dyrelog.onSubmitPopupShow(function (payload) {
    if (payload.needsLogin) showNeedsLogin();
    else if (payload.pending) showPending(payload);
    else showAsk(payload);
  });
  window.dyrelog.onSubmitPopupResult(showResult);
})();
